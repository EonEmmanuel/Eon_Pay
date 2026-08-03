DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    CREATE ROLE app_runtime NOLOGIN NOINHERIT;
  END IF;
END
$$;
-- End of the preceding independently reviewable database operation.

CREATE OR REPLACE FUNCTION public.app_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$;
-- End of the preceding independently reviewable database operation.

CREATE OR REPLACE FUNCTION public.app_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('app.tenant_id', true), '')::uuid
$$;
-- End of the preceding independently reviewable database operation.

CREATE OR REPLACE FUNCTION public.app_is_active_member(target_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_memberships membership
    JOIN public.tenants tenant ON tenant.id = membership.tenant_id
    JOIN public.user_profiles profile ON profile.id = membership.user_id
    WHERE membership.tenant_id = target_tenant_id
      AND membership.user_id = public.app_user_id()
      AND membership.status = 'active'
      AND tenant.active
      AND NOT profile.disabled
  )
$$;
-- End of the preceding independently reviewable database operation.

CREATE OR REPLACE FUNCTION public.app_has_permission(
  requested_permission text,
  target_tenant_id uuid DEFAULT public.app_tenant_id()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.app_is_active_member(target_tenant_id)
    AND EXISTS (
      SELECT 1
      FROM public.tenant_memberships membership
      JOIN public.tenant_member_roles assignment
        ON assignment.tenant_id = membership.tenant_id
       AND assignment.membership_id = membership.id
      JOIN public.roles role ON role.id = assignment.role_id
      JOIN public.role_permissions role_permission
        ON role_permission.role_id = role.id
      WHERE membership.tenant_id = target_tenant_id
        AND membership.user_id = public.app_user_id()
        AND membership.status = 'active'
        AND role.scope = 'tenant'
        AND (role.tenant_id IS NULL OR role.tenant_id = target_tenant_id)
        AND role_permission.permission_code = requested_permission
    )
$$;
-- End of the preceding independently reviewable database operation.

CREATE OR REPLACE FUNCTION public.app_has_platform_permission(
  requested_permission text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_role_assignments assignment
    JOIN public.roles role ON role.id = assignment.role_id
    JOIN public.role_permissions role_permission
      ON role_permission.role_id = role.id
    JOIN public.user_profiles profile ON profile.id = assignment.user_id
    WHERE assignment.user_id = public.app_user_id()
      AND role.scope = 'platform'
      AND role.tenant_id IS NULL
      AND role_permission.permission_code = requested_permission
      AND NOT profile.disabled
  )
$$;
-- End of the preceding independently reviewable database operation.

CREATE OR REPLACE FUNCTION public.app_can_view_user(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT target_user_id = public.app_user_id()
    OR public.app_has_platform_permission('platform.users.manage')
    OR (
      public.app_has_permission('memberships.read')
      AND EXISTS (
        SELECT 1
        FROM public.tenant_memberships membership
        WHERE membership.tenant_id = public.app_tenant_id()
          AND membership.user_id = target_user_id
      )
    )
$$;
-- End of the preceding independently reviewable database operation.

CREATE OR REPLACE FUNCTION public.app_owns_customer(target_customer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.customers customer
    WHERE customer.id = target_customer_id
      AND customer.tenant_id = public.app_tenant_id()
      AND customer.user_id = public.app_user_id()
  )
$$;
-- End of the preceding independently reviewable database operation.

CREATE OR REPLACE FUNCTION public.app_owns_contract(target_contract_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.financing_contracts contract
    JOIN public.customers customer
      ON customer.tenant_id = contract.tenant_id
     AND customer.id = contract.customer_id
    WHERE contract.id = target_contract_id
      AND contract.tenant_id = public.app_tenant_id()
      AND customer.user_id = public.app_user_id()
  )
$$;
-- End of the preceding independently reviewable database operation.

CREATE OR REPLACE FUNCTION public.sync_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'name'
    )
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      display_name = COALESCE(EXCLUDED.display_name, user_profiles.display_name),
      updated_at = now();
  RETURN NEW;
END
$$;
-- End of the preceding independently reviewable database operation.

DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS sync_auth_user_profile ON auth.users';
    EXECUTE 'CREATE TRIGGER sync_auth_user_profile
      AFTER INSERT OR UPDATE OF email, raw_user_meta_data ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.sync_auth_user()';
    EXECUTE 'INSERT INTO public.user_profiles (id, email, display_name)
      SELECT id, email, COALESCE(raw_user_meta_data ->> ''full_name'', raw_user_meta_data ->> ''name'')
      FROM auth.users
      ON CONFLICT (id) DO NOTHING';
  END IF;
END
$$;
-- End of the preceding independently reviewable database operation.

INSERT INTO public.permissions (code, description)
VALUES
  ('branches.read', 'Read tenant branches'),
  ('branches.manage', 'Create and update tenant branches'),
  ('customers.read', 'Read customers'),
  ('customers.create', 'Create customers'),
  ('customers.update', 'Update customers'),
  ('applications.read', 'Read financing applications'),
  ('applications.create', 'Create financing applications'),
  ('applications.submit', 'Submit draft applications'),
  ('applications.review', 'Perform KYC, underwriting, and decisions'),
  ('contracts.read', 'Read contracts'),
  ('contracts.create', 'Convert approved applications to contracts'),
  ('contracts.activate', 'Activate contracts and generate schedules'),
  ('contracts.transition', 'Move active contracts through servicing states'),
  ('installments.read', 'Read repayment schedules'),
  ('payments.read', 'Read payments and allocations'),
  ('payments.record', 'Record new payments'),
  ('payments.settle', 'Settle and allocate payments'),
  ('payments.reverse', 'Reverse settled payments'),
  ('fees.read', 'Read assessed fees'),
  ('fees.assess', 'Assess fees'),
  ('fees.waive', 'Waive fees through reversal entries'),
  ('ledger.read', 'Read ledger accounts and journal entries'),
  ('memberships.read', 'Read tenant memberships and roles'),
  ('memberships.manage', 'Invite, suspend, and assign tenant members'),
  ('audit.read', 'Read tenant audit events'),
  ('tenant.manage', 'Update tenant settings'),
  ('self.contracts.read', 'Read the authenticated customer contracts'),
  ('self.installments.read', 'Read the authenticated customer schedules'),
  ('self.payments.read', 'Read the authenticated customer payments'),
  ('self.fees.read', 'Read the authenticated customer fees'),
  ('platform.tenants.read', 'Read tenants across the platform'),
  ('platform.tenants.create', 'Provision tenants'),
  ('platform.tenants.manage', 'Manage tenants across the platform'),
  ('platform.users.manage', 'Manage platform identities and roles'),
  ('platform.audit.read', 'Read platform-wide audit events')
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;
-- End of the preceding independently reviewable database operation.

INSERT INTO public.roles (id, scope, key, name, system)
VALUES
  ('00000000-0000-4000-8000-000000000001', 'platform', 'platform_owner', 'Platform owner', true),
  ('00000000-0000-4000-8000-000000000002', 'platform', 'platform_admin', 'Platform administrator', true),
  ('00000000-0000-4000-8000-000000000101', 'tenant', 'tenant_owner', 'Tenant owner', true),
  ('00000000-0000-4000-8000-000000000102', 'tenant', 'tenant_admin', 'Tenant administrator', true),
  ('00000000-0000-4000-8000-000000000103', 'tenant', 'branch_manager', 'Branch manager', true),
  ('00000000-0000-4000-8000-000000000104', 'tenant', 'underwriter', 'Underwriter', true),
  ('00000000-0000-4000-8000-000000000105', 'tenant', 'collections_agent', 'Collections agent', true),
  ('00000000-0000-4000-8000-000000000106', 'tenant', 'cashier', 'Cashier', true),
  ('00000000-0000-4000-8000-000000000107', 'tenant', 'support', 'Support', true),
  ('00000000-0000-4000-8000-000000000108', 'tenant', 'customer', 'Customer', true)
ON CONFLICT (id) DO NOTHING;
-- End of the preceding independently reviewable database operation.

INSERT INTO public.role_permissions (role_id, permission_code)
SELECT '00000000-0000-4000-8000-000000000001'::uuid, code
FROM public.permissions
WHERE code LIKE 'platform.%'
ON CONFLICT DO NOTHING;
-- End of the preceding independently reviewable database operation.

INSERT INTO public.role_permissions (role_id, permission_code)
SELECT '00000000-0000-4000-8000-000000000002'::uuid, code
FROM public.permissions
WHERE code IN (
  'platform.tenants.read',
  'platform.tenants.create',
  'platform.tenants.manage',
  'platform.users.manage',
  'platform.audit.read'
)
ON CONFLICT DO NOTHING;
-- End of the preceding independently reviewable database operation.

INSERT INTO public.role_permissions (role_id, permission_code)
SELECT role_id, permission_code
FROM (
  SELECT
    '00000000-0000-4000-8000-000000000101'::uuid AS role_id,
    code AS permission_code
  FROM public.permissions
  WHERE code NOT LIKE 'platform.%'
  UNION ALL
  SELECT '00000000-0000-4000-8000-000000000102'::uuid, code
  FROM public.permissions
  WHERE code NOT LIKE 'platform.%'
    AND code <> 'payments.reverse'
  UNION ALL
  SELECT '00000000-0000-4000-8000-000000000103'::uuid, code
  FROM public.permissions
  WHERE code IN (
    'branches.read', 'customers.read', 'customers.create', 'customers.update',
    'applications.read', 'applications.create', 'applications.submit',
    'applications.review', 'contracts.read', 'contracts.create',
    'contracts.activate', 'contracts.transition', 'installments.read',
    'payments.read', 'payments.record', 'payments.settle', 'fees.read',
    'fees.assess', 'ledger.read', 'memberships.read', 'audit.read'
  )
  UNION ALL
  SELECT '00000000-0000-4000-8000-000000000104'::uuid, code
  FROM public.permissions
  WHERE code IN (
    'branches.read', 'customers.read', 'applications.read',
    'applications.review', 'contracts.read', 'installments.read'
  )
  UNION ALL
  SELECT '00000000-0000-4000-8000-000000000105'::uuid, code
  FROM public.permissions
  WHERE code IN (
    'customers.read', 'contracts.read', 'contracts.transition',
    'installments.read', 'payments.read', 'payments.record',
    'payments.settle', 'fees.read', 'fees.assess', 'ledger.read'
  )
  UNION ALL
  SELECT '00000000-0000-4000-8000-000000000106'::uuid, code
  FROM public.permissions
  WHERE code IN (
    'customers.read', 'contracts.read', 'installments.read',
    'payments.read', 'payments.record', 'payments.settle'
  )
  UNION ALL
  SELECT '00000000-0000-4000-8000-000000000107'::uuid, code
  FROM public.permissions
  WHERE code IN (
    'branches.read', 'customers.read', 'applications.read',
    'contracts.read', 'installments.read', 'payments.read', 'fees.read'
  )
  UNION ALL
  SELECT '00000000-0000-4000-8000-000000000108'::uuid, code
  FROM public.permissions
  WHERE code IN (
    'self.contracts.read',
    'self.installments.read',
    'self.payments.read',
    'self.fees.read'
  )
) grants
ON CONFLICT DO NOTHING;
-- End of the preceding independently reviewable database operation.

ALTER TABLE public.financing_applications
ADD CONSTRAINT applications_converted_contract_fk
FOREIGN KEY (tenant_id, converted_contract_id)
REFERENCES public.financing_contracts (tenant_id, id);
-- End of the preceding independently reviewable database operation.

ALTER TABLE public.fee_assessments
ADD CONSTRAINT fee_subject_matches_reference
CHECK (
  (subject_type = 'application' AND application_id IS NOT NULL AND contract_id IS NULL AND installment_id IS NULL AND payment_id IS NULL)
  OR (subject_type = 'contract' AND application_id IS NULL AND contract_id IS NOT NULL AND installment_id IS NULL AND payment_id IS NULL)
  OR (subject_type = 'installment' AND application_id IS NULL AND contract_id IS NOT NULL AND installment_id IS NOT NULL AND payment_id IS NULL)
  OR (subject_type = 'payment' AND application_id IS NULL AND contract_id IS NOT NULL AND installment_id IS NULL AND payment_id IS NOT NULL)
);
-- End of the preceding independently reviewable database operation.

ALTER TABLE public.payment_allocations
ADD CONSTRAINT allocation_target_matches_reference
CHECK (
  (target_type = 'down_payment' AND contract_id IS NOT NULL AND installment_id IS NULL AND fee_assessment_id IS NULL)
  OR (target_type IN ('installment_principal', 'installment_finance_charge') AND contract_id IS NOT NULL AND installment_id IS NOT NULL AND fee_assessment_id IS NULL)
  OR (target_type = 'fee' AND contract_id IS NOT NULL AND installment_id IS NULL AND fee_assessment_id IS NOT NULL)
  OR (target_type = 'unapplied_credit' AND installment_id IS NULL AND fee_assessment_id IS NULL)
);
-- End of the preceding independently reviewable database operation.

ALTER TABLE public.financing_applications
ADD CONSTRAINT application_lifecycle_metadata_valid
CHECK (
  (status = 'draft' OR submitted_at IS NOT NULL)
  AND (status <> 'approved' OR (approved_terms IS NOT NULL AND kyc_status = 'verified' AND decision_outcome = 'approved' AND decided_by IS NOT NULL AND decided_at IS NOT NULL))
  AND (status <> 'rejected' OR (decision_outcome = 'rejected' AND decided_by IS NOT NULL AND decided_at IS NOT NULL))
  AND (converted_contract_id IS NULL OR status = 'approved')
);
-- End of the preceding independently reviewable database operation.

ALTER TABLE public.financing_contracts
ADD CONSTRAINT contract_lifecycle_metadata_valid
CHECK (
  (status NOT IN ('active', 'past_due', 'suspended', 'completed', 'terminated', 'written_off') OR signed_at IS NOT NULL)
  AND (status NOT IN ('active', 'past_due', 'suspended', 'completed', 'written_off') OR activated_at IS NOT NULL)
  AND (status <> 'completed' OR completed_at IS NOT NULL)
  AND (status <> 'terminated' OR terminated_at IS NOT NULL)
  AND (status NOT IN ('active', 'past_due', 'suspended', 'completed', 'written_off') OR (device ->> 'imei') ~ '^[0-9]{15}$')
);
-- End of the preceding independently reviewable database operation.

ALTER TABLE public.payments
ADD CONSTRAINT payment_lifecycle_metadata_valid
CHECK (
  (status <> 'settled' OR (settled_at IS NOT NULL AND ledger_entry_id IS NOT NULL))
  AND (status <> 'failed' OR (failed_at IS NOT NULL AND failure_code IS NOT NULL))
  AND (status <> 'reversed' OR (reversed_at IS NOT NULL AND ledger_entry_id IS NOT NULL AND reversal_entry_id IS NOT NULL))
);
-- End of the preceding independently reviewable database operation.

ALTER TABLE public.fee_assessments
ADD CONSTRAINT fee_lifecycle_metadata_valid
CHECK (
  (status <> 'waived' OR (waived_at IS NOT NULL AND waived_by IS NOT NULL AND waiver_reason IS NOT NULL AND waiver_entry_id IS NOT NULL))
  AND (status <> 'reversed' OR (reversed_at IS NOT NULL AND reversal_entry_id IS NOT NULL))
);
-- End of the preceding independently reviewable database operation.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$;
-- End of the preceding independently reviewable database operation.

CREATE TRIGGER tenants_set_updated_at BEFORE UPDATE ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER branches_set_updated_at BEFORE UPDATE ON public.branches
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON public.user_profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER customers_set_updated_at BEFORE UPDATE ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER roles_set_updated_at BEFORE UPDATE ON public.roles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER memberships_set_updated_at BEFORE UPDATE ON public.tenant_memberships
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER applications_set_updated_at BEFORE UPDATE ON public.financing_applications
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER contracts_set_updated_at BEFORE UPDATE ON public.financing_contracts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER payments_set_updated_at BEFORE UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER ledger_accounts_set_updated_at BEFORE UPDATE ON public.ledger_accounts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
-- End of the preceding independently reviewable database operation.

CREATE OR REPLACE FUNCTION public.reject_immutable_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% rows are immutable; post a reversal or correction row', TG_TABLE_NAME
    USING ERRCODE = '55000';
END
$$;
-- End of the preceding independently reviewable database operation.

CREATE TRIGGER installments_are_immutable
BEFORE UPDATE OR DELETE ON public.installments
FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();
CREATE TRIGGER payment_allocations_are_immutable
BEFORE UPDATE OR DELETE ON public.payment_allocations
FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();
CREATE TRIGGER journal_entries_are_immutable
BEFORE UPDATE OR DELETE ON public.journal_entries
FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();
CREATE TRIGGER journal_lines_are_immutable
BEFORE UPDATE OR DELETE ON public.journal_lines
FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();
CREATE TRIGGER audit_events_are_immutable
BEFORE UPDATE OR DELETE ON public.audit_events
FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();
-- End of the preceding independently reviewable database operation.

CREATE OR REPLACE FUNCTION public.protect_active_contract_terms()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IN ('active', 'past_due', 'suspended', 'completed', 'terminated', 'written_off')
     AND (
       NEW.device IS DISTINCT FROM OLD.device
       OR NEW.currency IS DISTINCT FROM OLD.currency
       OR NEW.device_cash_price IS DISTINCT FROM OLD.device_cash_price
       OR NEW.down_payment IS DISTINCT FROM OLD.down_payment
       OR NEW.financed_principal IS DISTINCT FROM OLD.financed_principal
       OR NEW.finance_charge IS DISTINCT FROM OLD.finance_charge
       OR NEW.installment_count IS DISTINCT FROM OLD.installment_count
       OR NEW.repayment_frequency IS DISTINCT FROM OLD.repayment_frequency
       OR NEW.first_due_date IS DISTINCT FROM OLD.first_due_date
       OR NEW.grace_period_days IS DISTINCT FROM OLD.grace_period_days
     )
  THEN
    RAISE EXCEPTION 'Active contract terms and device snapshot are immutable'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END
$$;
-- End of the preceding independently reviewable database operation.

CREATE TRIGGER protect_active_contract_terms
BEFORE UPDATE ON public.financing_contracts
FOR EACH ROW EXECUTE FUNCTION public.protect_active_contract_terms();
-- End of the preceding independently reviewable database operation.

CREATE OR REPLACE FUNCTION public.validate_domain_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  transition_allowed boolean;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  transition_allowed := CASE TG_TABLE_NAME
    WHEN 'financing_applications' THEN CASE OLD.status
      WHEN 'draft' THEN NEW.status IN ('submitted', 'cancelled')
      WHEN 'submitted' THEN NEW.status IN ('kyc_review', 'cancelled', 'expired')
      WHEN 'kyc_review' THEN NEW.status IN ('credit_review', 'rejected', 'cancelled', 'expired')
      WHEN 'credit_review' THEN NEW.status IN ('approved', 'rejected', 'cancelled', 'expired')
      ELSE false
    END
    WHEN 'financing_contracts' THEN CASE OLD.status
      WHEN 'draft' THEN NEW.status IN ('pending_signature', 'cancelled')
      WHEN 'pending_signature' THEN NEW.status IN ('active', 'cancelled')
      WHEN 'active' THEN NEW.status IN ('past_due', 'suspended', 'completed', 'terminated', 'written_off')
      WHEN 'past_due' THEN NEW.status IN ('active', 'suspended', 'completed', 'terminated', 'written_off')
      WHEN 'suspended' THEN NEW.status IN ('active', 'past_due', 'terminated', 'written_off')
      ELSE false
    END
    WHEN 'payments' THEN CASE OLD.status
      WHEN 'initiated' THEN NEW.status IN ('pending', 'settled', 'failed', 'cancelled')
      WHEN 'pending' THEN NEW.status IN ('settled', 'failed', 'cancelled')
      WHEN 'settled' THEN NEW.status = 'reversed'
      ELSE false
    END
    WHEN 'fee_assessments' THEN
      OLD.status = 'assessed' AND NEW.status IN ('waived', 'reversed')
    ELSE false
  END;

  IF NOT transition_allowed THEN
    RAISE EXCEPTION 'Invalid % status transition from % to %',
      TG_TABLE_NAME, OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
-- End of the preceding independently reviewable database operation.

CREATE TRIGGER application_transition_guard
BEFORE UPDATE ON public.financing_applications
FOR EACH ROW EXECUTE FUNCTION public.validate_domain_transition();
CREATE TRIGGER contract_transition_guard
BEFORE UPDATE ON public.financing_contracts
FOR EACH ROW EXECUTE FUNCTION public.validate_domain_transition();
CREATE TRIGGER payment_transition_guard
BEFORE UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.validate_domain_transition();
CREATE TRIGGER fee_transition_guard
BEFORE UPDATE ON public.fee_assessments
FOR EACH ROW EXECUTE FUNCTION public.validate_domain_transition();
-- End of the preceding independently reviewable database operation.

CREATE OR REPLACE FUNCTION public.prevent_tenant_reassignment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'tenant_id is immutable'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
-- End of the preceding independently reviewable database operation.

CREATE TRIGGER branches_tenant_immutable BEFORE UPDATE ON public.branches
FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_reassignment();
CREATE TRIGGER customers_tenant_immutable BEFORE UPDATE ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_reassignment();
CREATE TRIGGER memberships_tenant_immutable BEFORE UPDATE ON public.tenant_memberships
FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_reassignment();
CREATE TRIGGER applications_tenant_immutable BEFORE UPDATE ON public.financing_applications
FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_reassignment();
CREATE TRIGGER contracts_tenant_immutable BEFORE UPDATE ON public.financing_contracts
FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_reassignment();
CREATE TRIGGER payments_tenant_immutable BEFORE UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_reassignment();
CREATE TRIGGER fees_tenant_immutable BEFORE UPDATE ON public.fee_assessments
FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_reassignment();
CREATE TRIGGER ledger_accounts_tenant_immutable BEFORE UPDATE ON public.ledger_accounts
FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_reassignment();
-- End of the preceding independently reviewable database operation.

CREATE OR REPLACE FUNCTION public.validate_role_assignment_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  assigned_scope public.role_scope;
  assigned_tenant uuid;
BEGIN
  SELECT scope, tenant_id INTO assigned_scope, assigned_tenant
  FROM public.roles WHERE id = NEW.role_id;

  IF TG_TABLE_NAME = 'tenant_member_roles' THEN
    IF assigned_scope <> 'tenant' OR (assigned_tenant IS NOT NULL AND assigned_tenant <> NEW.tenant_id) THEN
      RAISE EXCEPTION 'Tenant membership can only receive a compatible tenant role';
    END IF;
  ELSIF assigned_scope <> 'platform' OR assigned_tenant IS NOT NULL THEN
    RAISE EXCEPTION 'Platform assignment requires a global platform role';
  END IF;
  RETURN NEW;
END
$$;
-- End of the preceding independently reviewable database operation.

CREATE TRIGGER validate_tenant_role_assignment
BEFORE INSERT OR UPDATE ON public.tenant_member_roles
FOR EACH ROW EXECUTE FUNCTION public.validate_role_assignment_scope();
CREATE TRIGGER validate_platform_role_assignment
BEFORE INSERT OR UPDATE ON public.platform_role_assignments
FOR EACH ROW EXECUTE FUNCTION public.validate_role_assignment_scope();
-- End of the preceding independently reviewable database operation.

CREATE OR REPLACE FUNCTION public.assert_journal_balanced()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_entry_id uuid;
  line_count integer;
  debit_total numeric;
  credit_total numeric;
BEGIN
  IF TG_TABLE_NAME = 'journal_entries' THEN
    target_entry_id := NEW.id;
  ELSE
    target_entry_id := COALESCE(NEW.journal_entry_id, OLD.journal_entry_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.journal_entries WHERE id = target_entry_id) THEN
    RETURN NULL;
  END IF;

  SELECT
    count(*),
    COALESCE(sum(amount) FILTER (WHERE side = 'debit'), 0),
    COALESCE(sum(amount) FILTER (WHERE side = 'credit'), 0)
  INTO line_count, debit_total, credit_total
  FROM public.journal_lines
  WHERE journal_entry_id = target_entry_id;

  IF line_count < 2 OR debit_total <> credit_total THEN
    RAISE EXCEPTION 'Journal entry % is not balanced (lines %, debits %, credits %)',
      target_entry_id, line_count, debit_total, credit_total
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END
$$;
-- End of the preceding independently reviewable database operation.

CREATE CONSTRAINT TRIGGER journal_entry_balance_on_entry
AFTER INSERT ON public.journal_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.assert_journal_balanced();
CREATE CONSTRAINT TRIGGER journal_entry_balance_on_lines
AFTER INSERT OR UPDATE OR DELETE ON public.journal_lines
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.assert_journal_balanced();
-- End of the preceding independently reviewable database operation.

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches FORCE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_member_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_member_roles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.platform_role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_role_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.financing_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financing_applications FORCE ROW LEVEL SECURITY;
ALTER TABLE public.financing_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financing_contracts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_allocations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fee_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_assessments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries FORCE ROW LEVEL SECURITY;
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_records FORCE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events FORCE ROW LEVEL SECURITY;
-- End of the preceding independently reviewable database operation.

CREATE POLICY user_profiles_select ON public.user_profiles
FOR SELECT TO app_runtime USING (public.app_can_view_user(id));
CREATE POLICY user_profiles_update ON public.user_profiles
FOR UPDATE TO app_runtime
USING (id = public.app_user_id() OR public.app_has_platform_permission('platform.users.manage'))
WITH CHECK (id = public.app_user_id() OR public.app_has_platform_permission('platform.users.manage'));

CREATE POLICY tenants_select ON public.tenants
FOR SELECT TO app_runtime
USING (
  public.app_is_active_member(id)
  OR public.app_has_platform_permission('platform.tenants.read')
);
CREATE POLICY tenants_insert ON public.tenants
FOR INSERT TO app_runtime
WITH CHECK (public.app_has_platform_permission('platform.tenants.create'));
CREATE POLICY tenants_update ON public.tenants
FOR UPDATE TO app_runtime
USING (
  public.app_has_platform_permission('platform.tenants.manage')
  OR (id = public.app_tenant_id() AND public.app_has_permission('tenant.manage'))
)
WITH CHECK (
  public.app_has_platform_permission('platform.tenants.manage')
  OR (id = public.app_tenant_id() AND public.app_has_permission('tenant.manage'))
);

CREATE POLICY branches_select ON public.branches
FOR SELECT TO app_runtime
USING (tenant_id = public.app_tenant_id() AND public.app_is_active_member(tenant_id));
CREATE POLICY branches_insert ON public.branches
FOR INSERT TO app_runtime
WITH CHECK (
  (tenant_id = public.app_tenant_id() AND public.app_has_permission('branches.manage'))
  OR public.app_has_platform_permission('platform.tenants.create')
);
CREATE POLICY branches_update ON public.branches
FOR UPDATE TO app_runtime
USING (tenant_id = public.app_tenant_id() AND public.app_has_permission('branches.manage'))
WITH CHECK (tenant_id = public.app_tenant_id() AND public.app_has_permission('branches.manage'));

CREATE POLICY customers_select ON public.customers
FOR SELECT TO app_runtime
USING (tenant_id = public.app_tenant_id() AND public.app_has_permission('customers.read'));
CREATE POLICY customers_insert ON public.customers
FOR INSERT TO app_runtime
WITH CHECK (tenant_id = public.app_tenant_id() AND public.app_has_permission('customers.create'));
CREATE POLICY customers_update ON public.customers
FOR UPDATE TO app_runtime
USING (tenant_id = public.app_tenant_id() AND public.app_has_permission('customers.update'))
WITH CHECK (tenant_id = public.app_tenant_id() AND public.app_has_permission('customers.update'));

CREATE POLICY permissions_select ON public.permissions
FOR SELECT TO app_runtime USING (public.app_user_id() IS NOT NULL);
CREATE POLICY roles_select ON public.roles
FOR SELECT TO app_runtime
USING (
  system
  OR tenant_id = public.app_tenant_id()
  OR public.app_has_platform_permission('platform.users.manage')
);
CREATE POLICY roles_insert ON public.roles
FOR INSERT TO app_runtime
WITH CHECK (
  scope = 'tenant'
  AND tenant_id = public.app_tenant_id()
  AND public.app_has_permission('memberships.manage')
);
CREATE POLICY roles_update ON public.roles
FOR UPDATE TO app_runtime
USING (
  NOT system
  AND tenant_id = public.app_tenant_id()
  AND public.app_has_permission('memberships.manage')
)
WITH CHECK (
  NOT system
  AND tenant_id = public.app_tenant_id()
  AND public.app_has_permission('memberships.manage')
);
CREATE POLICY role_permissions_select ON public.role_permissions
FOR SELECT TO app_runtime USING (public.app_user_id() IS NOT NULL);
CREATE POLICY role_permissions_insert ON public.role_permissions
FOR INSERT TO app_runtime
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.roles role
    WHERE role.id = role_id
      AND NOT role.system
      AND role.tenant_id = public.app_tenant_id()
  )
  AND public.app_has_permission('memberships.manage')
);

