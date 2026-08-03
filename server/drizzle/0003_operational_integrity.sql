CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
-- End of the preceding independently reviewable database operation.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_provider') THEN
    CREATE ROLE app_provider NOLOGIN NOINHERIT;
  END IF;
END
$$;

GRANT app_provider TO app_runtime;
-- End of the preceding independently reviewable database operation.

INSERT INTO public.permissions (code, description)
VALUES
  ('payments.reconcile', 'Import and review provider reconciliation data'),
  ('documents.read', 'Read private customer and application documents'),
  ('documents.manage', 'Request, verify, and manage private documents'),
  ('kyc.read', 'Read identity verification sessions and decisions'),
  ('kyc.manage', 'Create and manage identity verification sessions'),
  ('devices.read', 'Read managed devices and command history'),
  ('devices.manage', 'Enroll devices and issue MDM commands'),
  ('self.documents.manage', 'Upload and read the authenticated customer documents'),
  ('self.kyc.manage', 'Start and read the authenticated customer KYC session'),
  ('self.devices.read', 'Read the authenticated customer managed device'),
  ('self.payments.create', 'Initiate a payment for the authenticated customer'),
  ('self.applications.read', 'Read the authenticated customer applications'),
  ('self.applications.create', 'Create a financing application for the authenticated customer')
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO public.role_permissions (role_id, permission_code)
SELECT '00000000-0000-4000-8000-000000000101'::uuid, code
FROM public.permissions
WHERE code IN (
  'payments.reconcile', 'documents.read', 'documents.manage', 'kyc.read',
  'kyc.manage', 'devices.read', 'devices.manage', 'self.documents.manage',
  'self.kyc.manage', 'self.devices.read', 'self.payments.create',
  'self.applications.read', 'self.applications.create'
)
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_code)
SELECT '00000000-0000-4000-8000-000000000102'::uuid, code
FROM public.permissions
WHERE code IN (
  'payments.reconcile', 'documents.read', 'documents.manage', 'kyc.read',
  'kyc.manage', 'devices.read', 'devices.manage'
)
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_code)
SELECT role_id, permission_code
FROM (
  VALUES
    ('00000000-0000-4000-8000-000000000103'::uuid, 'payments.reconcile'),
    ('00000000-0000-4000-8000-000000000103'::uuid, 'documents.read'),
    ('00000000-0000-4000-8000-000000000103'::uuid, 'documents.manage'),
    ('00000000-0000-4000-8000-000000000103'::uuid, 'kyc.read'),
    ('00000000-0000-4000-8000-000000000103'::uuid, 'kyc.manage'),
    ('00000000-0000-4000-8000-000000000103'::uuid, 'devices.read'),
    ('00000000-0000-4000-8000-000000000103'::uuid, 'devices.manage'),
    ('00000000-0000-4000-8000-000000000104'::uuid, 'documents.read'),
    ('00000000-0000-4000-8000-000000000104'::uuid, 'kyc.read'),
    ('00000000-0000-4000-8000-000000000104'::uuid, 'kyc.manage'),
    ('00000000-0000-4000-8000-000000000105'::uuid, 'devices.read'),
    ('00000000-0000-4000-8000-000000000105'::uuid, 'devices.manage'),
    ('00000000-0000-4000-8000-000000000107'::uuid, 'documents.read'),
    ('00000000-0000-4000-8000-000000000107'::uuid, 'kyc.read'),
    ('00000000-0000-4000-8000-000000000107'::uuid, 'devices.read'),
    ('00000000-0000-4000-8000-000000000108'::uuid, 'self.documents.manage'),
    ('00000000-0000-4000-8000-000000000108'::uuid, 'self.kyc.manage'),
    ('00000000-0000-4000-8000-000000000108'::uuid, 'self.devices.read'),
    ('00000000-0000-4000-8000-000000000108'::uuid, 'self.payments.create'),
    ('00000000-0000-4000-8000-000000000108'::uuid, 'self.applications.read'),
    ('00000000-0000-4000-8000-000000000108'::uuid, 'self.applications.create')
) grants(role_id, permission_code)
ON CONFLICT DO NOTHING;
-- End of the preceding independently reviewable database operation.

