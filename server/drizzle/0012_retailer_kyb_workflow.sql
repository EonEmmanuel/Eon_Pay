CREATE TYPE "public"."retailer_kyb_status" AS ENUM('not_started', 'in_progress', 'in_review', 'resubmission_required', 'provider_approved', 'provider_declined', 'approved', 'rejected');
CREATE TABLE "tenant_kyb_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider" text DEFAULT 'didit' NOT NULL,
	"provider_session_id" text,
	"verification_url" text,
	"status" "retailer_kyb_status" DEFAULT 'not_started' NOT NULL,
	"provider_status" text,
	"decision" jsonb,
	"decision_reason" text,
	"risk_score" integer,
	"submitted_at" timestamp with time zone,
	"provider_completed_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" uuid,
	"review_notes" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_kyb_cases_risk_score_valid" CHECK ("tenant_kyb_cases"."risk_score" is null or ("tenant_kyb_cases"."risk_score" >= 0 and "tenant_kyb_cases"."risk_score" <= 100)),
	CONSTRAINT "tenant_kyb_cases_review_consistent" CHECK (("tenant_kyb_cases"."reviewed_at" is null and "tenant_kyb_cases"."reviewed_by" is null)
        or ("tenant_kyb_cases"."reviewed_at" is not null and "tenant_kyb_cases"."reviewed_by" is not null))
);

ALTER TABLE "tenant_kyb_cases" ADD CONSTRAINT "tenant_kyb_cases_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "tenant_kyb_cases" ADD CONSTRAINT "tenant_kyb_cases_reviewed_by_user_profiles_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "tenant_kyb_cases" ADD CONSTRAINT "tenant_kyb_cases_created_by_user_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;
CREATE UNIQUE INDEX "tenant_kyb_cases_tenant_unique" ON "tenant_kyb_cases" USING btree ("tenant_id");
CREATE UNIQUE INDEX "tenant_kyb_cases_provider_session_unique" ON "tenant_kyb_cases" USING btree ("provider","provider_session_id");
CREATE INDEX "tenant_kyb_cases_status_idx" ON "tenant_kyb_cases" USING btree ("status","updated_at");

INSERT INTO public.permissions (code, description)
VALUES
  ('platform.kyb.read', 'Review retailer KYB evidence and provider decisions'),
  ('platform.kyb.manage', 'Approve, reject, or request retailer KYB resubmission')
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO public.role_permissions (role_id, permission_code)
SELECT role.id, permission.code
FROM public.roles role
JOIN public.permissions permission ON permission.code IN (
  'platform.kyb.read',
  'platform.kyb.manage'
)
WHERE role.key IN ('platform_owner', 'platform_admin', 'platform_compliance')
  AND role.scope = 'platform'
ON CONFLICT DO NOTHING;

CREATE TRIGGER tenant_kyb_cases_set_updated_at
BEFORE UPDATE ON public.tenant_kyb_cases
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tenant_kyb_cases_tenant_immutable
BEFORE UPDATE ON public.tenant_kyb_cases
FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_reassignment();

ALTER TABLE public.tenant_kyb_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_kyb_cases FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_kyb_cases_select ON public.tenant_kyb_cases
FOR SELECT TO app_runtime
USING (
  (tenant_id = public.app_tenant_id() AND public.app_has_permission('tenant.manage'))
  OR public.app_has_platform_permission('platform.kyb.read')
);

CREATE POLICY tenant_kyb_cases_insert ON public.tenant_kyb_cases
FOR INSERT TO app_runtime
WITH CHECK (
  tenant_id = public.app_tenant_id()
  AND created_by = public.app_user_id()
  AND public.app_has_permission('tenant.manage')
);

CREATE POLICY tenant_kyb_cases_update ON public.tenant_kyb_cases
FOR UPDATE TO app_runtime
USING (
  (tenant_id = public.app_tenant_id() AND public.app_has_permission('tenant.manage'))
  OR public.app_has_platform_permission('platform.kyb.manage')
)
WITH CHECK (
  (tenant_id = public.app_tenant_id() AND public.app_has_permission('tenant.manage'))
  OR public.app_has_platform_permission('platform.kyb.manage')
);

CREATE POLICY provider_tenant_kyb_cases_select ON public.tenant_kyb_cases
FOR SELECT TO app_provider
USING (tenant_id = public.app_tenant_id());

CREATE POLICY provider_tenant_kyb_cases_update ON public.tenant_kyb_cases
FOR UPDATE TO app_provider
USING (tenant_id = public.app_tenant_id())
WITH CHECK (tenant_id = public.app_tenant_id());

CREATE POLICY provider_tenants_update_onboarding ON public.tenants
FOR UPDATE TO app_provider
USING (id = public.app_tenant_id())
WITH CHECK (id = public.app_tenant_id());

CREATE POLICY provider_tenants_select_onboarding ON public.tenants
FOR SELECT TO app_provider
USING (id = public.app_tenant_id());

GRANT SELECT, INSERT, UPDATE ON public.tenant_kyb_cases TO app_runtime;
REVOKE DELETE, TRUNCATE, TRIGGER, REFERENCES ON public.tenant_kyb_cases
  FROM app_runtime;
GRANT SELECT, UPDATE ON public.tenant_kyb_cases TO app_provider;
GRANT UPDATE (onboarding_status, updated_at) ON public.tenants TO app_provider;
GRANT SELECT (id, onboarding_status) ON public.tenants TO app_provider;

-- Resolve KYB provider callbacks without trusting tenant identifiers supplied by the webhook body.
CREATE OR REPLACE FUNCTION public.app_resolve_provider_tenant(
  resource_type text,
  provider_name text,
  provider_reference text
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  resolved_tenant uuid;
BEGIN
  CASE resource_type
    WHEN 'payment' THEN
      SELECT tenant_id INTO resolved_tenant
      FROM public.payments payment
      WHERE payment.provider = provider_name
        AND payment.external_reference = provider_reference;
    WHEN 'kyc' THEN
      SELECT tenant_id INTO resolved_tenant
      FROM public.kyc_verification_sessions session
      WHERE session.provider = provider_name
        AND session.provider_session_id = provider_reference;
    WHEN 'kyb' THEN
      SELECT tenant_id INTO resolved_tenant
      FROM public.tenant_kyb_cases kyb_case
      WHERE kyb_case.provider = provider_name
        AND kyb_case.provider_session_id = provider_reference;
    ELSE
      RAISE EXCEPTION 'Unsupported provider resource type'
        USING ERRCODE = '22023';
  END CASE;

  IF resolved_tenant IS NULL THEN
    RAISE EXCEPTION 'Provider resource was not found'
      USING ERRCODE = 'P0002';
  END IF;
  RETURN resolved_tenant;
END
$$;

REVOKE ALL ON FUNCTION public.app_resolve_provider_tenant(text, text, text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_resolve_provider_tenant(text, text, text)
  TO app_provider;
