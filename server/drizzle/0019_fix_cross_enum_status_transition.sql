CREATE OR REPLACE FUNCTION public.validate_domain_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  transition_allowed boolean;
  old_status text;
  new_status text;
BEGIN
  old_status := OLD.status::text;
  new_status := NEW.status::text;

  IF new_status = old_status THEN
    RETURN NEW;
  END IF;

  transition_allowed := CASE TG_TABLE_NAME
    WHEN 'financing_applications' THEN CASE old_status
      WHEN 'draft' THEN new_status IN ('submitted', 'cancelled')
      WHEN 'submitted' THEN new_status IN ('kyc_review', 'cancelled', 'expired')
      WHEN 'kyc_review' THEN new_status IN ('credit_review', 'rejected', 'cancelled', 'expired')
      WHEN 'credit_review' THEN new_status IN ('approved', 'rejected', 'cancelled', 'expired')
      ELSE false
    END
    WHEN 'financing_contracts' THEN CASE old_status
      WHEN 'draft' THEN new_status IN ('pending_signature', 'cancelled')
      WHEN 'pending_signature' THEN new_status IN ('active', 'cancelled')
      WHEN 'active' THEN new_status IN ('past_due', 'suspended', 'completed', 'terminated', 'written_off')
      WHEN 'past_due' THEN new_status IN ('active', 'suspended', 'completed', 'terminated', 'written_off')
      WHEN 'suspended' THEN new_status IN ('active', 'past_due', 'terminated', 'written_off')
      ELSE false
    END
    WHEN 'payments' THEN CASE old_status
      WHEN 'initiated' THEN new_status IN ('pending', 'settled', 'failed', 'cancelled')
      WHEN 'pending' THEN new_status IN ('settled', 'failed', 'cancelled')
      WHEN 'settled' THEN new_status = 'reversed'
      ELSE false
    END
    WHEN 'fee_assessments' THEN
      old_status = 'assessed' AND new_status IN ('waived', 'reversed')
    ELSE false
  END;

  IF NOT transition_allowed THEN
    RAISE EXCEPTION 'Invalid % status transition from % to %',
      TG_TABLE_NAME, old_status, new_status
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
