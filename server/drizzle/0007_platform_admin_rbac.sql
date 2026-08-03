CREATE TABLE "platform_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"normalized_email" text NOT NULL,
	"full_name" text NOT NULL,
	"role_id" uuid NOT NULL,
	"status" "tenant_invitation_status" DEFAULT 'pending' NOT NULL,
	"delivery_status" "invitation_delivery_status" DEFAULT 'pending' NOT NULL,
	"requires_password_setup" boolean DEFAULT true NOT NULL,
	"sent_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_by" uuid,
	"accepted_at" timestamp with time zone,
	"delivery_error" text,
	"invited_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_invitations_email_normalized" CHECK ("platform_invitations"."normalized_email" = lower(btrim("platform_invitations"."email"))),
	CONSTRAINT "platform_invitations_acceptance_consistent" CHECK (("platform_invitations"."status" = 'accepted' AND "platform_invitations"."accepted_by" IS NOT NULL AND "platform_invitations"."accepted_at" IS NOT NULL)
          OR ("platform_invitations"."status" <> 'accepted' AND "platform_invitations"."accepted_by" IS NULL AND "platform_invitations"."accepted_at" IS NULL)),
	CONSTRAINT "platform_invitations_expiry_valid" CHECK ("platform_invitations"."expires_at" > "platform_invitations"."created_at")
);

ALTER TABLE "platform_invitations" ADD CONSTRAINT "platform_invitations_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "platform_invitations" ADD CONSTRAINT "platform_invitations_accepted_by_user_profiles_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "platform_invitations" ADD CONSTRAINT "platform_invitations_invited_by_user_profiles_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;
CREATE UNIQUE INDEX "platform_invitations_pending_email_role_unique" ON "platform_invitations" USING btree ("normalized_email","role_id") WHERE "platform_invitations"."status" = 'pending';
CREATE INDEX "platform_invitations_recipient_idx" ON "platform_invitations" USING btree ("normalized_email","status","expires_at");
CREATE INDEX "platform_invitations_status_idx" ON "platform_invitations" USING btree ("status","created_at");
-- Granular platform permissions keep operational duties separate from ownership authority.
INSERT INTO public.permissions (code, description)
VALUES
  ('platform.users.read', 'Read platform staff and their effective roles'),
  ('platform.users.invite', 'Invite and revoke platform staff invitations'),
  ('platform.users.update', 'Update platform staff profile information'),
  ('platform.users.disable', 'Disable and reactivate platform staff accounts'),
  ('platform.users.roles.manage', 'Assign and revoke non-owner platform roles'),
  ('platform.owners.manage', 'Assign and administer the platform owner role'),
  ('platform.settings.read', 'Read general platform configuration'),
  ('platform.settings.manage', 'Manage general platform configuration'),
  ('platform.risk.read', 'Read platform risk policy configuration'),
  ('platform.risk.manage', 'Manage platform risk policy configuration'),
  ('platform.health.read', 'Read platform service health'),
  ('platform.billing.read', 'Read platform billing and usage information'),
  ('platform.devices.read', 'Read the cross-tenant managed-device fleet')
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO public.roles (id, scope, key, name, system)
VALUES
  ('00000000-0000-4000-8000-000000000003', 'platform', 'platform_compliance', 'Platform compliance officer', true),
  ('00000000-0000-4000-8000-000000000004', 'platform', 'platform_finance', 'Platform finance officer', true),
  ('00000000-0000-4000-8000-000000000005', 'platform', 'platform_support', 'Platform support officer', true),
  ('00000000-0000-4000-8000-000000000006', 'platform', 'platform_auditor', 'Platform auditor', true)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

UPDATE public.roles
SET name = 'Platform operations administrator'
WHERE id = '00000000-0000-4000-8000-000000000002'::uuid;

DELETE FROM public.role_permissions
WHERE role_id IN (
  '00000000-0000-4000-8000-000000000001'::uuid,
  '00000000-0000-4000-8000-000000000002'::uuid,
  '00000000-0000-4000-8000-000000000003'::uuid,
  '00000000-0000-4000-8000-000000000004'::uuid,
  '00000000-0000-4000-8000-000000000005'::uuid,
  '00000000-0000-4000-8000-000000000006'::uuid
);

