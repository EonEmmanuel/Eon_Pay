CREATE TABLE "tenant_invitation_branches" (
  "tenant_id" uuid NOT NULL,
  "invitation_id" uuid NOT NULL,
  "branch_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "tenant_invitation_branches_pk" PRIMARY KEY("tenant_id", "invitation_id", "branch_id")
);

CREATE TABLE "tenant_membership_branches" (
  "tenant_id" uuid NOT NULL,
  "membership_id" uuid NOT NULL,
  "branch_id" uuid NOT NULL,
  "assigned_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "tenant_membership_branches_pk" PRIMARY KEY("tenant_id", "membership_id", "branch_id")
);

ALTER TABLE public.customers ADD COLUMN branch_id uuid;
ALTER TABLE public.tenant_invitations
  ADD COLUMN all_branches boolean NOT NULL DEFAULT true;
ALTER TABLE public.tenant_memberships
  ADD COLUMN all_branches boolean NOT NULL DEFAULT true;
ALTER TABLE public.tenant_invitations ALTER COLUMN all_branches SET DEFAULT false;
ALTER TABLE public.tenant_memberships ALTER COLUMN all_branches SET DEFAULT false;

INSERT INTO public.branches (tenant_id, code, name, active)
SELECT tenant.id, 'MAIN', 'Main branch', true
FROM public.tenants tenant
WHERE NOT EXISTS (
  SELECT 1 FROM public.branches branch WHERE branch.tenant_id = tenant.id
);
UPDATE public.tenant_memberships membership
SET all_branches = false
WHERE EXISTS (
  SELECT 1
  FROM public.tenant_member_roles assignment
  JOIN public.roles role ON role.id = assignment.role_id
  WHERE assignment.tenant_id = membership.tenant_id
    AND assignment.membership_id = membership.id
    AND role.key IN ('branch_manager', 'cashier')
)
AND NOT EXISTS (
  SELECT 1
  FROM public.tenant_member_roles assignment
  JOIN public.roles role ON role.id = assignment.role_id
  WHERE assignment.tenant_id = membership.tenant_id
    AND assignment.membership_id = membership.id
    AND role.key IN ('tenant_owner', 'tenant_admin')
);

INSERT INTO public.tenant_membership_branches (
  tenant_id,
  membership_id,
  branch_id,
  assigned_by
)
SELECT
  membership.tenant_id,
  membership.id,
  branch.id,
  membership.user_id
FROM public.tenant_memberships membership
JOIN LATERAL (
  SELECT candidate.id
  FROM public.branches candidate
  WHERE candidate.tenant_id = membership.tenant_id
    AND candidate.active
  ORDER BY candidate.created_at, candidate.id
  LIMIT 1
) branch ON true
WHERE NOT membership.all_branches
ON CONFLICT DO NOTHING;

UPDATE public.tenant_invitations invitation
SET all_branches = false
FROM public.roles role
WHERE role.id = invitation.role_id
  AND invitation.status = 'pending'
  AND role.key IN ('branch_manager', 'cashier');

INSERT INTO public.tenant_invitation_branches (
  tenant_id,
  invitation_id,
  branch_id
)
SELECT
  invitation.tenant_id,
  invitation.id,
  branch.id
FROM public.tenant_invitations invitation
JOIN LATERAL (
  SELECT candidate.id
  FROM public.branches candidate
  WHERE candidate.tenant_id = invitation.tenant_id
    AND candidate.active
  ORDER BY candidate.created_at, candidate.id
  LIMIT 1
) branch ON true
WHERE NOT invitation.all_branches
ON CONFLICT DO NOTHING;

UPDATE public.customers customer
SET branch_id = COALESCE(
  (
    SELECT application.branch_id
    FROM public.financing_applications application
    WHERE application.tenant_id = customer.tenant_id
      AND application.customer_id = customer.id
    ORDER BY application.created_at, application.id
    LIMIT 1
  ),
  (
    SELECT contract.branch_id
    FROM public.financing_contracts contract
    WHERE contract.tenant_id = customer.tenant_id
      AND contract.customer_id = customer.id
    ORDER BY contract.created_at, contract.id
    LIMIT 1
  ),
  (
    SELECT branch.id
    FROM public.branches branch
    WHERE branch.tenant_id = customer.tenant_id
    ORDER BY branch.active DESC, branch.created_at, branch.id
    LIMIT 1
  )
)
WHERE customer.branch_id IS NULL;

ALTER TABLE public.customers ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE public.tenant_invitation_branches
  ADD CONSTRAINT tenant_invitation_branches_invitation_fk
  FOREIGN KEY (tenant_id, invitation_id)
  REFERENCES public.tenant_invitations (tenant_id, id);
ALTER TABLE public.tenant_invitation_branches
  ADD CONSTRAINT tenant_invitation_branches_branch_fk
  FOREIGN KEY (tenant_id, branch_id)
  REFERENCES public.branches (tenant_id, id);
ALTER TABLE public.tenant_membership_branches
  ADD CONSTRAINT tenant_membership_branches_assigned_by_user_profiles_id_fk
  FOREIGN KEY (assigned_by) REFERENCES public.user_profiles (id);
ALTER TABLE public.tenant_membership_branches
  ADD CONSTRAINT tenant_membership_branches_membership_fk
  FOREIGN KEY (tenant_id, membership_id)
  REFERENCES public.tenant_memberships (tenant_id, id);
ALTER TABLE public.tenant_membership_branches
  ADD CONSTRAINT tenant_membership_branches_branch_fk
  FOREIGN KEY (tenant_id, branch_id)
  REFERENCES public.branches (tenant_id, id);
ALTER TABLE public.customers
  ADD CONSTRAINT customers_branch_fk
  FOREIGN KEY (tenant_id, branch_id)
  REFERENCES public.branches (tenant_id, id);
CREATE INDEX tenant_invitation_branches_branch_idx
  ON public.tenant_invitation_branches (tenant_id, branch_id);
CREATE INDEX tenant_membership_branches_branch_idx
  ON public.tenant_membership_branches (tenant_id, branch_id);
CREATE INDEX customers_tenant_branch_idx
  ON public.customers (tenant_id, branch_id);

INSERT INTO public.permissions (code, description)
VALUES ('tenant.owners.manage', 'Invite and administer retailer owners')
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO public.role_permissions (role_id, permission_code)
VALUES (
  '00000000-0000-4000-8000-000000000101'::uuid,
  'tenant.owners.manage'
)
ON CONFLICT DO NOTHING;

DELETE FROM public.role_permissions
WHERE role_id = '00000000-0000-4000-8000-000000000103'::uuid
  AND permission_code IN ('payments.reconcile', 'memberships.read', 'audit.read');

CREATE OR REPLACE FUNCTION public.app_has_all_branch_access(
  target_tenant_id uuid DEFAULT public.app_tenant_id()
)
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
      AND membership.all_branches
      AND tenant.active
      AND NOT profile.disabled
  )
$$;

