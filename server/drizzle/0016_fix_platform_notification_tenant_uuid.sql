-- Repair platform notification delivery by preserving the UUID type for tenantless notifications.
DO $$
DECLARE
  function_definition text;
BEGIN
  SELECT pg_get_functiondef(
    'public.app_notify_from_audit_event()'::regprocedure
  )
  INTO function_definition;

  IF position('NULL::uuid, assignment.user_id' IN function_definition) > 0 THEN
    RETURN;
  END IF;

  IF position('NULL, assignment.user_id' IN function_definition) = 0 THEN
    RAISE EXCEPTION
      'app_notify_from_audit_event() does not contain the expected platform notification projection';
  END IF;

  function_definition := replace(
    function_definition,
    'NULL, assignment.user_id',
    'NULL::uuid, assignment.user_id'
  );

  EXECUTE function_definition;
END
$$;

REVOKE ALL ON FUNCTION public.app_notify_from_audit_event() FROM PUBLIC;