CREATE POLICY memberships_select ON public.tenant_memberships
FOR SELECT TO app_runtime
USING (
  tenant_id = public.app_tenant_id()
  AND (
    user_id = public.app_user_id()
    OR public.app_has_permission('memberships.read')
  )
);
CREATE POLICY memberships_insert ON public.tenant_memberships
FOR INSERT TO app_runtime
WITH CHECK (
  (tenant_id = public.app_tenant_id() AND public.app_has_permission('memberships.manage'))
  OR public.app_has_platform_permission('platform.tenants.create')
);
CREATE POLICY memberships_update ON public.tenant_memberships
FOR UPDATE TO app_runtime
USING (
  tenant_id = public.app_tenant_id()
  AND public.app_has_permission('memberships.manage')
)
WITH CHECK (
  tenant_id = public.app_tenant_id()
  AND public.app_has_permission('memberships.manage')
);

CREATE POLICY member_roles_select ON public.tenant_member_roles
FOR SELECT TO app_runtime
USING (
  tenant_id = public.app_tenant_id()
  AND (
    public.app_has_permission('memberships.read')
    OR EXISTS (
      SELECT 1 FROM public.tenant_memberships membership
      WHERE membership.id = membership_id
        AND membership.user_id = public.app_user_id()
    )
  )
);
CREATE POLICY member_roles_insert ON public.tenant_member_roles
FOR INSERT TO app_runtime
WITH CHECK (
  (tenant_id = public.app_tenant_id() AND public.app_has_permission('memberships.manage'))
  OR public.app_has_platform_permission('platform.tenants.create')
);