CREATE OR REPLACE FUNCTION public.app_can_access_branch(
  target_branch_id uuid,
  target_tenant_id uuid DEFAULT public.app_tenant_id()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.app_is_active_member(target_tenant_id)
    AND (
      public.app_has_all_branch_access(target_tenant_id)
      OR EXISTS (
        SELECT 1
        FROM public.tenant_memberships membership
        JOIN public.tenant_membership_branches access
          ON access.tenant_id = membership.tenant_id
         AND access.membership_id = membership.id
        WHERE membership.tenant_id = target_tenant_id
          AND membership.user_id = public.app_user_id()
          AND membership.status = 'active'
          AND NOT membership.all_branches
          AND access.branch_id = target_branch_id
      )
    )
$$;

CREATE OR REPLACE FUNCTION public.app_can_access_customer(
  target_customer_id uuid,
  target_tenant_id uuid DEFAULT public.app_tenant_id()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.customers customer
    WHERE customer.tenant_id = target_tenant_id
      AND customer.id = target_customer_id
      AND public.app_can_access_branch(customer.branch_id, target_tenant_id)
  )
$$;

CREATE OR REPLACE FUNCTION public.app_can_access_application(
  target_application_id uuid,
  target_tenant_id uuid DEFAULT public.app_tenant_id()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.financing_applications application
    WHERE application.tenant_id = target_tenant_id
      AND application.id = target_application_id
      AND public.app_can_access_branch(application.branch_id, target_tenant_id)
  )
$$;

CREATE OR REPLACE FUNCTION public.app_can_access_contract(
  target_contract_id uuid,
  target_tenant_id uuid DEFAULT public.app_tenant_id()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.financing_contracts contract
    WHERE contract.tenant_id = target_tenant_id
      AND contract.id = target_contract_id
      AND public.app_can_access_branch(contract.branch_id, target_tenant_id)
  )
$$;

CREATE OR REPLACE FUNCTION public.app_can_access_payment(
  target_payment_id uuid,
  target_tenant_id uuid DEFAULT public.app_tenant_id()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.payments payment
    WHERE payment.tenant_id = target_tenant_id
      AND payment.id = target_payment_id
      AND (
        (payment.contract_id IS NOT NULL
          AND public.app_can_access_contract(payment.contract_id, target_tenant_id))
        OR (payment.contract_id IS NULL
          AND public.app_can_access_customer(payment.customer_id, target_tenant_id))
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.app_can_access_journal_entry(
  target_entry_id uuid,
  target_tenant_id uuid DEFAULT public.app_tenant_id()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.app_has_all_branch_access(target_tenant_id)
    OR EXISTS (
      SELECT 1
      FROM public.journal_lines line
      WHERE line.tenant_id = target_tenant_id
        AND line.journal_entry_id = target_entry_id
        AND (
          (line.contract_id IS NOT NULL
            AND public.app_can_access_contract(line.contract_id, target_tenant_id))
          OR (line.payment_id IS NOT NULL
            AND public.app_can_access_payment(line.payment_id, target_tenant_id))
          OR (line.customer_id IS NOT NULL
            AND public.app_can_access_customer(line.customer_id, target_tenant_id))
        )
    )
$$;

ALTER TABLE public.tenant_invitation_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_invitation_branches FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_membership_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_membership_branches FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_invitation_branches_select
ON public.tenant_invitation_branches
FOR SELECT TO app_runtime
USING (
  tenant_id = public.app_tenant_id()
  AND public.app_has_permission('memberships.read')
);
CREATE POLICY tenant_invitation_branches_insert
ON public.tenant_invitation_branches
FOR INSERT TO app_runtime
WITH CHECK (
  tenant_id = public.app_tenant_id()
  AND public.app_has_permission('memberships.manage')
);
CREATE POLICY tenant_membership_branches_select
ON public.tenant_membership_branches
FOR SELECT TO app_runtime
USING (
  tenant_id = public.app_tenant_id()
  AND (
    public.app_has_permission('memberships.read')
    OR EXISTS (
      SELECT 1
      FROM public.tenant_memberships membership
      WHERE membership.tenant_id = tenant_membership_branches.tenant_id
        AND membership.id = tenant_membership_branches.membership_id
        AND membership.user_id = public.app_user_id()
    )
  )
);

DROP POLICY IF EXISTS branches_select ON public.branches;
CREATE POLICY branches_select ON public.branches
FOR SELECT TO app_runtime
USING (
  tenant_id = public.app_tenant_id()
  AND public.app_is_active_member(tenant_id)
  AND (
    public.app_can_access_branch(id, tenant_id)
    OR public.app_has_permission('self.applications.create')
  )
);

DROP POLICY IF EXISTS customers_select ON public.customers;
DROP POLICY IF EXISTS customers_insert ON public.customers;
DROP POLICY IF EXISTS customers_update ON public.customers;
CREATE POLICY customers_select ON public.customers
FOR SELECT TO app_runtime
USING (
  tenant_id = public.app_tenant_id()
  AND public.app_has_permission('customers.read')
  AND public.app_can_access_branch(branch_id, tenant_id)
);
CREATE POLICY customers_self_select ON public.customers
FOR SELECT TO app_runtime
USING (
  tenant_id = public.app_tenant_id()
  AND user_id = public.app_user_id()
  AND public.app_is_active_member(tenant_id)
);
CREATE POLICY customers_insert ON public.customers
FOR INSERT TO app_runtime
WITH CHECK (
  tenant_id = public.app_tenant_id()
  AND public.app_has_permission('customers.create')
  AND public.app_can_access_branch(branch_id, tenant_id)
  AND EXISTS (
    SELECT 1 FROM public.branches branch
    WHERE branch.tenant_id = customers.tenant_id
      AND branch.id = customers.branch_id
      AND branch.active
  )
);
CREATE POLICY customers_update ON public.customers
FOR UPDATE TO app_runtime
USING (
  tenant_id = public.app_tenant_id()
  AND public.app_has_permission('customers.update')
  AND public.app_can_access_branch(branch_id, tenant_id)
)
WITH CHECK (
  tenant_id = public.app_tenant_id()
  AND public.app_has_permission('customers.update')
  AND public.app_can_access_branch(branch_id, tenant_id)
);

DROP POLICY IF EXISTS applications_select ON public.financing_applications;
DROP POLICY IF EXISTS applications_insert ON public.financing_applications;
DROP POLICY IF EXISTS applications_update ON public.financing_applications;
CREATE POLICY applications_select ON public.financing_applications
FOR SELECT TO app_runtime
USING (
  tenant_id = public.app_tenant_id()
  AND public.app_can_access_branch(branch_id, tenant_id)
  AND (
    public.app_has_permission('applications.read')
    OR public.app_has_permission('applications.review')
    OR public.app_has_permission('contracts.create')
  )
);
CREATE POLICY applications_insert ON public.financing_applications
FOR INSERT TO app_runtime
WITH CHECK (
  tenant_id = public.app_tenant_id()
  AND public.app_has_permission('applications.create')
  AND public.app_can_access_branch(branch_id, tenant_id)
  AND EXISTS (
    SELECT 1 FROM public.branches branch
    WHERE branch.tenant_id = financing_applications.tenant_id
      AND branch.id = financing_applications.branch_id
      AND branch.active
  )
);
DROP POLICY IF EXISTS applications_self_insert ON public.financing_applications;
CREATE POLICY applications_self_insert ON public.financing_applications
FOR INSERT TO app_runtime
WITH CHECK (
  tenant_id = public.app_tenant_id()
  AND public.app_has_permission('self.applications.create')
  AND EXISTS (
    SELECT 1
    FROM public.customers customer
    WHERE customer.id = financing_applications.customer_id
      AND customer.tenant_id = financing_applications.tenant_id
      AND customer.user_id = public.app_user_id()
  )
  AND EXISTS (
    SELECT 1 FROM public.branches branch
    WHERE branch.tenant_id = financing_applications.tenant_id
      AND branch.id = financing_applications.branch_id
      AND branch.active
  )
);
CREATE POLICY applications_update ON public.financing_applications
FOR UPDATE TO app_runtime
USING (
  tenant_id = public.app_tenant_id()
  AND public.app_can_access_branch(branch_id, tenant_id)
  AND (
    public.app_has_permission('applications.submit')
    OR public.app_has_permission('applications.review')
    OR public.app_has_permission('contracts.create')
  )
)
WITH CHECK (
  tenant_id = public.app_tenant_id()
  AND public.app_can_access_branch(branch_id, tenant_id)
);

DROP POLICY IF EXISTS contracts_select ON public.financing_contracts;
DROP POLICY IF EXISTS contracts_insert ON public.financing_contracts;
DROP POLICY IF EXISTS contracts_update ON public.financing_contracts;
CREATE POLICY contracts_select ON public.financing_contracts
FOR SELECT TO app_runtime
USING (
  tenant_id = public.app_tenant_id()
  AND (
    (
      public.app_can_access_branch(branch_id, tenant_id)
      AND (
        public.app_has_permission('contracts.read')
        OR public.app_has_permission('contracts.activate')
        OR public.app_has_permission('contracts.transition')
        OR public.app_has_permission('payments.settle')
      )
    )
    OR (
      public.app_has_permission('self.contracts.read')
      AND public.app_owns_customer(customer_id)
    )
  )
);
CREATE POLICY contracts_insert ON public.financing_contracts
FOR INSERT TO app_runtime
WITH CHECK (
  tenant_id = public.app_tenant_id()
  AND public.app_has_permission('contracts.create')
  AND public.app_can_access_branch(branch_id, tenant_id)
);
CREATE POLICY contracts_update ON public.financing_contracts
FOR UPDATE TO app_runtime
USING (
  tenant_id = public.app_tenant_id()
  AND public.app_can_access_branch(branch_id, tenant_id)
  AND (
    public.app_has_permission('contracts.activate')
    OR public.app_has_permission('contracts.transition')
  )
)
WITH CHECK (
  tenant_id = public.app_tenant_id()
  AND public.app_can_access_branch(branch_id, tenant_id)
);

DROP POLICY IF EXISTS installments_select ON public.installments;
CREATE POLICY installments_select ON public.installments
FOR SELECT TO app_runtime
USING (
  tenant_id = public.app_tenant_id()
  AND (
    (
      public.app_can_access_contract(contract_id, tenant_id)
      AND (
        public.app_has_permission('installments.read')
        OR public.app_has_permission('payments.settle')
      )
    )
    OR (
      public.app_has_permission('self.installments.read')
      AND public.app_owns_contract(contract_id)
    )
  )
);

DROP POLICY IF EXISTS payments_select ON public.payments;
DROP POLICY IF EXISTS payments_insert ON public.payments;
DROP POLICY IF EXISTS payments_update ON public.payments;
CREATE POLICY payments_select ON public.payments
FOR SELECT TO app_runtime
USING (
  tenant_id = public.app_tenant_id()
  AND (
    (
      public.app_can_access_payment(id, tenant_id)
      AND (
        public.app_has_permission('payments.read')
        OR public.app_has_permission('payments.settle')
        OR public.app_has_permission('payments.reverse')
      )
    )
    OR (
      public.app_has_permission('self.payments.read')
      AND public.app_owns_customer(customer_id)
    )
  )
);
CREATE POLICY payments_insert ON public.payments
FOR INSERT TO app_runtime
WITH CHECK (
  tenant_id = public.app_tenant_id()
  AND public.app_has_permission('payments.record')
  AND (
    (contract_id IS NOT NULL AND public.app_can_access_contract(contract_id, tenant_id))
    OR (contract_id IS NULL AND public.app_can_access_customer(customer_id, tenant_id))
  )
);
CREATE POLICY payments_update ON public.payments
FOR UPDATE TO app_runtime
USING (
  tenant_id = public.app_tenant_id()
  AND public.app_can_access_payment(id, tenant_id)
  AND (
    public.app_has_permission('payments.settle')
    OR public.app_has_permission('payments.reverse')
  )
)
WITH CHECK (tenant_id = public.app_tenant_id());

DROP POLICY IF EXISTS allocations_select ON public.payment_allocations;
DROP POLICY IF EXISTS allocations_insert ON public.payment_allocations;
CREATE POLICY allocations_select ON public.payment_allocations
FOR SELECT TO app_runtime
USING (
  tenant_id = public.app_tenant_id()
  AND public.app_has_permission('payments.read')
  AND public.app_can_access_payment(payment_id, tenant_id)
);
CREATE POLICY allocations_insert ON public.payment_allocations
FOR INSERT TO app_runtime
WITH CHECK (
  tenant_id = public.app_tenant_id()
  AND public.app_has_permission('payments.settle')
  AND public.app_can_access_payment(payment_id, tenant_id)
);
DROP POLICY IF EXISTS fees_select ON public.fee_assessments;
DROP POLICY IF EXISTS fees_insert ON public.fee_assessments;
DROP POLICY IF EXISTS fees_update ON public.fee_assessments;
CREATE POLICY fees_select ON public.fee_assessments
FOR SELECT TO app_runtime
USING (
  tenant_id = public.app_tenant_id()
  AND (
    (
      public.app_has_permission('fees.read')
      AND (
        (application_id IS NOT NULL AND public.app_can_access_application(application_id, tenant_id))
        OR (contract_id IS NOT NULL AND public.app_can_access_contract(contract_id, tenant_id))
        OR (payment_id IS NOT NULL AND public.app_can_access_payment(payment_id, tenant_id))
      )
    )
    OR (
      public.app_has_permission('self.fees.read')
      AND contract_id IS NOT NULL
      AND public.app_owns_contract(contract_id)
    )
  )
);
CREATE POLICY fees_insert ON public.fee_assessments
FOR INSERT TO app_runtime
WITH CHECK (
  tenant_id = public.app_tenant_id()
  AND public.app_has_permission('fees.assess')
  AND (
    (application_id IS NOT NULL AND public.app_can_access_application(application_id, tenant_id))
    OR (contract_id IS NOT NULL AND public.app_can_access_contract(contract_id, tenant_id))
    OR (payment_id IS NOT NULL AND public.app_can_access_payment(payment_id, tenant_id))
  )
);
CREATE POLICY fees_update ON public.fee_assessments
FOR UPDATE TO app_runtime
USING (
  tenant_id = public.app_tenant_id()
  AND public.app_has_permission('fees.waive')
  AND (
    (application_id IS NOT NULL AND public.app_can_access_application(application_id, tenant_id))
    OR (contract_id IS NOT NULL AND public.app_can_access_contract(contract_id, tenant_id))
    OR (payment_id IS NOT NULL AND public.app_can_access_payment(payment_id, tenant_id))
  )
)
WITH CHECK (tenant_id = public.app_tenant_id());

DROP POLICY IF EXISTS journal_entries_select ON public.journal_entries;
DROP POLICY IF EXISTS journal_lines_select ON public.journal_lines;
CREATE POLICY journal_entries_select ON public.journal_entries
FOR SELECT TO app_runtime
USING (
  tenant_id = public.app_tenant_id()
  AND (
    public.app_has_permission('ledger.read')
    OR public.app_has_permission('payments.reverse')
    OR public.app_has_permission('fees.waive')
  )
  AND public.app_can_access_journal_entry(id, tenant_id)
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
  AND (
    public.app_has_all_branch_access(tenant_id)
    OR (contract_id IS NOT NULL AND public.app_can_access_contract(contract_id, tenant_id))
    OR (payment_id IS NOT NULL AND public.app_can_access_payment(payment_id, tenant_id))
    OR (customer_id IS NOT NULL AND public.app_can_access_customer(customer_id, tenant_id))
  )
);

DROP POLICY IF EXISTS documents_select ON public.documents;
DROP POLICY IF EXISTS documents_insert ON public.documents;
DROP POLICY IF EXISTS documents_update ON public.documents;
CREATE POLICY documents_select ON public.documents
FOR SELECT TO app_runtime
USING (
  tenant_id = public.app_tenant_id()
  AND (
    (
      public.app_has_permission('documents.read')
      AND (
        (customer_id IS NOT NULL AND public.app_can_access_customer(customer_id, tenant_id))
        OR (application_id IS NOT NULL AND public.app_can_access_application(application_id, tenant_id))
      )
    )
    OR (
      public.app_has_permission('self.documents.manage')
      AND (
        (customer_id IS NOT NULL AND public.app_owns_customer(customer_id))
        OR (application_id IS NOT NULL AND public.app_owns_application(application_id))
      )
    )
  )
);
CREATE POLICY documents_insert ON public.documents
FOR INSERT TO app_runtime
WITH CHECK (
  tenant_id = public.app_tenant_id()
  AND (
    (
      public.app_has_permission('documents.manage')
      AND (
        (customer_id IS NOT NULL AND public.app_can_access_customer(customer_id, tenant_id))
        OR (application_id IS NOT NULL AND public.app_can_access_application(application_id, tenant_id))
      )
    )
    OR (
      public.app_has_permission('self.documents.manage')
      AND (
        (customer_id IS NOT NULL AND public.app_owns_customer(customer_id))
        OR (application_id IS NOT NULL AND public.app_owns_application(application_id))
      )
    )
  )
);
CREATE POLICY documents_update ON public.documents
FOR UPDATE TO app_runtime
USING (
  tenant_id = public.app_tenant_id()
  AND (
    (
      public.app_has_permission('documents.manage')
      AND (
        (customer_id IS NOT NULL AND public.app_can_access_customer(customer_id, tenant_id))
        OR (application_id IS NOT NULL AND public.app_can_access_application(application_id, tenant_id))
      )
    )
    OR (
      public.app_has_permission('self.documents.manage')
      AND status IN ('requested', 'uploading')
      AND (
        (customer_id IS NOT NULL AND public.app_owns_customer(customer_id))
        OR (application_id IS NOT NULL AND public.app_owns_application(application_id))
      )
    )
  )
)
WITH CHECK (tenant_id = public.app_tenant_id());

DROP POLICY IF EXISTS kyc_sessions_select ON public.kyc_verification_sessions;
DROP POLICY IF EXISTS kyc_sessions_insert ON public.kyc_verification_sessions;
DROP POLICY IF EXISTS kyc_sessions_update ON public.kyc_verification_sessions;
CREATE POLICY kyc_sessions_select ON public.kyc_verification_sessions
FOR SELECT TO app_runtime
USING (
  tenant_id = public.app_tenant_id()
  AND (
    (
      public.app_has_permission('kyc.read')
      AND public.app_can_access_application(application_id, tenant_id)
    )
    OR (
      public.app_has_permission('self.kyc.manage')
      AND public.app_owns_application(application_id)
    )
  )
);
CREATE POLICY kyc_sessions_insert ON public.kyc_verification_sessions
FOR INSERT TO app_runtime
WITH CHECK (
  tenant_id = public.app_tenant_id()
  AND (
    (
      public.app_has_permission('kyc.manage')
      AND public.app_can_access_application(application_id, tenant_id)
    )
    OR (
      public.app_has_permission('self.kyc.manage')
      AND public.app_owns_application(application_id)
    )
  )
);
CREATE POLICY kyc_sessions_update ON public.kyc_verification_sessions
FOR UPDATE TO app_runtime
USING (
  tenant_id = public.app_tenant_id()
  AND public.app_has_permission('kyc.manage')
  AND public.app_can_access_application(application_id, tenant_id)
)
WITH CHECK (tenant_id = public.app_tenant_id());

DROP POLICY IF EXISTS managed_devices_select ON public.managed_devices;
DROP POLICY IF EXISTS managed_devices_insert ON public.managed_devices;
DROP POLICY IF EXISTS managed_devices_update ON public.managed_devices;
CREATE POLICY managed_devices_select ON public.managed_devices
FOR SELECT TO app_runtime
USING (
  tenant_id = public.app_tenant_id()
  AND (
    (
      public.app_has_permission('devices.read')
      AND public.app_can_access_contract(contract_id, tenant_id)
    )
    OR (
      public.app_has_permission('self.devices.read')
      AND public.app_owns_contract(contract_id)
    )
  )
);
CREATE POLICY managed_devices_insert ON public.managed_devices
FOR INSERT TO app_runtime
WITH CHECK (
  tenant_id = public.app_tenant_id()
  AND public.app_has_permission('devices.manage')
  AND public.app_can_access_contract(contract_id, tenant_id)
);
CREATE POLICY managed_devices_update ON public.managed_devices
FOR UPDATE TO app_runtime
USING (
  tenant_id = public.app_tenant_id()
  AND public.app_has_permission('devices.manage')
  AND public.app_can_access_contract(contract_id, tenant_id)
)
WITH CHECK (tenant_id = public.app_tenant_id());

DROP POLICY IF EXISTS mdm_commands_select ON public.mdm_commands;
DROP POLICY IF EXISTS mdm_commands_insert ON public.mdm_commands;
DROP POLICY IF EXISTS mdm_commands_update ON public.mdm_commands;
CREATE POLICY mdm_commands_select ON public.mdm_commands
FOR SELECT TO app_runtime
USING (
  tenant_id = public.app_tenant_id()
  AND EXISTS (
    SELECT 1
    FROM public.managed_devices device
    WHERE device.tenant_id = mdm_commands.tenant_id
      AND device.id = mdm_commands.managed_device_id
      AND (
        (
          public.app_has_permission('devices.read')
          AND public.app_can_access_contract(device.contract_id, tenant_id)
        )
        OR (
          public.app_has_permission('self.devices.read')
          AND public.app_owns_contract(device.contract_id)
        )
      )
  )
);
CREATE POLICY mdm_commands_insert ON public.mdm_commands
FOR INSERT TO app_runtime
WITH CHECK (
  tenant_id = public.app_tenant_id()
  AND public.app_has_permission('devices.manage')
  AND EXISTS (
    SELECT 1
    FROM public.managed_devices device
    WHERE device.tenant_id = mdm_commands.tenant_id
      AND device.id = mdm_commands.managed_device_id
      AND public.app_can_access_contract(device.contract_id, tenant_id)
  )
);
CREATE POLICY mdm_commands_update ON public.mdm_commands
FOR UPDATE TO app_runtime
USING (
  tenant_id = public.app_tenant_id()
  AND public.app_has_permission('devices.manage')
  AND EXISTS (
    SELECT 1
    FROM public.managed_devices device
    WHERE device.tenant_id = mdm_commands.tenant_id
      AND device.id = mdm_commands.managed_device_id
      AND public.app_can_access_contract(device.contract_id, tenant_id)
  )
)
WITH CHECK (tenant_id = public.app_tenant_id());
CREATE OR REPLACE FUNCTION public.app_assert_membership_scope(
  target_membership_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  membership_record public.tenant_memberships%ROWTYPE;
  role_count integer;
  has_global_role boolean;
  has_branch_required_role boolean;
  has_customer_role boolean;
  active_branch_count integer;
  assigned_branch_count integer;
BEGIN
  SELECT membership.* INTO membership_record
  FROM public.tenant_memberships membership
  WHERE membership.id = target_membership_id;

  IF membership_record.id IS NULL OR membership_record.status <> 'active' THEN
    RETURN;
  END IF;

  SELECT
    count(*)::integer,
    COALESCE(bool_or(role.key IN ('tenant_owner', 'tenant_admin')), false),
    COALESCE(bool_or(role.key IN ('branch_manager', 'cashier')), false),
    COALESCE(bool_or(role.key = 'customer'), false)
  INTO role_count, has_global_role, has_branch_required_role, has_customer_role
  FROM public.tenant_member_roles assignment
  JOIN public.roles role ON role.id = assignment.role_id
  WHERE assignment.tenant_id = membership_record.tenant_id
    AND assignment.membership_id = membership_record.id;

  IF role_count = 0 THEN
    RAISE EXCEPTION 'An active membership must have at least one role'
      USING ERRCODE = '23514';
  END IF;

  IF has_customer_role AND role_count > 1 THEN
    RAISE EXCEPTION 'The customer role cannot be combined with staff roles'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*)::integer INTO assigned_branch_count
  FROM public.tenant_membership_branches access
  WHERE access.tenant_id = membership_record.tenant_id
    AND access.membership_id = membership_record.id;

  SELECT count(*)::integer INTO active_branch_count
  FROM public.tenant_membership_branches access
  JOIN public.branches branch
    ON branch.tenant_id = access.tenant_id
   AND branch.id = access.branch_id
  WHERE access.tenant_id = membership_record.tenant_id
    AND access.membership_id = membership_record.id
    AND branch.active;

  IF has_customer_role THEN
    IF membership_record.all_branches OR assigned_branch_count > 0 THEN
      RAISE EXCEPTION 'Customer memberships cannot receive staff branch access'
        USING ERRCODE = '23514';
    END IF;
    RETURN;
  END IF;

  IF has_global_role AND NOT membership_record.all_branches THEN
    RAISE EXCEPTION 'Owner and administrator roles require tenant-wide access'
      USING ERRCODE = '23514';
  END IF;

  IF has_branch_required_role
    AND membership_record.all_branches
    AND NOT has_global_role
  THEN
    RAISE EXCEPTION 'Branch managers and cashiers must be branch-restricted'
      USING ERRCODE = '23514';
  END IF;

  IF membership_record.all_branches AND assigned_branch_count > 0 THEN
    RAISE EXCEPTION 'Tenant-wide memberships cannot also have branch assignments'
      USING ERRCODE = '23514';
  END IF;

  IF NOT membership_record.all_branches AND active_branch_count = 0 THEN
    RAISE EXCEPTION 'A branch-restricted membership requires an active branch'
      USING ERRCODE = '23514';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.app_assert_tenant_invitation_scope(
  target_invitation_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  invitation_record public.tenant_invitations%ROWTYPE;
  invitation_role_key text;
  assigned_branch_count integer;
  active_branch_count integer;
BEGIN
  SELECT invitation.* INTO invitation_record
  FROM public.tenant_invitations invitation
  WHERE invitation.id = target_invitation_id;

  IF invitation_record.id IS NULL OR invitation_record.status <> 'pending' THEN
    RETURN;
  END IF;

  SELECT role.key INTO invitation_role_key
  FROM public.roles role
  WHERE role.id = invitation_record.role_id
    AND role.scope = 'tenant'
    AND (role.tenant_id IS NULL OR role.tenant_id = invitation_record.tenant_id);

  IF invitation_role_key IS NULL OR invitation_role_key = 'customer' THEN
    RAISE EXCEPTION 'Invitation role is not assignable to retailer staff'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*)::integer INTO assigned_branch_count
  FROM public.tenant_invitation_branches access
  WHERE access.tenant_id = invitation_record.tenant_id
    AND access.invitation_id = invitation_record.id;

  SELECT count(*)::integer INTO active_branch_count
  FROM public.tenant_invitation_branches access
  JOIN public.branches branch
    ON branch.tenant_id = access.tenant_id
   AND branch.id = access.branch_id
  WHERE access.tenant_id = invitation_record.tenant_id
    AND access.invitation_id = invitation_record.id
    AND branch.active;

  IF invitation_role_key IN ('tenant_owner', 'tenant_admin')
    AND NOT invitation_record.all_branches THEN
    RAISE EXCEPTION 'Owner and administrator invitations require tenant-wide access'
      USING ERRCODE = '23514';
  END IF;

  IF invitation_role_key IN ('branch_manager', 'cashier')
    AND invitation_record.all_branches THEN
    RAISE EXCEPTION 'Branch managers and cashiers must be branch-restricted'
      USING ERRCODE = '23514';
  END IF;

  IF invitation_record.all_branches AND assigned_branch_count > 0 THEN
    RAISE EXCEPTION 'Tenant-wide invitations cannot include branch assignments'
      USING ERRCODE = '23514';
  END IF;

  IF NOT invitation_record.all_branches AND active_branch_count = 0 THEN
    RAISE EXCEPTION 'A branch-restricted invitation requires an active branch'
      USING ERRCODE = '23514';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.validate_tenant_membership_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.app_assert_membership_scope(COALESCE(NEW.id, OLD.id));
  RETURN COALESCE(NEW, OLD);
END
$$;

CREATE OR REPLACE FUNCTION public.validate_tenant_member_role_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.app_assert_membership_scope(
    COALESCE(NEW.membership_id, OLD.membership_id)
  );
  RETURN COALESCE(NEW, OLD);
END
$$;

CREATE OR REPLACE FUNCTION public.validate_tenant_membership_branch_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.app_assert_membership_scope(
    COALESCE(NEW.membership_id, OLD.membership_id)
  );
  RETURN COALESCE(NEW, OLD);
END
$$;

CREATE OR REPLACE FUNCTION public.validate_tenant_invitation_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.app_assert_tenant_invitation_scope(COALESCE(NEW.id, OLD.id));
  RETURN COALESCE(NEW, OLD);
END
$$;

CREATE OR REPLACE FUNCTION public.validate_tenant_invitation_branch_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.app_assert_tenant_invitation_scope(
    COALESCE(NEW.invitation_id, OLD.invitation_id)
  );
  RETURN COALESCE(NEW, OLD);
END
$$;

CREATE CONSTRAINT TRIGGER tenant_memberships_scope_valid
AFTER INSERT OR UPDATE ON public.tenant_memberships
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.validate_tenant_membership_scope();
CREATE CONSTRAINT TRIGGER tenant_member_roles_scope_valid
AFTER INSERT OR UPDATE OR DELETE ON public.tenant_member_roles
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.validate_tenant_member_role_scope();
CREATE CONSTRAINT TRIGGER tenant_membership_branches_scope_valid
AFTER INSERT OR UPDATE OR DELETE ON public.tenant_membership_branches
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.validate_tenant_membership_branch_scope();
CREATE CONSTRAINT TRIGGER tenant_invitations_scope_valid
AFTER INSERT OR UPDATE ON public.tenant_invitations
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.validate_tenant_invitation_scope();
CREATE CONSTRAINT TRIGGER tenant_invitation_branches_scope_valid
AFTER INSERT OR UPDATE OR DELETE ON public.tenant_invitation_branches
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.validate_tenant_invitation_branch_scope();

CREATE OR REPLACE FUNCTION public.prevent_required_branch_deactivation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.active AND NOT NEW.active THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.branches branch
      WHERE branch.tenant_id = NEW.tenant_id
        AND branch.id <> NEW.id
        AND branch.active
    ) THEN
      RAISE EXCEPTION 'The final active branch cannot be deactivated'
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.tenant_memberships membership
      JOIN public.tenant_membership_branches access
        ON access.tenant_id = membership.tenant_id
       AND access.membership_id = membership.id
      WHERE membership.tenant_id = NEW.tenant_id
        AND membership.status = 'active'
        AND NOT membership.all_branches
        AND access.branch_id = NEW.id
        AND NOT EXISTS (
          SELECT 1
          FROM public.tenant_membership_branches alternative
          JOIN public.branches branch
            ON branch.tenant_id = alternative.tenant_id
           AND branch.id = alternative.branch_id
          WHERE alternative.tenant_id = membership.tenant_id
            AND alternative.membership_id = membership.id
            AND alternative.branch_id <> NEW.id
            AND branch.active
        )
    ) THEN
      RAISE EXCEPTION 'Reassign branch-restricted staff before deactivating this branch'
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.tenant_invitations invitation
      JOIN public.tenant_invitation_branches access
        ON access.tenant_id = invitation.tenant_id
       AND access.invitation_id = invitation.id
      WHERE invitation.tenant_id = NEW.tenant_id
        AND invitation.status = 'pending'
        AND NOT invitation.all_branches
        AND access.branch_id = NEW.id
        AND NOT EXISTS (
          SELECT 1
          FROM public.tenant_invitation_branches alternative
          JOIN public.branches branch
            ON branch.tenant_id = alternative.tenant_id
           AND branch.id = alternative.branch_id
          WHERE alternative.tenant_id = invitation.tenant_id
            AND alternative.invitation_id = invitation.id
            AND alternative.branch_id <> NEW.id
            AND branch.active
        )
    ) THEN
      RAISE EXCEPTION 'Resolve pending staff invitations before deactivating this branch'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER branches_prevent_required_deactivation
BEFORE UPDATE OF active ON public.branches
FOR EACH ROW EXECUTE FUNCTION public.prevent_required_branch_deactivation();
CREATE OR REPLACE FUNCTION public.app_set_tenant_membership_branch_access(
  target_membership_id uuid,
  requested_all_branches boolean,
  requested_branch_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_membership public.tenant_memberships%ROWTYPE;
  requested_count integer;
BEGIN
  IF NOT public.app_has_permission('memberships.manage') THEN
    RAISE EXCEPTION 'Membership management permission is required'
      USING ERRCODE = '42501';
  END IF;

  SELECT membership.* INTO target_membership
  FROM public.tenant_memberships membership
  WHERE membership.tenant_id = public.app_tenant_id()
    AND membership.id = target_membership_id
  FOR UPDATE;

  IF target_membership.id IS NULL THEN
    RAISE EXCEPTION 'Membership not found' USING ERRCODE = 'P0002';
  END IF;
  IF target_membership.user_id = public.app_user_id() THEN
    RAISE EXCEPTION 'Self access-scope changes are prohibited'
      USING ERRCODE = '42501';
  END IF;

  requested_count := COALESCE(array_length(requested_branch_ids, 1), 0);
  IF requested_all_branches AND requested_count > 0 THEN
    RAISE EXCEPTION 'Tenant-wide access cannot include branch assignments'
      USING ERRCODE = '23514';
  END IF;
  IF NOT requested_all_branches AND requested_count = 0 THEN
    RAISE EXCEPTION 'Branch-restricted access requires at least one branch'
      USING ERRCODE = '23514';
  END IF;
  IF requested_count <> (
    SELECT count(DISTINCT requested.branch_id)::integer
    FROM unnest(
      COALESCE(requested_branch_ids, ARRAY[]::uuid[])
    ) AS requested(branch_id)
  ) THEN
    RAISE EXCEPTION 'Branch assignments must be unique'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM unnest(COALESCE(requested_branch_ids, ARRAY[]::uuid[])) AS requested(branch_id)
    LEFT JOIN public.branches branch
      ON branch.tenant_id = target_membership.tenant_id
     AND branch.id = requested.branch_id
     AND branch.active
    WHERE branch.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Every branch assignment must reference an active retailer branch'
      USING ERRCODE = '23503';
  END IF;

  DELETE FROM public.tenant_membership_branches access
  WHERE access.tenant_id = target_membership.tenant_id
    AND access.membership_id = target_membership.id;

  UPDATE public.tenant_memberships membership
  SET all_branches = requested_all_branches,
      updated_at = now()
  WHERE membership.tenant_id = target_membership.tenant_id
    AND membership.id = target_membership.id;

  IF NOT requested_all_branches THEN
    INSERT INTO public.tenant_membership_branches (
      tenant_id,
      membership_id,
      branch_id,
      assigned_by
    )
    SELECT
      target_membership.tenant_id,
      target_membership.id,
      requested.branch_id,
      public.app_user_id()
    FROM unnest(requested_branch_ids) AS requested(branch_id);
  END IF;

  PERFORM public.app_assert_membership_scope(target_membership.id);
END
$$;

CREATE OR REPLACE FUNCTION public.app_assign_tenant_role(
  target_membership_id uuid,
  target_role_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_membership public.tenant_memberships%ROWTYPE;
  target_role public.roles%ROWTYPE;
  has_existing_global_role boolean;
BEGIN
  IF NOT public.app_has_permission('memberships.manage') THEN
    RAISE EXCEPTION 'Membership management permission is required'
      USING ERRCODE = '42501';
  END IF;

  SELECT membership.* INTO target_membership
  FROM public.tenant_memberships membership
  WHERE membership.tenant_id = public.app_tenant_id()
    AND membership.id = target_membership_id
  FOR UPDATE;
  IF target_membership.id IS NULL THEN
    RAISE EXCEPTION 'Membership not found' USING ERRCODE = 'P0002';
  END IF;
  IF target_membership.user_id = public.app_user_id() THEN
    RAISE EXCEPTION 'Self role changes are prohibited'
      USING ERRCODE = '42501';
  END IF;

  SELECT role.* INTO target_role
  FROM public.roles role
  WHERE role.id = target_role_id
    AND role.scope = 'tenant'
    AND (role.tenant_id IS NULL OR role.tenant_id = target_membership.tenant_id);
  IF target_role.id IS NULL OR target_role.key = 'customer' THEN
    RAISE EXCEPTION 'Tenant staff role not found' USING ERRCODE = 'P0002';
  END IF;
  IF target_role.key = 'tenant_owner'
    AND NOT public.app_has_permission('tenant.owners.manage') THEN
    RAISE EXCEPTION 'Retailer owner authority is required'
      USING ERRCODE = '42501';
  END IF;
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_member_roles assignment
    JOIN public.roles role ON role.id = assignment.role_id
    WHERE assignment.tenant_id = target_membership.tenant_id
      AND assignment.membership_id = target_membership.id
      AND role.key IN ('tenant_owner', 'tenant_admin')
  ) INTO has_existing_global_role;

  IF target_role.key IN ('tenant_owner', 'tenant_admin')
    AND NOT target_membership.all_branches THEN
    DELETE FROM public.tenant_membership_branches access
    WHERE access.tenant_id = target_membership.tenant_id
      AND access.membership_id = target_membership.id;
    UPDATE public.tenant_memberships membership
    SET all_branches = true,
        updated_at = now()
    WHERE membership.tenant_id = target_membership.tenant_id
      AND membership.id = target_membership.id;
    target_membership.all_branches := true;
  END IF;
  IF target_role.key IN ('branch_manager', 'cashier')
    AND target_membership.all_branches
    AND NOT has_existing_global_role THEN
    RAISE EXCEPTION 'This role requires branch-restricted access'
      USING ERRCODE = '23514';
  END IF;
  IF NOT target_membership.all_branches AND NOT EXISTS (
    SELECT 1
    FROM public.tenant_membership_branches access
    JOIN public.branches branch
      ON branch.tenant_id = access.tenant_id
     AND branch.id = access.branch_id
    WHERE access.tenant_id = target_membership.tenant_id
      AND access.membership_id = target_membership.id
      AND branch.active
  ) THEN
    RAISE EXCEPTION 'Branch-restricted access requires an active branch'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.tenant_member_roles (
    tenant_id,
    membership_id,
    role_id,
    assigned_by
  )
  VALUES (
    target_membership.tenant_id,
    target_membership.id,
    target_role.id,
    public.app_user_id()
  )
  ON CONFLICT DO NOTHING;

  PERFORM public.app_assert_membership_scope(target_membership.id);
END
$$;

CREATE OR REPLACE FUNCTION public.app_revoke_tenant_role(
  target_membership_id uuid,
  target_role_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_membership public.tenant_memberships%ROWTYPE;
  target_role_key text;
  assigned_role_count integer;
  active_owner_count integer;
BEGIN
  IF NOT public.app_has_permission('memberships.manage') THEN
    RAISE EXCEPTION 'Membership management permission is required'
      USING ERRCODE = '42501';
  END IF;

  SELECT membership.* INTO target_membership
  FROM public.tenant_memberships membership
  WHERE membership.tenant_id = public.app_tenant_id()
    AND membership.id = target_membership_id
  FOR UPDATE;
  IF target_membership.id IS NULL THEN
    RAISE EXCEPTION 'Membership not found' USING ERRCODE = 'P0002';
  END IF;
  IF target_membership.user_id = public.app_user_id() THEN
    RAISE EXCEPTION 'Self role changes are prohibited'
      USING ERRCODE = '42501';
  END IF;

  SELECT role.key INTO target_role_key
  FROM public.tenant_member_roles assignment
  JOIN public.roles role ON role.id = assignment.role_id
  WHERE assignment.tenant_id = target_membership.tenant_id
    AND assignment.membership_id = target_membership.id
    AND assignment.role_id = target_role_id;
  IF target_role_key IS NULL THEN
    RAISE EXCEPTION 'Role assignment not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT count(*)::integer INTO assigned_role_count
  FROM public.tenant_member_roles assignment
  WHERE assignment.tenant_id = target_membership.tenant_id
    AND assignment.membership_id = target_membership.id;
  IF target_membership.status = 'active' AND assigned_role_count <= 1 THEN
    RAISE EXCEPTION 'Suspend the membership instead of removing its final role'
      USING ERRCODE = '23514';
  END IF;

  IF target_role_key = 'tenant_owner' THEN
    IF NOT public.app_has_permission('tenant.owners.manage') THEN
      RAISE EXCEPTION 'Retailer owner authority is required'
        USING ERRCODE = '42501';
    END IF;
    PERFORM pg_advisory_xact_lock(
      hashtextextended('tenant-owner-continuity:' || target_membership.tenant_id::text, 0)
    );
    SELECT count(*)::integer INTO active_owner_count
    FROM public.tenant_member_roles assignment
    JOIN public.tenant_memberships membership
      ON membership.tenant_id = assignment.tenant_id
     AND membership.id = assignment.membership_id
    JOIN public.roles role ON role.id = assignment.role_id
    JOIN public.user_profiles profile ON profile.id = membership.user_id
    WHERE assignment.tenant_id = target_membership.tenant_id
      AND role.key = 'tenant_owner'
      AND membership.status = 'active'
      AND NOT profile.disabled;
    IF active_owner_count <= 1 THEN
      RAISE EXCEPTION 'The final active retailer owner cannot be removed'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  DELETE FROM public.tenant_member_roles assignment
  WHERE assignment.tenant_id = target_membership.tenant_id
    AND assignment.membership_id = target_membership.id
    AND assignment.role_id = target_role_id;

  PERFORM public.app_assert_membership_scope(target_membership.id);
END
$$;

CREATE OR REPLACE FUNCTION public.app_set_tenant_membership_status(
  target_membership_id uuid,
  requested_status public.membership_status
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_membership public.tenant_memberships%ROWTYPE;
  target_is_owner boolean;
  active_owner_count integer;
BEGIN
  IF NOT public.app_has_permission('memberships.manage') THEN
    RAISE EXCEPTION 'Membership management permission is required'
      USING ERRCODE = '42501';
  END IF;

  SELECT membership.* INTO target_membership
  FROM public.tenant_memberships membership
  WHERE membership.tenant_id = public.app_tenant_id()
    AND membership.id = target_membership_id
  FOR UPDATE;
  IF target_membership.id IS NULL THEN
    RAISE EXCEPTION 'Membership not found' USING ERRCODE = 'P0002';
  END IF;
  IF target_membership.user_id = public.app_user_id() THEN
    RAISE EXCEPTION 'Self access-state changes are prohibited'
      USING ERRCODE = '42501';
  END IF;
  IF requested_status = 'invited' THEN
    RAISE EXCEPTION 'Memberships cannot be returned to invited status'
      USING ERRCODE = '23514';
  END IF;
  IF target_membership.status = 'revoked' AND requested_status <> 'revoked' THEN
    RAISE EXCEPTION 'A revoked membership cannot be reactivated'
      USING ERRCODE = '23514';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_member_roles assignment
    JOIN public.roles role ON role.id = assignment.role_id
    WHERE assignment.tenant_id = target_membership.tenant_id
      AND assignment.membership_id = target_membership.id
      AND role.key = 'tenant_owner'
  ) INTO target_is_owner;

  IF target_is_owner THEN
    IF NOT public.app_has_permission('tenant.owners.manage') THEN
      RAISE EXCEPTION 'Retailer owner authority is required'
        USING ERRCODE = '42501';
    END IF;
    IF target_membership.status = 'active' AND requested_status <> 'active' THEN
      PERFORM pg_advisory_xact_lock(
        hashtextextended('tenant-owner-continuity:' || target_membership.tenant_id::text, 0)
      );
      SELECT count(*)::integer INTO active_owner_count
      FROM public.tenant_member_roles assignment
      JOIN public.tenant_memberships membership
        ON membership.tenant_id = assignment.tenant_id
       AND membership.id = assignment.membership_id
      JOIN public.roles role ON role.id = assignment.role_id
      JOIN public.user_profiles profile ON profile.id = membership.user_id
      WHERE assignment.tenant_id = target_membership.tenant_id
        AND role.key = 'tenant_owner'
        AND membership.status = 'active'
        AND NOT profile.disabled;
      IF active_owner_count <= 1 THEN
        RAISE EXCEPTION 'The final active retailer owner cannot be suspended or revoked'
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  UPDATE public.tenant_memberships membership
  SET status = requested_status,
      updated_at = now()
  WHERE membership.tenant_id = target_membership.tenant_id
    AND membership.id = target_membership.id;

  PERFORM public.app_assert_membership_scope(target_membership.id);
END
$$;
CREATE OR REPLACE FUNCTION public.app_accept_tenant_invitation(
  target_invitation_id uuid,
  audit_request_id text DEFAULT NULL,
  audit_ip_address text DEFAULT NULL,
  audit_user_agent text DEFAULT NULL
)
RETURNS TABLE (tenant_id uuid, membership_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  invitation_record public.tenant_invitations%ROWTYPE;
  authenticated_user_id uuid;
  authenticated_email text;
  accepted_membership_id uuid;
BEGIN
  authenticated_user_id := public.app_user_id();
  IF authenticated_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required'
      USING ERRCODE = '42501';
  END IF;

  SELECT lower(email) INTO authenticated_email
  FROM public.user_profiles
  WHERE id = authenticated_user_id;

  SELECT invitation.* INTO invitation_record
  FROM public.tenant_invitations invitation
  WHERE invitation.id = target_invitation_id
  FOR UPDATE;

  IF invitation_record.id IS NULL
    OR authenticated_email IS NULL
    OR invitation_record.normalized_email <> authenticated_email THEN
    RAISE EXCEPTION 'Invitation was not found for the authenticated account'
      USING ERRCODE = 'P0002';
  END IF;
  IF invitation_record.status <> 'pending'
    OR invitation_record.expires_at <= now() THEN
    RAISE EXCEPTION 'Invitation is no longer active'
      USING ERRCODE = '23514';
  END IF;

  PERFORM public.app_assert_tenant_invitation_scope(invitation_record.id);

  INSERT INTO public.tenant_memberships (
    tenant_id,
    user_id,
    status,
    all_branches,
    invited_by
  )
  VALUES (
    invitation_record.tenant_id,
    authenticated_user_id,
    'active',
    invitation_record.all_branches,
    invitation_record.invited_by
  )
  ON CONFLICT (tenant_id, user_id) DO UPDATE
  SET status = 'active',
      all_branches = EXCLUDED.all_branches,
      updated_at = now()
  RETURNING id INTO accepted_membership_id;

  DELETE FROM public.tenant_membership_branches access
  WHERE access.tenant_id = invitation_record.tenant_id
    AND access.membership_id = accepted_membership_id;

  INSERT INTO public.tenant_membership_branches (
    tenant_id,
    membership_id,
    branch_id,
    assigned_by
  )
  SELECT
    invitation_record.tenant_id,
    accepted_membership_id,
    access.branch_id,
    invitation_record.invited_by
  FROM public.tenant_invitation_branches access
  WHERE access.tenant_id = invitation_record.tenant_id
    AND access.invitation_id = invitation_record.id
  ON CONFLICT DO NOTHING;

  INSERT INTO public.tenant_member_roles (
    tenant_id,
    membership_id,
    role_id,
    assigned_by
  )
  VALUES (
    invitation_record.tenant_id,
    accepted_membership_id,
    invitation_record.role_id,
    invitation_record.invited_by
  )
  ON CONFLICT DO NOTHING;

  PERFORM public.app_assert_membership_scope(accepted_membership_id);

  UPDATE public.tenant_invitations
  SET status = 'accepted',
      accepted_by = authenticated_user_id,
      accepted_at = now(),
      updated_at = now()
  WHERE id = invitation_record.id;

  IF invitation_record.role_id = '00000000-0000-4000-8000-000000000101'::uuid THEN
    UPDATE public.tenants
    SET active = true,
        onboarding_status = 'active',
        updated_at = now()
    WHERE id = invitation_record.tenant_id
      AND onboarding_status = 'pending_owner';
  END IF;

  INSERT INTO public.audit_events (
    tenant_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    request_id,
    ip_address,
    user_agent,
    details
  )
  VALUES (
    invitation_record.tenant_id,
    authenticated_user_id,
    'membership.invitation_accepted',
    'tenant_invitation',
    invitation_record.id::text,
    audit_request_id,
    audit_ip_address,
    audit_user_agent,
    jsonb_build_object(
      'membershipId', accepted_membership_id,
      'roleId', invitation_record.role_id,
      'allBranches', invitation_record.all_branches,
      'branchIds', COALESCE(
        (
          SELECT jsonb_agg(access.branch_id ORDER BY access.branch_id)
          FROM public.tenant_invitation_branches access
          WHERE access.tenant_id = invitation_record.tenant_id
            AND access.invitation_id = invitation_record.id
        ),
        '[]'::jsonb
      )
    )
  );

  RETURN QUERY
  SELECT invitation_record.tenant_id, accepted_membership_id;
END
$$;

GRANT SELECT, INSERT ON public.tenant_invitation_branches TO app_runtime;
GRANT SELECT ON public.tenant_membership_branches TO app_runtime;
REVOKE UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES
  ON public.tenant_invitation_branches FROM app_runtime;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES
  ON public.tenant_membership_branches FROM app_runtime;
REVOKE INSERT, UPDATE, DELETE ON public.tenant_memberships FROM app_runtime;
REVOKE INSERT, UPDATE, DELETE ON public.tenant_member_roles FROM app_runtime;

REVOKE ALL ON FUNCTION public.app_has_all_branch_access(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_can_access_branch(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_can_access_customer(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_can_access_application(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_can_access_contract(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_can_access_payment(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_can_access_journal_entry(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_assert_membership_scope(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_assert_tenant_invitation_scope(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_tenant_membership_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_tenant_member_role_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_tenant_membership_branch_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_tenant_invitation_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_tenant_invitation_branch_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_required_branch_deactivation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_set_tenant_membership_branch_access(uuid, boolean, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_assign_tenant_role(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_revoke_tenant_role(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_set_tenant_membership_status(uuid, public.membership_status) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_accept_tenant_invitation(uuid, text, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.app_has_all_branch_access(uuid) TO app_runtime;
GRANT EXECUTE ON FUNCTION public.app_can_access_branch(uuid, uuid) TO app_runtime;
GRANT EXECUTE ON FUNCTION public.app_can_access_customer(uuid, uuid) TO app_runtime;
GRANT EXECUTE ON FUNCTION public.app_can_access_application(uuid, uuid) TO app_runtime;
GRANT EXECUTE ON FUNCTION public.app_can_access_contract(uuid, uuid) TO app_runtime;
GRANT EXECUTE ON FUNCTION public.app_can_access_payment(uuid, uuid) TO app_runtime;
GRANT EXECUTE ON FUNCTION public.app_can_access_journal_entry(uuid, uuid) TO app_runtime;
GRANT EXECUTE ON FUNCTION public.app_set_tenant_membership_branch_access(uuid, boolean, uuid[]) TO app_runtime;
GRANT EXECUTE ON FUNCTION public.app_assign_tenant_role(uuid, uuid) TO app_runtime;
GRANT EXECUTE ON FUNCTION public.app_revoke_tenant_role(uuid, uuid) TO app_runtime;
GRANT EXECUTE ON FUNCTION public.app_set_tenant_membership_status(uuid, public.membership_status) TO app_runtime;
GRANT EXECUTE ON FUNCTION public.app_accept_tenant_invitation(uuid, text, text, text) TO app_runtime;