CREATE OR REPLACE FUNCTION public.app_check_in_first_party_device_v2(
  target_device_id uuid,
  supplied_credential_hash text,
  next_provider_state jsonb
)
RETURNS TABLE (
  tenant_id uuid,
  contract_id uuid,
  device_status text,
  contract_status text,
  tenant_name text,
  currency text,
  policy_version bigint,
  provider_state jsonb,
  commands jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  checked_in_device public.managed_devices%ROWTYPE;
  pending_commands jsonb;
BEGIN
  UPDATE public.managed_devices device
  SET
    last_seen_at = now(),
    policy_version = device.policy_version + 1,
    provider_state = device.provider_state || COALESCE(next_provider_state, '{}'::jsonb)
  WHERE device.id = target_device_id
    AND device.provider = 'first_party_dpc'
    AND device.status IN ('active', 'restricted', 'error')
    AND device.credential_hash = supplied_credential_hash
  RETURNING device.* INTO checked_in_device;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Device credential is invalid' USING ERRCODE = '28000';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', command.id,
        'kind', command.kind,
        'reason', command.reason
      )
      ORDER BY command.created_at
    ),
    '[]'::jsonb
  )
  INTO pending_commands
  FROM public.mdm_commands command
  WHERE command.tenant_id = checked_in_device.tenant_id
    AND command.managed_device_id = checked_in_device.id
    AND command.status = 'queued';

  UPDATE public.mdm_commands command
  SET status = 'sent', sent_at = now()
  WHERE command.tenant_id = checked_in_device.tenant_id
    AND command.managed_device_id = checked_in_device.id
    AND command.status = 'queued';

  RETURN QUERY
  SELECT
    checked_in_device.tenant_id,
    checked_in_device.contract_id,
    checked_in_device.status::text,
    contract.status::text,
    tenant.name,
    contract.currency,
    checked_in_device.policy_version,
    checked_in_device.provider_state,
    pending_commands
  FROM public.financing_contracts contract
  JOIN public.tenants tenant ON tenant.id = checked_in_device.tenant_id
  WHERE contract.tenant_id = checked_in_device.tenant_id
    AND contract.id = checked_in_device.contract_id;
END
$$;

REVOKE ALL ON FUNCTION public.app_check_in_first_party_device_v2(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_check_in_first_party_device_v2(uuid, text, jsonb) TO app_runtime;