CREATE POLICY platform_roles_select ON public.platform_role_assignments
FOR SELECT TO app_runtime
USING (
  user_id = public.app_user_id()
  OR public.app_has_platform_permission('platform.users.manage')
);
CREATE POLICY platform_roles_insert ON public.platform_role_assignments
FOR INSERT TO app_runtime
WITH CHECK (public.app_has_platform_permission('platform.users.manage'));

CREATE POLICY applications_select ON public.financing_applications
FOR SELECT TO app_runtime
USING (
  tenant_id = public.app_tenant_id()
  AND (
    public.app_has_permission('applications.read')
    OR public.app_has_permission('applications.review')
    OR public.app_has_permission('contracts.create')
  )
);
CREATE POLICY applications_insert ON public.financing_applications
FOR INSERT TO app_runtime
WITH CHECK (tenant_id = public.app_tenant_id() AND public.app_has_permission('applications.create'));
CREATE POLICY applications_update ON public.financing_applications
FOR UPDATE TO app_runtime
USING (
  tenant_id = public.app_tenant_id()
  AND (
    public.app_has_permission('applications.submit')
    OR public.app_has_permission('applications.review')
    OR public.app_has_permission('contracts.create')
  )
)
WITH CHECK (tenant_id = public.app_tenant_id());