CREATE OR REPLACE FUNCTION public.app_owns_application(target_application_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.financing_applications application
    JOIN public.customers customer
      ON customer.tenant_id = application.tenant_id
     AND customer.id = application.customer_id
    WHERE application.id = target_application_id
      AND application.tenant_id = public.app_tenant_id()
      AND customer.user_id = public.app_user_id()
  )
$$;

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
-- End of the preceding independently reviewable database operation.

CREATE OR REPLACE FUNCTION public.hash_audit_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended(COALESCE(NEW.tenant_id::text, 'platform'), 0)
  );

  SELECT event_hash INTO NEW.previous_hash
  FROM public.audit_events
  WHERE tenant_id IS NOT DISTINCT FROM NEW.tenant_id
  ORDER BY occurred_at DESC, id DESC
  LIMIT 1;

  NEW.event_hash := encode(
    digest(
      convert_to(
        concat_ws(
          '|',
          NEW.id::text,
          COALESCE(NEW.tenant_id::text, ''),
          COALESCE(NEW.actor_user_id::text, ''),
          NEW.action,
          NEW.resource_type,
          COALESCE(NEW.resource_id, ''),
          COALESCE(NEW.request_id, ''),
          COALESCE(NEW.ip_address, ''),
          COALESCE(NEW.user_agent, ''),
          NEW.details::text,
          NEW.occurred_at::text,
          COALESCE(NEW.previous_hash, '')
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
  RETURN NEW;
END
$$;

ALTER TABLE public.audit_events DISABLE TRIGGER audit_events_are_immutable;

DO $$
DECLARE
  tenant_row record;
  event_row public.audit_events%ROWTYPE;
  prior_hash text;
  calculated_hash text;
BEGIN
  FOR tenant_row IN
    SELECT DISTINCT tenant_id FROM public.audit_events
  LOOP
    prior_hash := NULL;
    FOR event_row IN
      SELECT *
      FROM public.audit_events
      WHERE tenant_id IS NOT DISTINCT FROM tenant_row.tenant_id
      ORDER BY occurred_at, id
    LOOP
      calculated_hash := encode(
        digest(
          convert_to(
            concat_ws(
              '|',
              event_row.id::text,
              COALESCE(event_row.tenant_id::text, ''),
              COALESCE(event_row.actor_user_id::text, ''),
              event_row.action,
              event_row.resource_type,
              COALESCE(event_row.resource_id, ''),
              COALESCE(event_row.request_id, ''),
              COALESCE(event_row.ip_address, ''),
              COALESCE(event_row.user_agent, ''),
              event_row.details::text,
              event_row.occurred_at::text,
              COALESCE(prior_hash, '')
            ),
            'UTF8'
          ),
          'sha256'
        ),
        'hex'
      );
      UPDATE public.audit_events
      SET previous_hash = prior_hash, event_hash = calculated_hash
      WHERE id = event_row.id;
      prior_hash := calculated_hash;
    END LOOP;
  END LOOP;
END
$$;

CREATE TRIGGER audit_events_set_hash
BEFORE INSERT ON public.audit_events
FOR EACH ROW EXECUTE FUNCTION public.hash_audit_event();

ALTER TABLE public.audit_events ENABLE TRIGGER audit_events_are_immutable;
-- End of the preceding independently reviewable database operation.

CREATE OR REPLACE FUNCTION public.lock_allocation_target()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      NEW.tenant_id::text || ':' ||
      COALESCE(
        NEW.installment_id::text,
        NEW.fee_assessment_id::text,
        NEW.contract_id::text,
        NEW.payment_id::text
      ),
      0
    )
  );
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public.assert_payment_allocation_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_payment_id uuid;
  payment_row public.payments%ROWTYPE;
  allocation_row public.payment_allocations%ROWTYPE;
  allocated_amount numeric;
  allowed_amount numeric;
BEGIN
  target_payment_id := CASE
    WHEN TG_TABLE_NAME = 'payments' THEN NEW.id
    ELSE NEW.payment_id
  END;

  SELECT * INTO payment_row
  FROM public.payments
  WHERE id = target_payment_id;

  IF payment_row.status <> 'settled' THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(sum(amount), 0) INTO allocated_amount
  FROM public.payment_allocations
  WHERE payment_id = target_payment_id;

  IF allocated_amount <> payment_row.amount THEN
    RAISE EXCEPTION 'Settled payment % allocations must equal payment amount',
      target_payment_id
      USING ERRCODE = '23514';
  END IF;

  FOR allocation_row IN
    SELECT *
    FROM public.payment_allocations
    WHERE payment_id = target_payment_id
      AND target_type <> 'unapplied_credit'
  LOOP
    IF allocation_row.target_type = 'down_payment' THEN
      SELECT down_payment INTO allowed_amount
      FROM public.financing_contracts
      WHERE id = allocation_row.contract_id;

      SELECT COALESCE(sum(allocation.amount), 0) INTO allocated_amount
      FROM public.payment_allocations allocation
      JOIN public.payments payment ON payment.id = allocation.payment_id
      WHERE allocation.contract_id = allocation_row.contract_id
        AND allocation.target_type = 'down_payment'
        AND payment.status = 'settled';
    ELSIF allocation_row.target_type = 'installment_principal' THEN
      SELECT principal_due INTO allowed_amount
      FROM public.installments
      WHERE id = allocation_row.installment_id;

      SELECT COALESCE(sum(allocation.amount), 0) INTO allocated_amount
      FROM public.payment_allocations allocation
      JOIN public.payments payment ON payment.id = allocation.payment_id
      WHERE allocation.installment_id = allocation_row.installment_id
        AND allocation.target_type = 'installment_principal'
        AND payment.status = 'settled';
    ELSIF allocation_row.target_type = 'installment_finance_charge' THEN
      SELECT finance_charge_due INTO allowed_amount
      FROM public.installments
      WHERE id = allocation_row.installment_id;

      SELECT COALESCE(sum(allocation.amount), 0) INTO allocated_amount
      FROM public.payment_allocations allocation
      JOIN public.payments payment ON payment.id = allocation.payment_id
      WHERE allocation.installment_id = allocation_row.installment_id
        AND allocation.target_type = 'installment_finance_charge'
        AND payment.status = 'settled';
    ELSIF allocation_row.target_type = 'fee' THEN
      SELECT amount INTO allowed_amount
      FROM public.fee_assessments
      WHERE id = allocation_row.fee_assessment_id
        AND status = 'assessed';

      SELECT COALESCE(sum(allocation.amount), 0) INTO allocated_amount
      FROM public.payment_allocations allocation
      JOIN public.payments payment ON payment.id = allocation.payment_id
      WHERE allocation.fee_assessment_id = allocation_row.fee_assessment_id
        AND allocation.target_type = 'fee'
        AND payment.status = 'settled';
    END IF;

    IF allowed_amount IS NULL OR allocated_amount > allowed_amount THEN
      RAISE EXCEPTION 'Payment allocation exceeds the outstanding target balance'
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  RETURN NULL;
END
$$;

CREATE TRIGGER payment_allocation_lock
BEFORE INSERT ON public.payment_allocations
FOR EACH ROW EXECUTE FUNCTION public.lock_allocation_target();

CREATE CONSTRAINT TRIGGER payment_allocation_integrity_on_allocation
AFTER INSERT ON public.payment_allocations
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.assert_payment_allocation_integrity();

CREATE CONSTRAINT TRIGGER payment_allocation_integrity_on_payment
AFTER INSERT OR UPDATE OF status ON public.payments
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.assert_payment_allocation_integrity();
-- End of the preceding independently reviewable database operation.

ALTER TABLE public.payments
ADD CONSTRAINT payments_provider_metadata_valid
CHECK (
  (channel = 'cash')
  OR (
    provider IS NOT NULL
    AND external_reference IS NOT NULL
    AND (channel NOT IN ('mtn_momo', 'orange_money') OR provider = channel::text)
  )
);

CREATE OR REPLACE FUNCTION public.validate_cross_entity_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  expected_customer uuid;
  expected_imei text;
BEGIN
  IF TG_TABLE_NAME = 'payments' AND NEW.contract_id IS NOT NULL THEN
    SELECT customer_id INTO expected_customer
    FROM public.financing_contracts
    WHERE tenant_id = NEW.tenant_id AND id = NEW.contract_id;
    IF expected_customer IS DISTINCT FROM NEW.customer_id THEN
      RAISE EXCEPTION 'Payment customer must match its contract customer'
        USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'documents'
        AND NEW.customer_id IS NOT NULL
        AND NEW.application_id IS NOT NULL THEN
    SELECT customer_id INTO expected_customer
    FROM public.financing_applications
    WHERE tenant_id = NEW.tenant_id AND id = NEW.application_id;
    IF expected_customer IS DISTINCT FROM NEW.customer_id THEN
      RAISE EXCEPTION 'Document customer must match its application customer'
        USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'kyc_verification_sessions'
        AND NEW.customer_id IS NOT NULL THEN
    SELECT customer_id INTO expected_customer
    FROM public.financing_applications
    WHERE tenant_id = NEW.tenant_id AND id = NEW.application_id;
    IF expected_customer IS DISTINCT FROM NEW.customer_id THEN
      RAISE EXCEPTION 'KYC customer must match its application customer'
        USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'managed_devices' THEN
    SELECT device ->> 'imei' INTO expected_imei
    FROM public.financing_contracts
    WHERE tenant_id = NEW.tenant_id AND id = NEW.contract_id;
    IF expected_imei IS DISTINCT FROM NEW.imei THEN
      RAISE EXCEPTION 'Managed device IMEI must match its signed contract'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER payments_cross_entity_integrity
BEFORE INSERT OR UPDATE OF tenant_id, customer_id, contract_id ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.validate_cross_entity_integrity();
CREATE TRIGGER documents_cross_entity_integrity
BEFORE INSERT OR UPDATE OF tenant_id, customer_id, application_id ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.validate_cross_entity_integrity();
CREATE TRIGGER kyc_sessions_cross_entity_integrity
BEFORE INSERT OR UPDATE OF tenant_id, customer_id, application_id ON public.kyc_verification_sessions
FOR EACH ROW EXECUTE FUNCTION public.validate_cross_entity_integrity();
CREATE TRIGGER managed_devices_cross_entity_integrity
BEFORE INSERT OR UPDATE OF tenant_id, contract_id, imei ON public.managed_devices
FOR EACH ROW EXECUTE FUNCTION public.validate_cross_entity_integrity();
-- End of the preceding independently reviewable database operation.

CREATE OR REPLACE FUNCTION public.protect_provider_event_evidence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.payment_id IS DISTINCT FROM OLD.payment_id
     OR NEW.provider IS DISTINCT FROM OLD.provider
     OR NEW.external_event_id IS DISTINCT FROM OLD.external_event_id
     OR NEW.event_type IS DISTINCT FROM OLD.event_type
     OR NEW.payload_hash IS DISTINCT FROM OLD.payload_hash
     OR NEW.payload IS DISTINCT FROM OLD.payload
     OR NEW.signature_valid IS DISTINCT FROM OLD.signature_valid
     OR NEW.received_at IS DISTINCT FROM OLD.received_at
  THEN
    RAISE EXCEPTION 'Provider event evidence is immutable'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER payment_provider_event_evidence_immutable
BEFORE UPDATE ON public.payment_provider_events
FOR EACH ROW EXECUTE FUNCTION public.protect_provider_event_evidence();

CREATE TRIGGER reconciliation_items_are_immutable
BEFORE UPDATE OR DELETE ON public.reconciliation_items
FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();
-- End of the preceding independently reviewable database operation.

ALTER TABLE public.payment_provider_events
ADD CONSTRAINT payment_provider_events_tenant_fk
FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);
-- End of the preceding independently reviewable database operation.

CREATE OR REPLACE FUNCTION public.app_verify_audit_chain(target_tenant_id uuid)
RETURNS TABLE (
  valid boolean,
  checked_events bigint,
  first_invalid_event_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  event_row public.audit_events%ROWTYPE;
  prior_hash text;
  calculated_hash text;
  checked_count bigint := 0;
BEGIN
  IF target_tenant_id IS DISTINCT FROM public.app_tenant_id()
     OR NOT public.app_has_permission('audit.read', target_tenant_id)
  THEN
    RAISE EXCEPTION 'Audit-chain verification is not authorized'
      USING ERRCODE = '42501';
  END IF;

  prior_hash := NULL;
  FOR event_row IN
    SELECT *
    FROM public.audit_events
    WHERE tenant_id = target_tenant_id
    ORDER BY occurred_at, id
  LOOP
    calculated_hash := encode(
      digest(
        convert_to(
          concat_ws(
            '|',
            event_row.id::text,
            COALESCE(event_row.tenant_id::text, ''),
            COALESCE(event_row.actor_user_id::text, ''),
            event_row.action,
            event_row.resource_type,
            COALESCE(event_row.resource_id, ''),
            COALESCE(event_row.request_id, ''),
            COALESCE(event_row.ip_address, ''),
            COALESCE(event_row.user_agent, ''),
            event_row.details::text,
            event_row.occurred_at::text,
            COALESCE(prior_hash, '')
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );
    checked_count := checked_count + 1;
    IF event_row.previous_hash IS DISTINCT FROM prior_hash
       OR event_row.event_hash IS DISTINCT FROM calculated_hash
    THEN
      RETURN QUERY SELECT false, checked_count, event_row.id;
      RETURN;
    END IF;
    prior_hash := event_row.event_hash;
  END LOOP;

  RETURN QUERY SELECT true, checked_count, NULL::uuid;
END
$$;
-- End of the preceding independently reviewable database operation.

CREATE TRIGGER documents_set_updated_at BEFORE UPDATE ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER kyc_sessions_set_updated_at BEFORE UPDATE ON public.kyc_verification_sessions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER managed_devices_set_updated_at BEFORE UPDATE ON public.managed_devices
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER documents_tenant_immutable BEFORE UPDATE ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_reassignment();
CREATE TRIGGER kyc_sessions_tenant_immutable BEFORE UPDATE ON public.kyc_verification_sessions
FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_reassignment();
CREATE TRIGGER managed_devices_tenant_immutable BEFORE UPDATE ON public.managed_devices
FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_reassignment();
CREATE TRIGGER payment_provider_events_tenant_immutable BEFORE UPDATE ON public.payment_provider_events
FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_reassignment();
CREATE TRIGGER reconciliation_runs_tenant_immutable BEFORE UPDATE ON public.reconciliation_runs
FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_reassignment();
-- End of the preceding independently reviewable database operation.

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents FORCE ROW LEVEL SECURITY;
ALTER TABLE public.kyc_verification_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kyc_verification_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.managed_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.managed_devices FORCE ROW LEVEL SECURITY;
ALTER TABLE public.mdm_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mdm_commands FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payment_provider_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_provider_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_items FORCE ROW LEVEL SECURITY;
-- End of the preceding independently reviewable database operation.

CREATE POLICY memberships_self_discovery ON public.tenant_memberships
FOR SELECT TO app_runtime
USING (user_id = public.app_user_id());

CREATE POLICY payments_self_insert ON public.payments
FOR INSERT TO app_runtime
WITH CHECK (
  tenant_id = public.app_tenant_id()
  AND public.app_has_permission('self.payments.create')
  AND public.app_owns_customer(customer_id)
  AND (contract_id IS NULL OR public.app_owns_contract(contract_id))
);

CREATE POLICY applications_self_select ON public.financing_applications
FOR SELECT TO app_runtime
USING (
  tenant_id = public.app_tenant_id()
  AND public.app_has_permission('self.applications.read')
  AND public.app_owns_application(id)
);
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
);
-- End of the preceding independently reviewable database operation.

CREATE POLICY documents_select ON public.documents
FOR SELECT TO app_runtime
USING (
  tenant_id = public.app_tenant_id()
  AND (
    public.app_has_permission('documents.read')
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
    public.app_has_permission('documents.manage')
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
    public.app_has_permission('documents.manage')
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

CREATE POLICY kyc_sessions_select ON public.kyc_verification_sessions
FOR SELECT TO app_runtime
USING (
  tenant_id = public.app_tenant_id()
  AND (
    public.app_has_permission('kyc.read')
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
    public.app_has_permission('kyc.manage')
    OR (
      public.app_has_permission('self.kyc.manage')
      AND public.app_owns_application(application_id)
    )
  )
);
CREATE POLICY kyc_sessions_update ON public.kyc_verification_sessions
FOR UPDATE TO app_runtime
USING (tenant_id = public.app_tenant_id() AND public.app_has_permission('kyc.manage'))
WITH CHECK (tenant_id = public.app_tenant_id());

CREATE POLICY managed_devices_select ON public.managed_devices
FOR SELECT TO app_runtime
USING (
  tenant_id = public.app_tenant_id()
  AND (
    public.app_has_permission('devices.read')
    OR (
      public.app_has_permission('self.devices.read')
      AND public.app_owns_contract(contract_id)
    )
  )
);
CREATE POLICY managed_devices_insert ON public.managed_devices
FOR INSERT TO app_runtime
WITH CHECK (tenant_id = public.app_tenant_id() AND public.app_has_permission('devices.manage'));
CREATE POLICY managed_devices_update ON public.managed_devices
FOR UPDATE TO app_runtime
USING (tenant_id = public.app_tenant_id() AND public.app_has_permission('devices.manage'))
WITH CHECK (tenant_id = public.app_tenant_id());

CREATE POLICY mdm_commands_select ON public.mdm_commands
FOR SELECT TO app_runtime
USING (
  tenant_id = public.app_tenant_id()
  AND (
    public.app_has_permission('devices.read')
    OR EXISTS (
      SELECT 1
      FROM public.managed_devices device
      WHERE device.id = managed_device_id
        AND public.app_has_permission('self.devices.read')
        AND public.app_owns_contract(device.contract_id)
    )
  )
);
CREATE POLICY mdm_commands_insert ON public.mdm_commands
FOR INSERT TO app_runtime
WITH CHECK (tenant_id = public.app_tenant_id() AND public.app_has_permission('devices.manage'));
CREATE POLICY mdm_commands_update ON public.mdm_commands
FOR UPDATE TO app_runtime
USING (tenant_id = public.app_tenant_id() AND public.app_has_permission('devices.manage'))
WITH CHECK (tenant_id = public.app_tenant_id());

CREATE POLICY provider_ingress_events_select ON public.payment_provider_events
FOR SELECT TO app_runtime
USING (
  tenant_id = public.app_tenant_id()
  AND (public.app_has_permission('payments.read') OR public.app_has_permission('payments.reconcile'))
);
CREATE POLICY reconciliation_runs_select ON public.reconciliation_runs
FOR SELECT TO app_runtime
USING (tenant_id = public.app_tenant_id() AND public.app_has_permission('payments.reconcile'));
CREATE POLICY reconciliation_runs_insert ON public.reconciliation_runs
FOR INSERT TO app_runtime
WITH CHECK (tenant_id = public.app_tenant_id() AND public.app_has_permission('payments.reconcile'));
CREATE POLICY reconciliation_runs_update ON public.reconciliation_runs
FOR UPDATE TO app_runtime
USING (tenant_id = public.app_tenant_id() AND public.app_has_permission('payments.reconcile'))
WITH CHECK (tenant_id = public.app_tenant_id());
CREATE POLICY reconciliation_items_select ON public.reconciliation_items
FOR SELECT TO app_runtime
USING (tenant_id = public.app_tenant_id() AND public.app_has_permission('payments.reconcile'));
CREATE POLICY reconciliation_items_insert ON public.reconciliation_items
FOR INSERT TO app_runtime
WITH CHECK (tenant_id = public.app_tenant_id() AND public.app_has_permission('payments.reconcile'));
-- End of the preceding independently reviewable database operation.

CREATE POLICY provider_payment_select ON public.payments
FOR SELECT TO app_provider
USING (tenant_id = public.app_tenant_id());
CREATE POLICY provider_payment_update ON public.payments
FOR UPDATE TO app_provider
USING (tenant_id = public.app_tenant_id())
WITH CHECK (tenant_id = public.app_tenant_id());
CREATE POLICY provider_accounts_select ON public.ledger_accounts
FOR SELECT TO app_provider
USING (tenant_id = public.app_tenant_id());
CREATE POLICY provider_journal_entries_insert ON public.journal_entries
FOR INSERT TO app_provider
WITH CHECK (tenant_id = public.app_tenant_id());
CREATE POLICY provider_journal_lines_insert ON public.journal_lines
FOR INSERT TO app_provider
WITH CHECK (tenant_id = public.app_tenant_id());
CREATE POLICY provider_allocations_insert ON public.payment_allocations
FOR INSERT TO app_provider
WITH CHECK (tenant_id = public.app_tenant_id());
CREATE POLICY provider_events_select ON public.payment_provider_events
FOR SELECT TO app_provider
USING (tenant_id = public.app_tenant_id());
CREATE POLICY provider_events_insert ON public.payment_provider_events
FOR INSERT TO app_provider
WITH CHECK (tenant_id = public.app_tenant_id() AND signature_valid);
CREATE POLICY provider_events_update ON public.payment_provider_events
FOR UPDATE TO app_provider
USING (tenant_id = public.app_tenant_id())
WITH CHECK (tenant_id = public.app_tenant_id() AND signature_valid);
CREATE POLICY provider_kyc_sessions_select ON public.kyc_verification_sessions
FOR SELECT TO app_provider
USING (tenant_id = public.app_tenant_id());
CREATE POLICY provider_kyc_sessions_update ON public.kyc_verification_sessions
FOR UPDATE TO app_provider
USING (tenant_id = public.app_tenant_id())
WITH CHECK (tenant_id = public.app_tenant_id());
CREATE POLICY provider_applications_update ON public.financing_applications
FOR UPDATE TO app_provider
USING (tenant_id = public.app_tenant_id())
WITH CHECK (tenant_id = public.app_tenant_id());
CREATE POLICY provider_audit_insert ON public.audit_events
FOR INSERT TO app_provider
WITH CHECK (tenant_id = public.app_tenant_id() AND actor_user_id IS NULL);
-- End of the preceding independently reviewable database operation.

REVOKE ALL ON FUNCTION public.app_owns_application(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_resolve_provider_tenant(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hash_audit_event() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_payment_allocation_integrity() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_verify_audit_chain(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.app_owns_application(uuid) TO app_runtime;
GRANT EXECUTE ON FUNCTION public.app_verify_audit_chain(uuid) TO app_runtime;
GRANT EXECUTE ON FUNCTION public.app_resolve_provider_tenant(text, text, text) TO app_provider;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM app_provider;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM app_provider;
GRANT USAGE ON SCHEMA public TO app_provider;
GRANT SELECT, UPDATE ON public.payments TO app_provider;
GRANT SELECT ON public.ledger_accounts TO app_provider;
GRANT INSERT ON public.journal_entries, public.journal_lines, public.payment_allocations TO app_provider;
GRANT SELECT, INSERT, UPDATE ON public.payment_provider_events TO app_provider;
GRANT SELECT, UPDATE ON public.kyc_verification_sessions TO app_provider;
GRANT SELECT, UPDATE ON public.financing_applications TO app_provider;
GRANT INSERT ON public.audit_events TO app_provider;
-- End of the preceding independently reviewable database operation.
