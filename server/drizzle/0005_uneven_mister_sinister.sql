CREATE TABLE "platform_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_settings_version_positive" CHECK ("platform_settings"."version" > 0)
);

ALTER TABLE "tenants" ADD COLUMN "archived_at" timestamp with time zone;
ALTER TABLE "tenants" ADD COLUMN "archived_by" uuid;
ALTER TABLE "tenants" ADD COLUMN "archive_reason" text;
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_updated_by_user_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_archived_by_user_profiles_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_archive_consistent" CHECK (("tenants"."archived_at" is null
            and "tenants"."archived_by" is null
            and "tenants"."archive_reason" is null)
          or ("tenants"."archived_at" is not null
            and "tenants"."archived_by" is not null
            and "tenants"."archive_reason" is not null
            and length(btrim("tenants"."archive_reason")) >= 3
            and "tenants"."active" = false));
-- Platform configuration is mutable only through explicitly authorized platform administration.
CREATE TRIGGER platform_settings_set_updated_at
BEFORE UPDATE ON public.platform_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings FORCE ROW LEVEL SECURITY;

CREATE POLICY platform_settings_select ON public.platform_settings
FOR SELECT TO app_runtime
USING (public.app_has_platform_permission('platform.tenants.read'));

CREATE POLICY platform_settings_insert ON public.platform_settings
FOR INSERT TO app_runtime
WITH CHECK (public.app_has_platform_permission('platform.tenants.manage'));

CREATE POLICY platform_settings_update ON public.platform_settings
FOR UPDATE TO app_runtime
USING (public.app_has_platform_permission('platform.tenants.manage'))
WITH CHECK (public.app_has_platform_permission('platform.tenants.manage'));

GRANT SELECT, INSERT, UPDATE ON public.platform_settings TO app_runtime;
REVOKE DELETE, TRUNCATE, TRIGGER, REFERENCES ON public.platform_settings FROM app_runtime;

-- Archiving revokes unused invitations so a stale email cannot reactivate a retired retailer.
DROP POLICY tenant_invitations_update ON public.tenant_invitations;
CREATE POLICY tenant_invitations_update ON public.tenant_invitations
FOR UPDATE TO app_runtime
USING (
  (
    tenant_id = public.app_tenant_id()
    AND public.app_has_permission('memberships.manage')
  )
  OR public.app_has_platform_permission('platform.tenants.create')
  OR public.app_has_platform_permission('platform.tenants.manage')
)
WITH CHECK (
  (
    tenant_id = public.app_tenant_id()
    AND public.app_has_permission('memberships.manage')
  )
  OR public.app_has_platform_permission('platform.tenants.create')
  OR public.app_has_platform_permission('platform.tenants.manage')
);