CREATE POLICY contracts_select ON public.financing_contracts
FOR SELECT TO app_runtime
USING (
  tenant_id = public.app_tenant_id()
  AND (
    public.app_has_permission('contracts.read')
    OR public.app_has_permission('contracts.activate')
    OR public.app_has_permission('contracts.transition')
    OR public.app_has_permission('payments.settle')
    OR (
      public.app_has_permission('self.contracts.read')
      AND public.app_owns_customer(customer_id)
    )
  )
);
CREATE POLICY contracts_insert ON public.financing_contracts
FOR INSERT TO app_runtime
WITH CHECK (tenant_id = public.app_tenant_id() AND public.app_has_permission('contracts.create'));
CREATE POLICY contracts_update ON public.financing_contracts
FOR UPDATE TO app_runtime
USING (
  tenant_id = public.app_tenant_id()
  AND (
    public.app_has_permission('contracts.activate')
    OR public.app_has_permission('contracts.transition')
  )
)
WITH CHECK (tenant_id = public.app_tenant_id());

CREATE POLICY installments_select ON public.installments
FOR SELECT TO app_runtime
USING (
  tenant_id = public.app_tenant_id()
  AND (
    public.app_has_permission('installments.read')
    OR public.app_has_permission('payments.settle')
    OR (
      public.app_has_permission('self.installments.read')
      AND public.app_owns_contract(contract_id)
    )
  )
);
CREATE POLICY installments_insert ON public.installments
FOR INSERT TO app_runtime
WITH CHECK (tenant_id = public.app_tenant_id() AND public.app_has_permission('contracts.activate'));

