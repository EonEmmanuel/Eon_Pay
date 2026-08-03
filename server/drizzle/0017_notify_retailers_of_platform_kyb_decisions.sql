-- Deliver final platform KYB decisions into the affected retailer's notification scope.
CREATE OR REPLACE FUNCTION public.app_notify_retailer_from_platform_kyb()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_tenant uuid;
  notification_title text;
  notification_message text;
  notification_severity public.notification_severity;
BEGIN
  IF COALESCE(NEW.details ->> 'tenantId', '') !~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  THEN
    RETURN NEW;
  END IF;

  target_tenant := (NEW.details ->> 'tenantId')::uuid;

  CASE NEW.action
    WHEN 'platform.kyb.approve' THEN
      notification_title := 'Business verification approved';
      notification_message := 'Your retailer business verification was approved. Operational access is now active.';
      notification_severity := 'success';
    WHEN 'platform.kyb.reject' THEN
      notification_title := 'Business verification rejected';
      notification_message := 'Your retailer business verification was rejected. Review the decision and contact compliance if clarification is required.';
      notification_severity := 'critical';
    WHEN 'platform.kyb.request_resubmission' THEN
      notification_title := 'Business verification needs resubmission';
      notification_message := 'Compliance requested updated business-verification information. Open the business profile to continue.';
      notification_severity := 'warning';
    ELSE
      RETURN NEW;
  END CASE;

  INSERT INTO public.notifications (
    tenant_id, user_id, audit_event_id, code, title, message,
    severity, resource_type, resource_id, action_url
  )
  SELECT DISTINCT
    target_tenant, membership.user_id, NEW.id, NEW.action,
    notification_title, notification_message, notification_severity,
    NEW.resource_type, NEW.resource_id, '/business-profile'
  FROM public.tenant_memberships membership
  JOIN public.user_profiles profile ON profile.id = membership.user_id
  JOIN public.tenant_member_roles assignment
    ON assignment.tenant_id = membership.tenant_id
   AND assignment.membership_id = membership.id
  JOIN public.role_permissions role_permission
    ON role_permission.role_id = assignment.role_id
   AND role_permission.permission_code = 'tenant.manage'
  WHERE membership.tenant_id = target_tenant
    AND membership.status = 'active'
    AND NOT profile.disabled
  ON CONFLICT (audit_event_id, user_id) DO NOTHING;

  -- Resubmission was not handled by the original platform notification mapping.
  IF NEW.action = 'platform.kyb.request_resubmission' THEN
    INSERT INTO public.notifications (
      tenant_id, user_id, audit_event_id, code, title, message,
      severity, resource_type, resource_id, action_url
    )
    SELECT DISTINCT
      NULL::uuid, assignment.user_id, NEW.id, NEW.action,
      'Retailer KYB resubmission requested',
      'Platform compliance requested updated business-verification information from a retailer.',
      'warning'::public.notification_severity,
      NEW.resource_type, NEW.resource_id, '/admin/kyb/' || NEW.resource_id
    FROM public.platform_role_assignments assignment
    JOIN public.user_profiles profile ON profile.id = assignment.user_id
    JOIN public.role_permissions role_permission
      ON role_permission.role_id = assignment.role_id
     AND role_permission.permission_code = 'platform.kyb.read'
    WHERE NOT profile.disabled
      AND (NEW.actor_user_id IS NULL OR assignment.user_id <> NEW.actor_user_id)
    ON CONFLICT (audit_event_id, user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS audit_events_notify_retailer_kyb_decision
  ON public.audit_events;
CREATE TRIGGER audit_events_notify_retailer_kyb_decision
AFTER INSERT ON public.audit_events
FOR EACH ROW
WHEN (NEW.action IN (
  'platform.kyb.approve',
  'platform.kyb.reject',
  'platform.kyb.request_resubmission'
))
EXECUTE FUNCTION public.app_notify_retailer_from_platform_kyb();

REVOKE ALL ON FUNCTION public.app_notify_retailer_from_platform_kyb() FROM PUBLIC;

-- Backfill decisions recorded before this trigger existed without duplicating recipients.
INSERT INTO public.notifications (
  tenant_id, user_id, audit_event_id, code, title, message,
  severity, resource_type, resource_id, action_url
)
SELECT DISTINCT
  CASE
    WHEN COALESCE(event.details ->> 'tenantId', '') ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN (event.details ->> 'tenantId')::uuid
  END,
  membership.user_id,
  event.id,
  event.action,
  CASE event.action
    WHEN 'platform.kyb.approve' THEN 'Business verification approved'
    WHEN 'platform.kyb.reject' THEN 'Business verification rejected'
    ELSE 'Business verification needs resubmission'
  END,
  CASE event.action
    WHEN 'platform.kyb.approve' THEN 'Your retailer business verification was approved. Operational access is now active.'
    WHEN 'platform.kyb.reject' THEN 'Your retailer business verification was rejected. Review the decision and contact compliance if clarification is required.'
    ELSE 'Compliance requested updated business-verification information. Open the business profile to continue.'
  END,
  CASE event.action
    WHEN 'platform.kyb.approve' THEN 'success'::public.notification_severity
    WHEN 'platform.kyb.reject' THEN 'critical'::public.notification_severity
    ELSE 'warning'::public.notification_severity
  END,
  event.resource_type,
  event.resource_id,
  '/business-profile'
FROM public.audit_events event
JOIN public.tenant_memberships membership
  ON membership.tenant_id = CASE
    WHEN COALESCE(event.details ->> 'tenantId', '') ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN (event.details ->> 'tenantId')::uuid
    END
 AND membership.status = 'active'
JOIN public.user_profiles profile
  ON profile.id = membership.user_id
 AND NOT profile.disabled
JOIN public.tenant_member_roles assignment
  ON assignment.tenant_id = membership.tenant_id
 AND assignment.membership_id = membership.id
JOIN public.role_permissions role_permission
  ON role_permission.role_id = assignment.role_id
 AND role_permission.permission_code = 'tenant.manage'
WHERE event.action IN (
    'platform.kyb.approve',
    'platform.kyb.reject',
    'platform.kyb.request_resubmission'
  )
  AND COALESCE(event.details ->> 'tenantId', '') ~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
ON CONFLICT (audit_event_id, user_id) DO NOTHING;