-- The platform dashboard exposes aggregate business metrics without granting raw cross-tenant table access.
CREATE OR REPLACE FUNCTION public.app_platform_analytics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.app_has_platform_permission('platform.tenants.read') THEN
    RAISE EXCEPTION 'Platform analytics permission required'
      USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'generatedAt', now(),
    'summary', jsonb_build_object(
      'tenants', (SELECT count(*) FROM public.tenants),
      'activeTenants', (SELECT count(*) FROM public.tenants WHERE active AND archived_at IS NULL),
      'archivedTenants', (SELECT count(*) FROM public.tenants WHERE archived_at IS NOT NULL),
      'customers', (SELECT count(*) FROM public.customers),
      'contracts', (SELECT count(*) FROM public.financing_contracts),
      'activeContracts', (SELECT count(*) FROM public.financing_contracts WHERE status = 'active'),
      'overdueContracts', (
        SELECT count(*)
        FROM public.financing_contracts contract
        WHERE contract.status IN ('delinquent', 'defaulted')
          OR EXISTS (
            SELECT 1
            FROM public.installments installment
            WHERE installment.contract_id = contract.id
              AND installment.due_date < current_date
              AND (
                installment.principal_due + installment.finance_charge_due
                - COALESCE((
                  SELECT sum(allocation.amount)
                  FROM public.payment_allocations allocation
                  WHERE allocation.installment_id = installment.id
                ), 0)
              ) > 0
          )
      ),
      'financedVolume', COALESCE((SELECT sum(financed_principal) FROM public.financing_contracts), 0),
      'collectedVolume', COALESCE((SELECT sum(amount) FROM public.payments WHERE status = 'settled'), 0),
      'pendingApplications', (
        SELECT count(*) FROM public.financing_applications
        WHERE status IN ('submitted', 'kyc_review', 'credit_review')
      ),
      'managedDevices', (SELECT count(*) FROM public.managed_devices),
      'restrictedDevices', (SELECT count(*) FROM public.managed_devices WHERE status = 'restricted')
    ),
    'tenants', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', tenant.id,
          'name', tenant.name,
          'slug', tenant.slug,
          'active', tenant.active,
          'onboardingStatus', tenant.onboarding_status,
          'archivedAt', tenant.archived_at,
          'archiveReason', tenant.archive_reason,
          'createdAt', tenant.created_at,
          'branches', (SELECT count(*) FROM public.branches branch WHERE branch.tenant_id = tenant.id),
          'members', (SELECT count(*) FROM public.tenant_memberships membership WHERE membership.tenant_id = tenant.id AND membership.status = 'active'),
          'customers', (SELECT count(*) FROM public.customers customer WHERE customer.tenant_id = tenant.id),
          'contracts', (SELECT count(*) FROM public.financing_contracts contract WHERE contract.tenant_id = tenant.id),
          'activeContracts', (SELECT count(*) FROM public.financing_contracts contract WHERE contract.tenant_id = tenant.id AND contract.status = 'active'),
          'overdueContracts', (
            SELECT count(*)
            FROM public.financing_contracts contract
            WHERE contract.tenant_id = tenant.id
              AND (
                contract.status IN ('delinquent', 'defaulted')
                OR EXISTS (
                  SELECT 1
                  FROM public.installments installment
                  WHERE installment.tenant_id = tenant.id
                    AND installment.contract_id = contract.id
                    AND installment.due_date < current_date
                    AND (
                      installment.principal_due + installment.finance_charge_due
                      - COALESCE((
                        SELECT sum(allocation.amount)
                        FROM public.payment_allocations allocation
                        WHERE allocation.tenant_id = tenant.id
                          AND allocation.installment_id = installment.id
                      ), 0)
                    ) > 0
                )
              )
          ),
          'financedVolume', COALESCE((SELECT sum(financed_principal) FROM public.financing_contracts contract WHERE contract.tenant_id = tenant.id), 0),
          'collectedVolume', COALESCE((SELECT sum(amount) FROM public.payments payment WHERE payment.tenant_id = tenant.id AND payment.status = 'settled'), 0),
          'pendingApplications', (
            SELECT count(*) FROM public.financing_applications application
            WHERE application.tenant_id = tenant.id
              AND application.status IN ('submitted', 'kyc_review', 'credit_review')
          ),
          'managedDevices', (SELECT count(*) FROM public.managed_devices device WHERE device.tenant_id = tenant.id),
          'restrictedDevices', (SELECT count(*) FROM public.managed_devices device WHERE device.tenant_id = tenant.id AND device.status = 'restricted')
        ) ORDER BY tenant.name
      )
      FROM public.tenants tenant
    ), '[]'::jsonb),
    'monthly', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'month', to_char(month_start, 'Mon YY'),
          'financed', COALESCE((
            SELECT sum(contract.financed_principal)
            FROM public.financing_contracts contract
            WHERE date_trunc('month', contract.created_at) = month_start
          ), 0),
          'collected', COALESCE((
            SELECT sum(payment.amount)
            FROM public.payments payment
            WHERE payment.status = 'settled'
              AND date_trunc('month', payment.settled_at) = month_start
          ), 0)
        ) ORDER BY month_start
      )
      FROM generate_series(
        date_trunc('month', now()) - interval '11 months',
        date_trunc('month', now()),
        interval '1 month'
      ) month_start
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END
$$;

REVOKE ALL ON FUNCTION public.app_platform_analytics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_platform_analytics() TO app_runtime;