CREATE POLICY payments_select ON public.payments
FOR SELECT TO app_runtime
USING (
  tenant_id = public.app_tenant_id()
  AND (
    public.app_has_permission('payments.read')
    OR public.app_has_permission('payments.settle')
    OR public.app_has_permission('payments.reverse')
    OR (
      public.app_has_permission('self.payments.read')
      AND public.app_owns_customer(customer_id)
    )
  )
);
CREATE POLICY payments_insert ON public.payments
FOR INSERT TO app_runtime
WITH CHECK (tenant_id = public.app_tenant_id() AND public.app_has_permission('payments.record'));
CREATE POLICY payments_update ON public.payments
FOR UPDATE TO app_runtime
USING (
  tenant_id = public.app_tenant_id()
  AND (
    public.app_has_permission('payments.settle')
    OR public.app_has_permission('payments.reverse')
  )
)
WITH CHECK (tenant_id = public.app_tenant_id());

CREATE POLICY allocations_select ON public.payment_allocations
FOR SELECT TO app_runtime
USING (tenant_id = public.app_tenant_id() AND public.app_has_permission('payments.read'));
CREATE POLICY allocations_insert ON public.payment_allocations
FOR INSERT TO app_runtime
WITH CHECK (tenant_id = public.app_tenant_id() AND public.app_has_permission('payments.settle'));

