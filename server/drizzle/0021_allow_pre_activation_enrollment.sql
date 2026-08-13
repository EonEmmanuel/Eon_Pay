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
  IF TG_TABLE_NAME = 'payments' THEN
    IF NEW.contract_id IS NOT NULL THEN
      SELECT customer_id INTO expected_customer
      FROM public.financing_contracts
      WHERE tenant_id = NEW.tenant_id AND id = NEW.contract_id;
      IF expected_customer IS DISTINCT FROM NEW.customer_id THEN
        RAISE EXCEPTION 'Payment customer must match its contract customer'
          USING ERRCODE = '23514';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'documents' THEN
    IF NEW.customer_id IS NOT NULL AND NEW.application_id IS NOT NULL THEN
      SELECT customer_id INTO expected_customer
      FROM public.financing_applications
      WHERE tenant_id = NEW.tenant_id AND id = NEW.application_id;
      IF expected_customer IS DISTINCT FROM NEW.customer_id THEN
        RAISE EXCEPTION 'Document customer must match its application customer'
          USING ERRCODE = '23514';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'kyc_verification_sessions' THEN
    IF NEW.customer_id IS NOT NULL THEN
      SELECT customer_id INTO expected_customer
      FROM public.financing_applications
      WHERE tenant_id = NEW.tenant_id AND id = NEW.application_id;
      IF expected_customer IS DISTINCT FROM NEW.customer_id THEN
        RAISE EXCEPTION 'KYC customer must match its application customer'
          USING ERRCODE = '23514';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'managed_devices' THEN
    SELECT device ->> 'imei' INTO expected_imei
    FROM public.financing_contracts
    WHERE tenant_id = NEW.tenant_id AND id = NEW.contract_id;
    -- ONLY check if the contract already has an IMEI (i.e. post-activation)
    IF expected_imei IS NOT NULL AND expected_imei IS DISTINCT FROM NEW.imei THEN
      RAISE EXCEPTION 'Managed device IMEI must match its signed contract'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