INSERT INTO public.role_permissions (role_id, permission_code)
SELECT '00000000-0000-4000-8000-000000000001'::uuid, code
FROM public.permissions
WHERE code LIKE 'platform.%'
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_code)
SELECT role_id, permission_code
FROM (
  SELECT
    '00000000-0000-4000-8000-000000000002'::uuid AS role_id,
    code AS permission_code
  FROM public.permissions
  WHERE code IN (
    'platform.tenants.read', 'platform.tenants.create', 'platform.tenants.manage',
    'platform.users.read', 'platform.users.invite', 'platform.users.update',
    'platform.users.disable', 'platform.users.roles.manage', 'platform.audit.read',
    'platform.settings.read', 'platform.settings.manage', 'platform.risk.read',
    'platform.risk.manage', 'platform.health.read', 'platform.billing.read',
    'platform.devices.read'
  )
  UNION ALL
  SELECT '00000000-0000-4000-8000-000000000003'::uuid, code
  FROM public.permissions
  WHERE code IN (
    'platform.tenants.read', 'platform.users.read', 'platform.audit.read',
    'platform.risk.read'
  )
  UNION ALL
  SELECT '00000000-0000-4000-8000-000000000004'::uuid, code
  FROM public.permissions
  WHERE code IN (
    'platform.tenants.read', 'platform.billing.read', 'platform.audit.read'
  )
  UNION ALL
  SELECT '00000000-0000-4000-8000-000000000005'::uuid, code
  FROM public.permissions
  WHERE code IN (
    'platform.tenants.read', 'platform.users.read', 'platform.devices.read',
    'platform.health.read'
  )
  UNION ALL
  SELECT '00000000-0000-4000-8000-000000000006'::uuid, code
  FROM public.permissions
  WHERE code IN (
    'platform.tenants.read', 'platform.users.read', 'platform.audit.read',
    'platform.settings.read', 'platform.risk.read', 'platform.health.read',
    'platform.billing.read', 'platform.devices.read'
  )
) grants
ON CONFLICT DO NOTHING;

-- Platform identity visibility now follows the dedicated read permission.
CREATE OR REPLACE FUNCTION public.app_can_view_user(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT target_user_id = public.app_user_id()
    OR public.app_has_platform_permission('platform.users.read')
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

DROP POLICY user_profiles_update ON public.user_profiles;
CREATE POLICY user_profiles_update ON public.user_profiles
FOR UPDATE TO app_runtime
USING (
  id = public.app_user_id()
  OR public.app_has_platform_permission('platform.users.update')
)
WITH CHECK (
  id = public.app_user_id()
  OR public.app_has_platform_permission('platform.users.update')
);

DROP POLICY roles_select ON public.roles;
CREATE POLICY roles_select ON public.roles
FOR SELECT TO app_runtime
USING (
  system
  OR tenant_id = public.app_tenant_id()
  OR public.app_has_platform_permission('platform.users.read')
);

DROP POLICY platform_roles_select ON public.platform_role_assignments;
CREATE POLICY platform_roles_select ON public.platform_role_assignments
FOR SELECT TO app_runtime
USING (
  user_id = public.app_user_id()
  OR public.app_has_platform_permission('platform.users.read')
);

DROP POLICY platform_roles_insert ON public.platform_role_assignments;

DROP POLICY platform_settings_select ON public.platform_settings;
CREATE POLICY platform_settings_select ON public.platform_settings
FOR SELECT TO app_runtime
USING (
  (key = 'general' AND public.app_has_platform_permission('platform.settings.read'))
  OR (key = 'risk_rules' AND public.app_has_platform_permission('platform.risk.read'))
);

DROP POLICY platform_settings_insert ON public.platform_settings;
CREATE POLICY platform_settings_insert ON public.platform_settings
FOR INSERT TO app_runtime
WITH CHECK (
  (key = 'general' AND public.app_has_platform_permission('platform.settings.manage'))
  OR (key = 'risk_rules' AND public.app_has_platform_permission('platform.risk.manage'))
);

DROP POLICY platform_settings_update ON public.platform_settings;
CREATE POLICY platform_settings_update ON public.platform_settings
FOR UPDATE TO app_runtime
USING (
  (key = 'general' AND public.app_has_platform_permission('platform.settings.manage'))
  OR (key = 'risk_rules' AND public.app_has_platform_permission('platform.risk.manage'))
)
WITH CHECK (
  (key = 'general' AND public.app_has_platform_permission('platform.settings.manage'))
  OR (key = 'risk_rules' AND public.app_has_platform_permission('platform.risk.manage'))
);

-- Staff invitation rows are isolated to authorized administrators or the addressed identity.
CREATE TRIGGER platform_invitations_set_updated_at
BEFORE UPDATE ON public.platform_invitations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.platform_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_invitations FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.app_has_pending_platform_invitation()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_invitations invitation
    JOIN public.user_profiles profile
      ON profile.id = public.app_user_id()
    WHERE invitation.normalized_email = lower(profile.email)
      AND invitation.status = 'pending'
      AND invitation.expires_at > now()
      AND NOT profile.disabled
  )