CREATE POLICY fees_select ON public.fee_assessments
FOR SELECT TO app_runtime
USING (
  tenant_id = public.app_tenant_id()
  AND (
    public.app_has_permission('fees.read')
    OR public.app_has_permission('fees.waive')
    OR public.app_has_permission('payments.settle')
    OR (
      public.app_has_permission('self.fees.read')
      AND contract_id IS NOT NULL
      AND public.app_owns_contract(contract_id)
    )
  )
);
CREATE POLICY fees_insert ON public.fee_assessments
FOR INSERT TO app_runtime
WITH CHECK (tenant_id = public.app_tenant_id() AND public.app_has_permission('fees.assess'));
CREATE POLICY fees_update ON public.fee_assessments
FOR UPDATE TO app_runtime
USING (
  tenant_id = public.app_tenant_id()
  AND public.app_has_permission('fees.waive')
)
WITH CHECK (tenant_id = public.app_tenant_id());

CREATE POLICY ledger_accounts_select ON public.ledger_accounts
FOR SELECT TO app_runtime
USING (tenant_id = public.app_tenant_id() AND public.app_is_active_member(tenant_id));
CREATE POLICY ledger_accounts_insert ON public.ledger_accounts
FOR INSERT TO app_runtime
WITH CHECK (
  (tenant_id = public.app_tenant_id() AND public.app_has_permission('tenant.manage'))
  OR public.app_has_platform_permission('platform.tenants.create')
);
CREATE POLICY ledger_accounts_update ON public.ledger_accounts
FOR UPDATE TO app_runtime
USING (tenant_id = public.app_tenant_id() AND public.app_has_permission('tenant.manage'))
WITH CHECK (tenant_id = public.app_tenant_id() AND public.app_has_permission('tenant.manage'));

