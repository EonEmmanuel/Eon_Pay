CREATE OR REPLACE FUNCTION public.app_notify_invitation_acceptance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_user uuid;
  target_tenant uuid;
  target_name text;
  target_role uuid;
  tenant_owner_role constant uuid := '00000000-0000-4000-8000-000000000101'::uuid;
BEGIN
  IF NEW.resource_id !~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  THEN
    RETURN NEW;
  END IF;

  IF NEW.action = 'membership.invitation_accepted' THEN
    SELECT invitation.invited_by, invitation.tenant_id,
           invitation.full_name, invitation.role_id
    INTO target_user, target_tenant, target_name, target_role
    FROM public.tenant_invitations invitation
    JOIN public.user_profiles inviter
      ON inviter.id = invitation.invited_by
     AND NOT inviter.disabled
    WHERE invitation.id = NEW.resource_id::uuid;

    IF target_user IS NOT NULL
       AND (NEW.actor_user_id IS NULL OR target_user <> NEW.actor_user_id)
    THEN
      INSERT INTO public.notifications (
        tenant_id, user_id, audit_event_id, code, title, message,
        severity, resource_type, resource_id, action_url
      )
      VALUES (
        CASE WHEN target_role = tenant_owner_role THEN NULL ELSE target_tenant END,
        target_user,
        NEW.id,
        NEW.action,
        CASE WHEN target_role = tenant_owner_role
          THEN 'Retailer owner invitation accepted'
          ELSE 'Staff invitation accepted'
        END,
        COALESCE(target_name, 'The invited user') ||
          CASE WHEN target_role = tenant_owner_role
            THEN ' accepted the retailer owner invitation. Retailer onboarding can continue.'
            ELSE ' accepted the staff invitation and now has the assigned access.'
          END,
        'success'::public.notification_severity,
        NEW.resource_type,
        NEW.resource_id,
        CASE WHEN target_role = tenant_owner_role
          THEN '/admin/tenants/' || target_tenant::text
          ELSE '/staff'
        END
      )
      ON CONFLICT (audit_event_id, user_id) DO NOTHING;
    END IF;
  ELSIF NEW.action = 'platform.invitation.accepted' THEN
    SELECT invitation.invited_by, invitation.full_name
    INTO target_user, target_name
    FROM public.platform_invitations invitation
    JOIN public.user_profiles inviter
      ON inviter.id = invitation.invited_by
     AND NOT inviter.disabled
    WHERE invitation.id = NEW.resource_id::uuid;

    IF target_user IS NOT NULL
       AND (NEW.actor_user_id IS NULL OR target_user <> NEW.actor_user_id)
    THEN
      INSERT INTO public.notifications (
        tenant_id, user_id, audit_event_id, code, title, message,
        severity, resource_type, resource_id, action_url
      )
      VALUES (
        NULL,
        target_user,
        NEW.id,
        NEW.action,
        'Platform invitation accepted',
        COALESCE(target_name, 'The invited user') ||
          ' accepted the platform invitation and now has the assigned role.',
        'success'::public.notification_severity,
        NEW.resource_type,
        NEW.resource_id,
        '/admin/users'
      )
      ON CONFLICT (audit_event_id, user_id) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS audit_events_notify_invitation_acceptance
  ON public.audit_events;
CREATE TRIGGER audit_events_notify_invitation_acceptance
AFTER INSERT ON public.audit_events
FOR EACH ROW
WHEN (NEW.action IN (
  'membership.invitation_accepted',
  'platform.invitation.accepted'
))
EXECUTE FUNCTION public.app_notify_invitation_acceptance();

REVOKE ALL ON FUNCTION public.app_notify_invitation_acceptance() FROM PUBLIC;

INSERT INTO public.notifications (
  tenant_id, user_id, audit_event_id, code, title, message,
  severity, resource_type, resource_id, action_url
)
SELECT
  CASE WHEN invitation.role_id =
    '00000000-0000-4000-8000-000000000101'::uuid
    THEN NULL ELSE invitation.tenant_id END,
  invitation.invited_by,
  event.id,
  event.action,
  CASE WHEN invitation.role_id =
    '00000000-0000-4000-8000-000000000101'::uuid
    THEN 'Retailer owner invitation accepted'
    ELSE 'Staff invitation accepted' END,
  invitation.full_name || CASE WHEN invitation.role_id =
    '00000000-0000-4000-8000-000000000101'::uuid
    THEN ' accepted the retailer owner invitation. Retailer onboarding can continue.'
    ELSE ' accepted the staff invitation and now has the assigned access.' END,
  'success'::public.notification_severity,
  event.resource_type,
  event.resource_id,
  CASE WHEN invitation.role_id =
    '00000000-0000-4000-8000-000000000101'::uuid
    THEN '/admin/tenants/' || invitation.tenant_id::text
    ELSE '/staff' END
FROM public.audit_events event
JOIN public.tenant_invitations invitation
  ON invitation.id = CASE
    WHEN event.resource_id ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN event.resource_id::uuid
    END
JOIN public.user_profiles inviter
  ON inviter.id = invitation.invited_by
 AND NOT inviter.disabled
WHERE event.action = 'membership.invitation_accepted'
  AND (event.actor_user_id IS NULL OR invitation.invited_by <> event.actor_user_id)
ON CONFLICT (audit_event_id, user_id) DO NOTHING;

INSERT INTO public.notifications (
  tenant_id, user_id, audit_event_id, code, title, message,
  severity, resource_type, resource_id, action_url
)
SELECT
  NULL,
  invitation.invited_by,
  event.id,
  event.action,
  'Platform invitation accepted',
  invitation.full_name ||
    ' accepted the platform invitation and now has the assigned role.',
  'success'::public.notification_severity,
  event.resource_type,
  event.resource_id,
  '/admin/users'
FROM public.audit_events event
JOIN public.platform_invitations invitation
  ON invitation.id = CASE
    WHEN event.resource_id ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN event.resource_id::uuid
    END
JOIN public.user_profiles inviter
  ON inviter.id = invitation.invited_by
 AND NOT inviter.disabled
WHERE event.action = 'platform.invitation.accepted'
  AND (event.actor_user_id IS NULL OR invitation.invited_by <> event.actor_user_id)
ON CONFLICT (audit_event_id, user_id) DO NOTHING;