$$;

CREATE POLICY platform_invitations_select ON public.platform_invitations
FOR SELECT TO app_runtime
USING (
  public.app_has_platform_permission('platform.users.read')
  OR (
    public.app_has_pending_platform_invitation()
    AND normalized_email = (
      SELECT lower(profile.email)
      FROM public.user_profiles profile
      WHERE profile.id = public.app_user_id()
    )
  )
);

CREATE POLICY platform_invitations_insert ON public.platform_invitations
FOR INSERT TO app_runtime
WITH CHECK (
  public.app_has_platform_permission('platform.users.invite')
  AND EXISTS (
    SELECT 1
    FROM public.roles role
    WHERE role.id = platform_invitations.role_id
      AND role.scope = 'platform'
      AND role.tenant_id IS NULL
      AND (
        role.key <> 'platform_owner'
        OR public.app_has_platform_permission('platform.owners.manage')
      )
  )
);

CREATE POLICY platform_invitations_update ON public.platform_invitations
FOR UPDATE TO app_runtime
USING (public.app_has_platform_permission('platform.users.invite'))
WITH CHECK (
  public.app_has_platform_permission('platform.users.invite')
  AND EXISTS (
    SELECT 1
    FROM public.roles role
    WHERE role.id = platform_invitations.role_id
      AND role.scope = 'platform'
      AND role.tenant_id IS NULL
      AND (
        role.key <> 'platform_owner'
        OR public.app_has_platform_permission('platform.owners.manage')
      )
  )
);

CREATE OR REPLACE FUNCTION public.validate_platform_invitation_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  authenticated_email text;
BEGIN
  IF OLD.email IS DISTINCT FROM NEW.email
    OR OLD.normalized_email IS DISTINCT FROM NEW.normalized_email
    OR OLD.role_id IS DISTINCT FROM NEW.role_id
    OR OLD.invited_by IS DISTINCT FROM NEW.invited_by
    OR OLD.expires_at IS DISTINCT FROM NEW.expires_at THEN
    RAISE EXCEPTION 'Invitation identity fields are immutable'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.status <> 'pending' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Terminal invitations are immutable'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'accepted' AND OLD.status <> 'accepted' THEN
    SELECT lower(email) INTO authenticated_email
    FROM public.user_profiles
    WHERE id = public.app_user_id();

    IF NEW.accepted_by IS DISTINCT FROM public.app_user_id()
      OR authenticated_email IS DISTINCT FROM NEW.normalized_email THEN
      RAISE EXCEPTION 'Invitation acceptance does not match the authenticated identity'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER platform_invitations_validate_update
BEFORE UPDATE ON public.platform_invitations
FOR EACH ROW EXECUTE FUNCTION public.validate_platform_invitation_update();