CREATE POLICY journal_entries_select ON public.journal_entries
FOR SELECT TO app_runtime
USING (
  tenant_id = public.app_tenant_id()
  AND (
    public.app_has_permission('ledger.read')
    OR public.app_has_permission('payments.reverse')
    OR public.app_has_permission('fees.waive')
  )
);
CREATE POLICY journal_entries_insert ON public.journal_entries
FOR INSERT TO app_runtime
WITH CHECK (
  tenant_id = public.app_tenant_id()
  AND (
    public.app_has_permission('payments.settle')
    OR public.app_has_permission('payments.reverse')
    OR public.app_has_permission('fees.assess')
    OR public.app_has_permission('fees.waive')
  )
);
CREATE POLICY journal_lines_select ON public.journal_lines
FOR SELECT TO app_runtime
USING (
  tenant_id = public.app_tenant_id()
  AND (
    public.app_has_permission('ledger.read')
    OR public.app_has_permission('payments.reverse')
    OR public.app_has_permission('fees.waive')
  )
);
CREATE POLICY journal_lines_insert ON public.journal_lines
FOR INSERT TO app_runtime
WITH CHECK (
  tenant_id = public.app_tenant_id()
  AND (
    public.app_has_permission('payments.settle')
    OR public.app_has_permission('payments.reverse')
    OR public.app_has_permission('fees.assess')
    OR public.app_has_permission('fees.waive')
  )
);

