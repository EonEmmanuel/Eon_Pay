ALTER TABLE public.managed_devices
ADD COLUMN inventory_unit_id uuid,
ADD COLUMN serial_number text,
ADD COLUMN enrollment_token_hash text,
ADD COLUMN enrollment_expires_at timestamptz,
ADD COLUMN enrollment_consumed_at timestamptz,
ADD COLUMN credential_hash text,
ADD COLUMN device_owner_attested boolean NOT NULL DEFAULT false,
ADD COLUMN policy_version bigint NOT NULL DEFAULT 0;

ALTER TABLE public.managed_devices
ADD CONSTRAINT managed_devices_inventory_unit_fk
FOREIGN KEY (tenant_id, inventory_unit_id)
REFERENCES public.inventory_units (tenant_id, id);

CREATE UNIQUE INDEX managed_devices_inventory_unit_unique
ON public.managed_devices (tenant_id, inventory_unit_id)
WHERE inventory_unit_id IS NOT NULL;

ALTER TABLE public.managed_devices
ADD CONSTRAINT managed_devices_policy_version_valid CHECK (policy_version >= 0),
ADD CONSTRAINT managed_devices_enrollment_credentials_consistent CHECK (
  (provider <> 'first_party_dpc')
  OR (
    inventory_unit_id IS NOT NULL
    AND (
      (status = 'pending_enrollment' AND enrollment_token_hash IS NOT NULL AND enrollment_expires_at IS NOT NULL)
      OR (status <> 'pending_enrollment' AND credential_hash IS NOT NULL AND enrollment_consumed_at IS NOT NULL)
    )
  )
);

CREATE OR REPLACE FUNCTION public.app_enroll_first_party_device(
  target_device_id uuid,
  supplied_token_hash text,
  next_credential_hash text,
  device_owner_attested boolean,
  next_provider_state jsonb
)
RETURNS TABLE (
  tenant_id uuid,
  contract_id uuid,
  device_status text,
  contract_status text,
  tenant_name text,
  currency text,
  policy_version bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  enrolled_device public.managed_devices%ROWTYPE;
BEGIN
  IF NOT device_owner_attested THEN
    RAISE EXCEPTION 'Device Owner authority is required' USING ERRCODE = '23514';
  END IF;

  UPDATE public.managed_devices device
  SET
    status = 'active',
    credential_hash = next_credential_hash,
    enrollment_consumed_at = now(),
    device_owner_attested = true,
    enrolled_at = now(),
    last_seen_at = now(),
    policy_version = 1,
    provider_state = COALESCE(next_provider_state, '{}'::jsonb)
  WHERE device.id = target_device_id
    AND device.provider = 'first_party_dpc'
    AND device.status = 'pending_enrollment'
    AND device.enrollment_consumed_at IS NULL
    AND device.enrollment_expires_at > now()
    AND device.enrollment_token_hash = supplied_token_hash
  RETURNING device.* INTO enrolled_device;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Device enrollment credential is invalid' USING ERRCODE = '28000';
  END IF;

  INSERT INTO public.audit_events (
    tenant_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    details
  ) VALUES (
    enrolled_device.tenant_id,
    NULL,
    'device.agent.enrolled',
    'managed_device',
    enrolled_device.id::text,
    jsonb_build_object('contractId', enrolled_device.contract_id)
  );

  RETURN QUERY
  SELECT
    enrolled_device.tenant_id,
    enrolled_device.contract_id,
    enrolled_device.status::text,
    contract.status::text,
    tenant.name,
    contract.currency,
    enrolled_device.policy_version
  FROM public.financing_contracts contract
  JOIN public.tenants tenant ON tenant.id = enrolled_device.tenant_id
  WHERE contract.tenant_id = enrolled_device.tenant_id
    AND contract.id = enrolled_device.contract_id;
END
$$;

CREATE OR REPLACE FUNCTION public.app_check_in_first_party_device(
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
    pending_commands
  FROM public.financing_contracts contract
  JOIN public.tenants tenant ON tenant.id = checked_in_device.tenant_id
  WHERE contract.tenant_id = checked_in_device.tenant_id
    AND contract.id = checked_in_device.contract_id;
END
$$;

CREATE OR REPLACE FUNCTION public.app_acknowledge_first_party_command(
  target_device_id uuid,
  target_command_id uuid,
  supplied_credential_hash text,
  succeeded boolean,
  reported_failure_reason text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  device_tenant_id uuid;
  acknowledged boolean;
BEGIN
  SELECT device.tenant_id
  INTO device_tenant_id
  FROM public.managed_devices device
  WHERE device.id = target_device_id
    AND device.provider = 'first_party_dpc'
    AND device.credential_hash = supplied_credential_hash;

  IF device_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Device credential is invalid' USING ERRCODE = '28000';
  END IF;

  UPDATE public.mdm_commands command
  SET
    status = CASE WHEN succeeded THEN 'acknowledged'::public.mdm_command_status ELSE 'failed'::public.mdm_command_status END,
    acknowledged_at = CASE WHEN succeeded THEN now() ELSE NULL END,
    failure_reason = CASE
      WHEN succeeded THEN NULL
      ELSE COALESCE(NULLIF(reported_failure_reason, ''), 'Agent rejected command')
    END
  WHERE command.tenant_id = device_tenant_id
    AND command.managed_device_id = target_device_id
    AND command.id = target_command_id
    AND command.status = 'sent';

  acknowledged := FOUND;
  IF acknowledged THEN
    INSERT INTO public.audit_events (
      tenant_id,
      actor_user_id,
      action,
      resource_type,
      resource_id,
      details
    ) VALUES (
      device_tenant_id,
      NULL,
      'device.agent.command_acknowledged',
      'mdm_command',
      target_command_id::text,
      jsonb_build_object('deviceId', target_device_id, 'success', succeeded)
    );
  END IF;
  RETURN acknowledged;
END
$$;

REVOKE ALL ON FUNCTION public.app_enroll_first_party_device(uuid, text, text, boolean, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_check_in_first_party_device(uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_acknowledge_first_party_command(uuid, uuid, text, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_enroll_first_party_device(uuid, text, text, boolean, jsonb) TO app_runtime;
GRANT EXECUTE ON FUNCTION public.app_check_in_first_party_device(uuid, text, jsonb) TO app_runtime;
GRANT EXECUTE ON FUNCTION public.app_acknowledge_first_party_command(uuid, uuid, text, boolean, text) TO app_runtime;
