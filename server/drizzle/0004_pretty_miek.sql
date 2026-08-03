CREATE TYPE "public"."invitation_delivery_status" AS ENUM('pending', 'sent', 'failed');
CREATE TYPE "public"."tenant_invitation_status" AS ENUM('pending', 'accepted', 'expired', 'revoked');
CREATE TYPE "public"."tenant_onboarding_status" AS ENUM('pending_owner', 'active');
CREATE TABLE "tenant_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
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
	CONSTRAINT "tenant_invitations_email_normalized" CHECK ("tenant_invitations"."normalized_email" = lower(btrim("tenant_invitations"."email"))),
	CONSTRAINT "tenant_invitations_acceptance_consistent" CHECK (("tenant_invitations"."status" = 'accepted' AND "tenant_invitations"."accepted_by" IS NOT NULL AND "tenant_invitations"."accepted_at" IS NOT NULL)
          OR ("tenant_invitations"."status" <> 'accepted' AND "tenant_invitations"."accepted_by" IS NULL AND "tenant_invitations"."accepted_at" IS NULL)),
	CONSTRAINT "tenant_invitations_expiry_valid" CHECK ("tenant_invitations"."expires_at" > "tenant_invitations"."created_at")
);

ALTER TABLE "tenants" ADD COLUMN "onboarding_status" "tenant_onboarding_status" DEFAULT 'active' NOT NULL;
ALTER TABLE "tenant_invitations" ADD CONSTRAINT "tenant_invitations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "tenant_invitations" ADD CONSTRAINT "tenant_invitations_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "tenant_invitations" ADD CONSTRAINT "tenant_invitations_accepted_by_user_profiles_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "tenant_invitations" ADD CONSTRAINT "tenant_invitations_invited_by_user_profiles_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;
CREATE UNIQUE INDEX "tenant_invitations_tenant_id_unique" ON "tenant_invitations" USING btree ("tenant_id","id");
CREATE UNIQUE INDEX "tenant_invitations_pending_email_role_unique" ON "tenant_invitations" USING btree ("tenant_id","normalized_email","role_id") WHERE "tenant_invitations"."status" = 'pending';
CREATE INDEX "tenant_invitations_recipient_idx" ON "tenant_invitations" USING btree ("normalized_email","status","expires_at");
CREATE INDEX "tenant_invitations_tenant_status_idx" ON "tenant_invitations" USING btree ("tenant_id","status");
-- Invitation rows inherit tenant isolation and cannot be reassigned after creation.
CREATE TRIGGER tenant_invitations_set_updated_at
BEFORE UPDATE ON public.tenant_invitations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tenant_invitations_prevent_tenant_reassignment
BEFORE UPDATE ON public.tenant_invitations
FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_reassignment();

ALTER TABLE public.tenant_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_invitations FORCE ROW LEVEL SECURITY;

-- A verified Auth email may discover only its own live invitations.
CREATE OR REPLACE FUNCTION public.app_has_pending_tenant_invitation(
  target_tenant_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_invitations invitation
    JOIN public.user_profiles profile
      ON profile.id = public.app_user_id()
    WHERE invitation.tenant_id = target_tenant_id
      AND invitation.normalized_email = lower(profile.email)
      AND invitation.status = 'pending'
      AND invitation.expires_at > now()
  )
$$;

ALTER POLICY tenants_select ON public.tenants
USING (
  public.app_is_active_member(id)
  OR public.app_has_platform_permission('platform.tenants.read')
  OR public.app_has_pending_tenant_invitation(id)
);

CREATE POLICY tenant_invitations_select ON public.tenant_invitations
FOR SELECT TO app_runtime
USING (
  (
    tenant_id = public.app_tenant_id()
    AND public.app_has_permission('memberships.read')
  )
  OR public.app_has_platform_permission('platform.tenants.read')
  OR public.app_has_pending_tenant_invitation(tenant_id)
);

CREATE POLICY tenant_invitations_insert ON public.tenant_invitations
FOR INSERT TO app_runtime
WITH CHECK (
  (
    tenant_id = public.app_tenant_id()
    AND public.app_has_permission('memberships.manage')
  )
  OR public.app_has_platform_permission('platform.tenants.create')
);

CREATE POLICY tenant_invitations_update ON public.tenant_invitations
FOR UPDATE TO app_runtime
USING (
  (
    tenant_id = public.app_tenant_id()
    AND public.app_has_permission('memberships.manage')
  )
  OR public.app_has_platform_permission('platform.tenants.create')
)
WITH CHECK (
  (
    tenant_id = public.app_tenant_id()
    AND public.app_has_permission('memberships.manage')
  )
  OR public.app_has_platform_permission('platform.tenants.create')
);

-- Terminal invitation states are immutable, and acceptance must match the JWT identity.
CREATE OR REPLACE FUNCTION public.validate_tenant_invitation_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  authenticated_email text;
BEGIN
  IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
    OR OLD.email IS DISTINCT FROM NEW.email
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

CREATE TRIGGER tenant_invitations_validate_update
BEFORE UPDATE ON public.tenant_invitations
FOR EACH ROW EXECUTE FUNCTION public.validate_tenant_invitation_update();

-- Acceptance atomically creates membership, assigns the role, activates a new tenant, and audits the event.
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

  IF NOT EXISTS (
    SELECT 1
    FROM public.roles role
    WHERE role.id = invitation_record.role_id
      AND role.scope = 'tenant'
      AND (role.tenant_id IS NULL OR role.tenant_id = invitation_record.tenant_id)
  ) THEN
    RAISE EXCEPTION 'Invitation role is invalid for this tenant'
      USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.tenant_memberships (
    tenant_id,
    user_id,
    status,
    invited_by
  )
  VALUES (
    invitation_record.tenant_id,
    authenticated_user_id,
    'active',
    invitation_record.invited_by
  )
  ON CONFLICT (tenant_id, user_id) DO UPDATE
  SET status = 'active',
      updated_at = now()
  RETURNING id INTO accepted_membership_id;

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
      'roleId', invitation_record.role_id
    )
  );

  RETURN QUERY
  SELECT invitation_record.tenant_id, accepted_membership_id;
END
$$;

REVOKE ALL ON FUNCTION public.app_has_pending_tenant_invitation(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_tenant_invitation_update() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_accept_tenant_invitation(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_has_pending_tenant_invitation(uuid) TO app_runtime;
GRANT EXECUTE ON FUNCTION public.app_accept_tenant_invitation(uuid, text, text, text) TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON public.tenant_invitations TO app_runtime;
REVOKE DELETE, TRUNCATE, TRIGGER, REFERENCES ON public.tenant_invitations FROM app_runtime;

-- Authorized inviters can determine whether password setup is needed without reading user profiles.
CREATE OR REPLACE FUNCTION public.app_user_profile_exists_by_email(
  target_email text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT (
    public.app_has_platform_permission('platform.users.manage')
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

REVOKE ALL ON FUNCTION public.app_user_profile_exists_by_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_user_profile_exists_by_email(text) TO app_runtime;