-- Acceptance grants exactly the role encoded by the authorized invitation and records immutable evidence.
CREATE OR REPLACE FUNCTION public.app_accept_platform_invitation(
  target_invitation_id uuid,
  audit_request_id text DEFAULT NULL,
  audit_ip_address text DEFAULT NULL,
  audit_user_agent text DEFAULT NULL
)
RETURNS TABLE (user_id uuid, role_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  invitation_record public.platform_invitations%ROWTYPE;
  authenticated_user_id uuid;
  authenticated_email text;
BEGIN
  authenticated_user_id := public.app_user_id();
  IF authenticated_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required'
      USING ERRCODE = '42501';
  END IF;

  SELECT lower(email) INTO authenticated_email
  FROM public.user_profiles
  WHERE id = authenticated_user_id
    AND NOT disabled;

  SELECT invitation.* INTO invitation_record
  FROM public.platform_invitations invitation
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

  IF NOT EXISTS (
    SELECT 1
    FROM public.roles role
    WHERE role.id = invitation_record.role_id
      AND role.scope = 'platform'
      AND role.tenant_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Invitation role is not a platform role'
      USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.platform_role_assignments (
    user_id,
    role_id,
    assigned_by
  )
  VALUES (
    authenticated_user_id,
    invitation_record.role_id,
    invitation_record.invited_by
  )
  ON CONFLICT (user_id, role_id) DO NOTHING;

  UPDATE public.platform_invitations
  SET status = 'accepted',
      accepted_by = authenticated_user_id,
      accepted_at = now(),
      updated_at = now()
  WHERE id = invitation_record.id;

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
    NULL,
    authenticated_user_id,
    'platform.invitation.accepted',
    'platform_invitation',
    invitation_record.id::text,
    audit_request_id,
    audit_ip_address,
    audit_user_agent,
    jsonb_build_object('roleId', invitation_record.role_id)
  );

  RETURN QUERY SELECT authenticated_user_id, invitation_record.role_id;
END
$$;

-- Role mutations use database-level continuity checks so concurrent requests cannot remove the last owner.
CREATE OR REPLACE FUNCTION public.app_assign_platform_role(
  target_user_id uuid,
  target_role_id uuid,
  audit_request_id text DEFAULT NULL,
  audit_ip_address text DEFAULT NULL,
  audit_user_agent text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_role_key text;
BEGIN
  IF NOT public.app_has_platform_permission('platform.users.roles.manage') THEN
    RAISE EXCEPTION 'Platform role management permission required'
      USING ERRCODE = '42501';
  END IF;

  IF target_user_id = public.app_user_id() THEN
    RAISE EXCEPTION 'Self-service role changes are not permitted'
      USING ERRCODE = '42501';
  END IF;

  SELECT role.key INTO target_role_key
  FROM public.roles role
  WHERE role.id = target_role_id
    AND role.scope = 'platform'
    AND role.tenant_id IS NULL;

  IF target_role_key IS NULL THEN
    RAISE EXCEPTION 'Platform role was not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF target_role_key = 'platform_owner'
    AND NOT public.app_has_platform_permission('platform.owners.manage') THEN
    RAISE EXCEPTION 'Platform owner authority is required'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_profiles profile
    WHERE profile.id = target_user_id
      AND NOT profile.disabled
  ) THEN
    RAISE EXCEPTION 'Active platform identity was not found'
      USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.platform_role_assignments (user_id, role_id, assigned_by)
  VALUES (target_user_id, target_role_id, public.app_user_id())
  ON CONFLICT (user_id, role_id) DO NOTHING;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Platform role is already assigned'
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.audit_events (
    tenant_id, actor_user_id, action, resource_type, resource_id,
    request_id, ip_address, user_agent, details
  )
  VALUES (
    NULL, public.app_user_id(), 'platform.user.role_assigned', 'user_profile',
    target_user_id::text, audit_request_id, audit_ip_address, audit_user_agent,
    jsonb_build_object('roleId', target_role_id, 'roleKey', target_role_key)
  );
END
$$;

CREATE OR REPLACE FUNCTION public.app_revoke_platform_role(
  target_user_id uuid,
  target_role_id uuid,
  audit_request_id text DEFAULT NULL,
  audit_ip_address text DEFAULT NULL,
  audit_user_agent text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_role_key text;
  active_owner_count bigint;
BEGIN
  IF NOT public.app_has_platform_permission('platform.users.roles.manage') THEN
    RAISE EXCEPTION 'Platform role management permission required'
      USING ERRCODE = '42501';
  END IF;

  IF target_user_id = public.app_user_id() THEN
    RAISE EXCEPTION 'Self-service role changes are not permitted'
      USING ERRCODE = '42501';
  END IF;

  SELECT role.key INTO target_role_key
  FROM public.roles role
  JOIN public.platform_role_assignments assignment
    ON assignment.role_id = role.id
   AND assignment.user_id = target_user_id
  WHERE role.id = target_role_id
    AND role.scope = 'platform';

  IF target_role_key IS NULL THEN
    RAISE EXCEPTION 'Assigned platform role was not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF target_role_key = 'platform_owner' THEN
    IF NOT public.app_has_platform_permission('platform.owners.manage') THEN
      RAISE EXCEPTION 'Platform owner authority is required'
        USING ERRCODE = '42501';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended('platform-owner-continuity', 0));
    SELECT count(*) INTO active_owner_count
    FROM public.platform_role_assignments assignment
    JOIN public.roles role ON role.id = assignment.role_id
    JOIN public.user_profiles profile ON profile.id = assignment.user_id
    WHERE role.key = 'platform_owner'
      AND role.scope = 'platform'
      AND NOT profile.disabled;

    IF active_owner_count <= 1 THEN
      RAISE EXCEPTION 'The last active platform owner cannot be removed'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  DELETE FROM public.platform_role_assignments
  WHERE user_id = target_user_id
    AND role_id = target_role_id;

  INSERT INTO public.audit_events (
    tenant_id, actor_user_id, action, resource_type, resource_id,
    request_id, ip_address, user_agent, details
  )
  VALUES (
    NULL, public.app_user_id(), 'platform.user.role_revoked', 'user_profile',
    target_user_id::text, audit_request_id, audit_ip_address, audit_user_agent,
    jsonb_build_object('roleId', target_role_id, 'roleKey', target_role_key)
  );
END
$$;

CREATE OR REPLACE FUNCTION public.app_set_platform_user_disabled(
  target_user_id uuid,
  target_disabled boolean,
  audit_request_id text DEFAULT NULL,
  audit_ip_address text DEFAULT NULL,
  audit_user_agent text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_is_owner boolean;
  active_owner_count bigint;
BEGIN
  IF NOT public.app_has_platform_permission('platform.users.disable') THEN
    RAISE EXCEPTION 'Platform user disable permission required'
      USING ERRCODE = '42501';
  END IF;

  IF target_user_id = public.app_user_id() THEN
    RAISE EXCEPTION 'You cannot change your own platform access state'
      USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.platform_role_assignments assignment
    JOIN public.roles role ON role.id = assignment.role_id
    WHERE assignment.user_id = target_user_id
      AND role.key = 'platform_owner'
      AND role.scope = 'platform'
  ) INTO target_is_owner;

  IF target_is_owner THEN
    IF NOT public.app_has_platform_permission('platform.owners.manage') THEN
      RAISE EXCEPTION 'Platform owner authority is required'
        USING ERRCODE = '42501';
    END IF;

    IF target_disabled THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('platform-owner-continuity', 0));
      SELECT count(*) INTO active_owner_count
      FROM public.platform_role_assignments assignment
      JOIN public.roles role ON role.id = assignment.role_id
      JOIN public.user_profiles profile ON profile.id = assignment.user_id
      WHERE role.key = 'platform_owner'
        AND role.scope = 'platform'
        AND NOT profile.disabled;

      IF active_owner_count <= 1 THEN
        RAISE EXCEPTION 'The last active platform owner cannot be disabled'
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  UPDATE public.user_profiles
  SET disabled = target_disabled,
      updated_at = now()
  WHERE id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Platform user was not found'
      USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.audit_events (
    tenant_id, actor_user_id, action, resource_type, resource_id,
    request_id, ip_address, user_agent, details
  )
  VALUES (
    NULL, public.app_user_id(), 'platform.user.access_changed', 'user_profile',
    target_user_id::text, audit_request_id, audit_ip_address, audit_user_agent,
    jsonb_build_object('disabled', target_disabled)
  );
