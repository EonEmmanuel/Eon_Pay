-- Resolve the output-variable and unique-index column naming collision during tenant invitation acceptance.
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
#variable_conflict use_column
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

REVOKE ALL ON FUNCTION public.app_accept_tenant_invitation(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_accept_tenant_invitation(uuid, text, text, text) TO app_runtime;
