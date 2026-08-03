CREATE TABLE public.tenant_business_profiles (
  tenant_id uuid PRIMARY KEY NOT NULL,
  legal_name text NOT NULL,
  trading_name text,
  legal_form public.business_legal_form NOT NULL,
  registration_number text NOT NULL,
  tax_identification_number text NOT NULL,
  country_code text DEFAULT 'CM' NOT NULL,
  registered_address_line_1 text NOT NULL,
  registered_address_line_2 text,
  city text NOT NULL,
  region text,
  postal_code text,
  contact_email text NOT NULL,
  contact_phone text NOT NULL,
  website_url text,
  incorporation_date date,
  base_currency text DEFAULT 'XAF' NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT tenant_business_profiles_country_code_format
    CHECK (country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT tenant_business_profiles_base_currency_format
    CHECK (base_currency ~ '^[A-Z]{3}$'),
  CONSTRAINT tenant_business_profiles_contact_phone_format
    CHECK (contact_phone ~ '^\+[1-9][0-9]{7,14}$'),
  CONSTRAINT tenant_business_profiles_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES public.tenants (id),
  CONSTRAINT tenant_business_profiles_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES public.user_profiles (id)
);

CREATE UNIQUE INDEX tenant_business_profiles_registration_unique
  ON public.tenant_business_profiles (registration_number);
CREATE UNIQUE INDEX tenant_business_profiles_tax_identifier_unique
  ON public.tenant_business_profiles (tax_identification_number);

CREATE TRIGGER tenant_business_profiles_set_updated_at
BEFORE UPDATE ON public.tenant_business_profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tenant_business_profiles_tenant_immutable
BEFORE UPDATE ON public.tenant_business_profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_reassignment();

ALTER TABLE public.tenant_business_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_business_profiles FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_business_profiles_select
ON public.tenant_business_profiles
FOR SELECT TO app_runtime
USING (
  (tenant_id = public.app_tenant_id() AND public.app_has_permission('tenant.manage'))
  OR public.app_has_platform_permission('platform.tenants.read')
);

CREATE POLICY tenant_business_profiles_insert
ON public.tenant_business_profiles
FOR INSERT TO app_runtime
WITH CHECK (
  tenant_id = public.app_tenant_id()
  AND updated_by = public.app_user_id()
  AND public.app_has_permission('tenant.manage')
);

CREATE POLICY tenant_business_profiles_update
ON public.tenant_business_profiles
FOR UPDATE TO app_runtime
USING (
  tenant_id = public.app_tenant_id()
  AND public.app_has_permission('tenant.manage')
)
WITH CHECK (
  tenant_id = public.app_tenant_id()
  AND updated_by = public.app_user_id()
  AND public.app_has_permission('tenant.manage')
);

GRANT SELECT, INSERT, UPDATE ON public.tenant_business_profiles TO app_runtime;
REVOKE DELETE, TRUNCATE, TRIGGER, REFERENCES
  ON public.tenant_business_profiles FROM app_runtime;

-- Advance newly accepted retailer owners to business-profile setup after the invitation function enables their tenant.
CREATE OR REPLACE FUNCTION public.advance_retailer_owner_onboarding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.status = 'pending'
    AND NEW.status = 'accepted'
    AND NEW.role_id = '00000000-0000-4000-8000-000000000101'::uuid THEN
    UPDATE public.tenants
    SET onboarding_status = 'business_profile_required',
        updated_at = now()
    WHERE id = NEW.tenant_id
      AND onboarding_status = 'active'
      AND NOT EXISTS (
        SELECT 1
        FROM public.tenant_business_profiles profile
        WHERE profile.tenant_id = NEW.tenant_id
      );
  END IF;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.advance_retailer_owner_onboarding() FROM PUBLIC;

CREATE TRIGGER tenant_invitation_advance_owner_onboarding
AFTER UPDATE OF status ON public.tenant_invitations
FOR EACH ROW EXECUTE FUNCTION public.advance_retailer_owner_onboarding();