CREATE POLICY idempotency_select ON public.idempotency_records
FOR SELECT TO app_runtime
USING (tenant_id = public.app_tenant_id() AND public.app_is_active_member(tenant_id));
CREATE POLICY idempotency_insert ON public.idempotency_records
FOR INSERT TO app_runtime
WITH CHECK (tenant_id = public.app_tenant_id() AND public.app_is_active_member(tenant_id));

CREATE POLICY audit_select ON public.audit_events
FOR SELECT TO app_runtime
USING (
  (tenant_id = public.app_tenant_id() AND public.app_has_permission('audit.read'))
  OR (tenant_id IS NULL AND public.app_has_platform_permission('platform.audit.read'))
);
CREATE POLICY audit_insert ON public.audit_events
FOR INSERT TO app_runtime
WITH CHECK (
  actor_user_id = public.app_user_id()
  AND (
    (tenant_id = public.app_tenant_id() AND public.app_is_active_member(tenant_id))
    OR (tenant_id IS NULL AND public.app_user_id() IS NOT NULL)
  )
);
-- End of the preceding independently reviewable database operation.

REVOKE ALL ON FUNCTION public.app_user_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_tenant_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_is_active_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_has_permission(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_has_platform_permission(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_can_view_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_owns_customer(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_owns_contract(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_auth_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_journal_balanced() FROM PUBLIC;

GRANT USAGE ON SCHEMA public TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO app_runtime;
REVOKE DELETE, TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM app_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime;
GRANT EXECUTE ON FUNCTION public.app_user_id() TO app_runtime;
GRANT EXECUTE ON FUNCTION public.app_tenant_id() TO app_runtime;
GRANT EXECUTE ON FUNCTION public.app_is_active_member(uuid) TO app_runtime;
GRANT EXECUTE ON FUNCTION public.app_has_permission(text, uuid) TO app_runtime;
GRANT EXECUTE ON FUNCTION public.app_has_platform_permission(text) TO app_runtime;
GRANT EXECUTE ON FUNCTION public.app_can_view_user(uuid) TO app_runtime;
GRANT EXECUTE ON FUNCTION public.app_owns_customer(uuid) TO app_runtime;
GRANT EXECUTE ON FUNCTION public.app_owns_contract(uuid) TO app_runtime;
-- End of the preceding independently reviewable database operation.

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT SELECT, INSERT, UPDATE ON TABLES TO app_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT USAGE, SELECT ON SEQUENCES TO app_runtime;