END
$$;

-- MFA enforcement defaults to secure when the setting has not been initialized.
CREATE OR REPLACE FUNCTION public.app_platform_mfa_required()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1
      FROM public.platform_role_assignments assignment
      JOIN public.roles role ON role.id = assignment.role_id
      JOIN public.user_profiles profile ON profile.id = assignment.user_id
      WHERE assignment.user_id = public.app_user_id()
        AND role.scope = 'platform'
        AND NOT profile.disabled
    ) THEN false
    ELSE COALESCE(
      (
        SELECT (setting.value #>> '{toggles,requireStaffMfa}')::boolean
        FROM public.platform_settings setting
        WHERE setting.key = 'general'
      ),
      true
    )
  END
$$;

-- Platform audit verification never opens tenant audit rows to cross-tenant reads.
CREATE OR REPLACE FUNCTION public.app_verify_platform_audit_chain()
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
  IF NOT public.app_has_platform_permission('platform.audit.read') THEN
    RAISE EXCEPTION 'Platform audit permission required'
      USING ERRCODE = '42501';
  END IF;

  prior_hash := NULL;
  FOR event_row IN
    SELECT *
    FROM public.audit_events
    WHERE tenant_id IS NULL
    ORDER BY occurred_at, id
  LOOP
    calculated_hash := encode(
      digest(
        convert_to(
          concat_ws(
            '|',
            event_row.id::text,
            '',
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
      OR event_row.event_hash IS DISTINCT FROM calculated_hash THEN
      RETURN QUERY SELECT false, checked_count, event_row.id;
      RETURN;
    END IF;
    prior_hash := event_row.event_hash;
  END LOOP;

  RETURN QUERY SELECT true, checked_count, NULL::uuid;
END
$$;

-- Invitation identity lookup is limited to authorized tenant or platform inviters.
CREATE OR REPLACE FUNCTION public.app_user_profile_exists_by_email(target_email text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT (
    public.app_has_platform_permission('platform.users.invite')
    OR public.app_has_platform_permission('platform.tenants.create')
    OR public.app_has_permission('memberships.manage')
  ) THEN
    RAISE EXCEPTION 'Insufficient permission to resolve an invitation identity'
      USING ERRCODE = '42501';
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.user_profiles profile
    WHERE lower(profile.email) = lower(btrim(target_email))
  );
END
$$;

REVOKE ALL ON FUNCTION public.app_has_pending_platform_invitation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_platform_invitation_update() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_accept_platform_invitation(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_assign_platform_role(uuid, uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_revoke_platform_role(uuid, uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_set_platform_user_disabled(uuid, boolean, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_platform_mfa_required() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_verify_platform_audit_chain() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.app_has_pending_platform_invitation() TO app_runtime;
GRANT EXECUTE ON FUNCTION public.app_accept_platform_invitation(uuid, text, text, text) TO app_runtime;
GRANT EXECUTE ON FUNCTION public.app_assign_platform_role(uuid, uuid, text, text, text) TO app_runtime;
GRANT EXECUTE ON FUNCTION public.app_revoke_platform_role(uuid, uuid, text, text, text) TO app_runtime;
GRANT EXECUTE ON FUNCTION public.app_set_platform_user_disabled(uuid, boolean, text, text, text) TO app_runtime;
GRANT EXECUTE ON FUNCTION public.app_platform_mfa_required() TO app_runtime;
GRANT EXECUTE ON FUNCTION public.app_verify_platform_audit_chain() TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON public.platform_invitations TO app_runtime;
REVOKE DELETE, TRUNCATE, TRIGGER, REFERENCES ON public.platform_invitations FROM app_runtime;