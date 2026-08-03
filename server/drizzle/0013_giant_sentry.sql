CREATE TYPE "public"."notification_email_status" AS ENUM('pending', 'sent', 'failed', 'skipped');
CREATE TYPE "public"."notification_severity" AS ENUM('info', 'success', 'warning', 'critical');
CREATE TABLE "notification_email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notification_id" uuid NOT NULL,
	"recipient_email" text NOT NULL,
	"status" "notification_email_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_email_outbox_attempts_valid" CHECK ("notification_email_outbox"."attempts" >= 0)
);

CREATE TABLE "notification_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"sound_enabled" boolean DEFAULT false NOT NULL,
	"sound_minimum_severity" "notification_severity" DEFAULT 'warning' NOT NULL,
	"email_enabled" boolean DEFAULT false NOT NULL,
	"email_minimum_severity" "notification_severity" DEFAULT 'critical' NOT NULL,
	"quiet_hours_start" text,
	"quiet_hours_end" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"branch_id" uuid,
	"user_id" uuid NOT NULL,
	"audit_event_id" uuid NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"severity" "notification_severity" DEFAULT 'info' NOT NULL,
	"resource_type" text,
	"resource_id" text,
	"action_url" text,
	"read_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"sound_played_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "notification_email_outbox" ADD CONSTRAINT "notification_email_outbox_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_user_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_user_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_audit_event_id_audit_events_id_fk" FOREIGN KEY ("audit_event_id") REFERENCES "public"."audit_events"("id") ON DELETE no action ON UPDATE no action;
CREATE UNIQUE INDEX "notification_email_outbox_notification_unique" ON "notification_email_outbox" USING btree ("notification_id");
CREATE INDEX "notification_email_outbox_pending_idx" ON "notification_email_outbox" USING btree ("status","next_attempt_at");
CREATE UNIQUE INDEX "notifications_event_user_unique" ON "notifications" USING btree ("audit_event_id","user_id");
CREATE INDEX "notifications_user_unread_idx" ON "notifications" USING btree ("user_id","read_at","created_at");
CREATE INDEX "notifications_tenant_created_idx" ON "notifications" USING btree ("tenant_id","created_at");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_notification_worker') THEN
    CREATE ROLE app_notification_worker NOLOGIN NOINHERIT;
  END IF;
END
$$;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications FORCE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences FORCE ROW LEVEL SECURITY;
ALTER TABLE public.notification_email_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_email_outbox FORCE ROW LEVEL SECURITY;

CREATE POLICY notifications_select_own ON public.notifications
FOR SELECT TO app_runtime
USING (
  user_id = public.app_user_id()
  AND (
    (tenant_id IS NULL AND public.app_tenant_id() IS NULL)
    OR tenant_id = public.app_tenant_id()
  )
);

CREATE POLICY notifications_update_own ON public.notifications
FOR UPDATE TO app_runtime
USING (
  user_id = public.app_user_id()
  AND (
    (tenant_id IS NULL AND public.app_tenant_id() IS NULL)
    OR tenant_id = public.app_tenant_id()
  )
)
WITH CHECK (
  user_id = public.app_user_id()
  AND (
    (tenant_id IS NULL AND public.app_tenant_id() IS NULL)
    OR tenant_id = public.app_tenant_id()
  )
);

CREATE POLICY notification_preferences_select_own ON public.notification_preferences
FOR SELECT TO app_runtime
USING (user_id = public.app_user_id());

CREATE POLICY notification_preferences_insert_own ON public.notification_preferences
FOR INSERT TO app_runtime
WITH CHECK (user_id = public.app_user_id());

CREATE POLICY notification_preferences_update_own ON public.notification_preferences
FOR UPDATE TO app_runtime
USING (user_id = public.app_user_id())
WITH CHECK (user_id = public.app_user_id());

CREATE POLICY notification_worker_notifications_select ON public.notifications
FOR SELECT TO app_notification_worker
USING (true);

CREATE POLICY notification_worker_outbox_select ON public.notification_email_outbox
FOR SELECT TO app_notification_worker
USING (true);

CREATE POLICY notification_worker_outbox_update ON public.notification_email_outbox
FOR UPDATE TO app_notification_worker
USING (true)
WITH CHECK (true);

GRANT SELECT ON public.notifications TO app_runtime;
GRANT UPDATE (read_at, acknowledged_at, archived_at, sound_played_at)
  ON public.notifications TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON public.notification_preferences TO app_runtime;
REVOKE DELETE, TRUNCATE, TRIGGER, REFERENCES
  ON public.notifications, public.notification_preferences, public.notification_email_outbox
  FROM app_runtime;

GRANT USAGE ON SCHEMA public TO app_notification_worker;
GRANT SELECT ON public.notifications TO app_notification_worker;
GRANT SELECT, UPDATE ON public.notification_email_outbox TO app_notification_worker;

CREATE TRIGGER notification_preferences_set_updated_at
BEFORE UPDATE ON public.notification_preferences
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER notification_email_outbox_set_updated_at
BEFORE UPDATE ON public.notification_email_outbox
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.app_queue_notification_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  preference public.notification_preferences%ROWTYPE;
  recipient text;
  severity_rank integer;
  minimum_rank integer;
BEGIN
  SELECT * INTO preference
  FROM public.notification_preferences
  WHERE user_id = NEW.user_id;

  IF NOT FOUND OR NOT preference.email_enabled THEN
    RETURN NEW;
  END IF;

  severity_rank := CASE NEW.severity
    WHEN 'critical' THEN 4 WHEN 'warning' THEN 3 WHEN 'success' THEN 2 ELSE 1 END;
  minimum_rank := CASE preference.email_minimum_severity
    WHEN 'critical' THEN 4 WHEN 'warning' THEN 3 WHEN 'success' THEN 2 ELSE 1 END;
  IF severity_rank < minimum_rank THEN
    RETURN NEW;
  END IF;

  SELECT email INTO recipient
  FROM public.user_profiles
  WHERE id = NEW.user_id AND NOT disabled;
  IF recipient IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notification_email_outbox (notification_id, recipient_email)
  VALUES (NEW.id, recipient)
  ON CONFLICT (notification_id) DO NOTHING;
  RETURN NEW;
END
$$;

CREATE TRIGGER notifications_queue_email
AFTER INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.app_queue_notification_email();

CREATE OR REPLACE FUNCTION public.app_notify_from_audit_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  notification_title text;
  notification_message text;
  notification_severity public.notification_severity;
  required_permission text;
  required_platform_permission text;
  notification_url text;
  target_branch uuid;
BEGIN
  CASE NEW.action
    WHEN 'application.submitted' THEN
      notification_title := 'Application awaiting review';
      notification_message := 'A financing application was submitted and is ready for underwriting.';
      notification_severity := 'warning';
      required_permission := 'applications.review';
      notification_url := '/applications/' || NEW.resource_id;
    WHEN 'application.approved' THEN
      notification_title := 'Application approved';
      notification_message := 'A financing application was approved and can proceed to contracting.';
      notification_severity := 'success';
      required_permission := 'applications.read';
      notification_url := '/applications/' || NEW.resource_id;
    WHEN 'application.rejected' THEN
      notification_title := 'Application rejected';
      notification_message := 'A financing application was rejected. Review the decision record for details.';
      notification_severity := 'warning';
      required_permission := 'applications.read';
      notification_url := '/applications/' || NEW.resource_id;
    WHEN 'application.correction' THEN
      notification_title := 'Application needs correction';
      notification_message := 'An underwriter requested corrections to a financing application.';
      notification_severity := 'warning';
      required_permission := 'applications.read';
      notification_url := '/applications/' || NEW.resource_id;
    WHEN 'payment.settled' THEN
      notification_title := 'Payment settled';
      notification_message := 'A customer payment was settled and allocated successfully.';
      notification_severity := 'success';
      required_permission := 'payments.read';
      notification_url := '/payments';
    WHEN 'payment.reversed' THEN
      notification_title := 'Payment reversed';
      notification_message := 'A settled payment was reversed. Review the payment and ledger entries.';
      notification_severity := 'critical';
      required_permission := 'payments.read';
      notification_url := '/payments';
    WHEN 'payment.reconciliation_completed' THEN
      notification_title := 'Payment reconciliation completed';
      notification_message := 'A provider reconciliation run completed. Review any unmatched items.';
      notification_severity := 'warning';
      required_permission := 'payments.reconcile';
      notification_url := '/payments';
    WHEN 'contract.activated' THEN
      notification_title := 'Contract activated';
      notification_message := 'A financing contract was activated and its repayment schedule is now effective.';
      notification_severity := 'success';
      required_permission := 'contracts.read';
      notification_url := '/contracts/' || NEW.resource_id;
    WHEN 'contract.status_changed' THEN
      notification_title := 'Contract status changed';
      notification_message := 'A financing contract moved to ' || replace(COALESCE(NEW.details ->> 'to', 'a new status'), '_', ' ') || '.';
      notification_severity := CASE
        WHEN NEW.details ->> 'to' IN ('past_due', 'written_off', 'terminated') THEN 'critical'::public.notification_severity
        ELSE 'warning'::public.notification_severity END;
      required_permission := 'contracts.read';
      notification_url := '/contracts/' || NEW.resource_id;
    WHEN 'device.command_failed' THEN
      notification_title := 'Device command failed';
      notification_message := 'A device management command failed and requires staff attention.';
      notification_severity := 'critical';
      required_permission := 'devices.manage';
      notification_url := '/devices';
    WHEN 'membership.invited' THEN
      notification_title := 'Staff invitation created';
      notification_message := 'A new staff invitation was created for this organization.';
      notification_severity := 'info';
      required_permission := 'memberships.manage';
      notification_url := '/staff';
    WHEN 'membership.invitation.delivery_failed' THEN
      notification_title := 'Staff invitation delivery failed';
      notification_message := 'A staff invitation could not be delivered. Review the address and resend it.';
      notification_severity := 'critical';
      required_permission := 'memberships.manage';
      notification_url := '/staff';
    WHEN 'payment.webhook_failed' THEN
      notification_title := 'Payment webhook failed';
      notification_message := 'A payment-provider update could not be processed and requires reconciliation.';
      notification_severity := 'critical';
      required_permission := 'payments.reconcile';
      notification_url := '/payments';
    WHEN 'kyc.webhook_processed' THEN
      notification_title := 'Customer verification updated';
      notification_message := 'A customer identity-verification result was received and may require review.';
      notification_severity := CASE
        WHEN NEW.details ->> 'status' IN ('declined', 'failed') THEN 'critical'::public.notification_severity
        ELSE 'warning'::public.notification_severity END;
      required_permission := 'applications.review';
      notification_url := '/applications';
    WHEN 'tenant.kyb.polling_fallback_synced' THEN
      notification_title := 'Retailer KYB result updated';
      notification_message := 'A retailer business-verification result is ready for compliance review.';
      notification_severity := CASE
        WHEN NEW.details ->> 'status' = 'provider_declined' THEN 'critical'::public.notification_severity
        ELSE 'warning'::public.notification_severity END;
      required_permission := 'tenant.manage';
      required_platform_permission := 'platform.kyb.read';
      notification_url := '/business-profile';
    WHEN 'tenant.kyb.webhook_processed' THEN
      notification_title := 'Retailer KYB result updated';
      notification_message := 'A retailer business-verification result is ready for compliance review.';
      notification_severity := CASE
        WHEN NEW.details ->> 'status' = 'provider_declined' THEN 'critical'::public.notification_severity
        ELSE 'warning'::public.notification_severity END;
      required_permission := 'tenant.manage';
      required_platform_permission := 'platform.kyb.read';
      notification_url := '/business-profile';
    WHEN 'platform.tenant.created' THEN
      notification_title := 'Retailer created';
      notification_message := 'A retailer organization was created and owner onboarding has started.';
      notification_severity := 'success';
      required_platform_permission := 'platform.tenants.read';
      notification_url := '/admin/tenants/' || NEW.resource_id;
    WHEN 'platform.tenant.archived' THEN
      notification_title := 'Retailer archived';
      notification_message := 'A retailer organization was archived. Historical financial records remain preserved.';
      notification_severity := 'critical';
      required_platform_permission := 'platform.tenants.read';
      notification_url := '/admin/tenants/' || NEW.resource_id;
    WHEN 'platform.invitation.created' THEN
      notification_title := 'Platform invitation created';
      notification_message := 'A platform staff invitation was created.';
      notification_severity := 'info';
      required_platform_permission := 'platform.users.invite';
      notification_url := '/admin/users';
    WHEN 'platform.invitation.delivery_failed' THEN
      notification_title := 'Platform invitation delivery failed';
      notification_message := 'A platform staff invitation could not be delivered. Review the address and resend it.';
      notification_severity := 'critical';
      required_platform_permission := 'platform.users.invite';
      notification_url := '/admin/users';
    WHEN 'platform.tenant.owner_invitation.delivery_failed' THEN
      notification_title := 'Retailer owner invitation failed';
      notification_message := 'A retailer owner invitation could not be delivered. Retailer onboarding is blocked.';
      notification_severity := 'critical';
      required_platform_permission := 'platform.tenants.read';
      notification_url := '/admin/tenants';
    WHEN 'platform.kyb.approve' THEN
      notification_title := 'Retailer KYB approved';
      notification_message := 'Platform compliance approved a retailer business verification.';
      notification_severity := 'success';
      required_platform_permission := 'platform.kyb.read';
      notification_url := '/admin/kyb/' || NEW.resource_id;
    WHEN 'platform.kyb.reject' THEN
      notification_title := 'Retailer KYB rejected';
      notification_message := 'Platform compliance rejected a retailer business verification.';
      notification_severity := 'critical';
      required_platform_permission := 'platform.kyb.read';
      notification_url := '/admin/kyb/' || NEW.resource_id;
    ELSE
      RETURN NEW;
  END CASE;

  IF NEW.resource_id ~* '^[0-9a-f-]{36}$' THEN
    IF NEW.resource_type = 'application' THEN
      SELECT branch_id INTO target_branch FROM public.financing_applications
      WHERE id = NEW.resource_id::uuid;
    ELSIF NEW.resource_type = 'contract' THEN
      SELECT branch_id INTO target_branch FROM public.financing_contracts
      WHERE id = NEW.resource_id::uuid;
    ELSIF NEW.resource_type = 'customer' THEN
      SELECT branch_id INTO target_branch FROM public.customers
      WHERE id = NEW.resource_id::uuid;
    END IF;
  END IF;

  IF NEW.tenant_id IS NOT NULL AND required_permission IS NOT NULL THEN
    INSERT INTO public.notifications (
      tenant_id, branch_id, user_id, audit_event_id, code, title, message,
      severity, resource_type, resource_id, action_url
    )
    SELECT DISTINCT
      NEW.tenant_id, target_branch, membership.user_id, NEW.id, NEW.action,
      notification_title, notification_message, notification_severity,
      NEW.resource_type, NEW.resource_id, notification_url
    FROM public.tenant_memberships membership
    JOIN public.user_profiles profile ON profile.id = membership.user_id
    JOIN public.tenant_member_roles assignment
      ON assignment.tenant_id = membership.tenant_id
     AND assignment.membership_id = membership.id
    JOIN public.role_permissions role_permission
      ON role_permission.role_id = assignment.role_id
     AND role_permission.permission_code = required_permission
    WHERE membership.tenant_id = NEW.tenant_id
      AND membership.status = 'active'
      AND NOT profile.disabled
      AND (NEW.actor_user_id IS NULL OR membership.user_id <> NEW.actor_user_id)
      AND (
        target_branch IS NULL OR membership.all_branches OR EXISTS (
          SELECT 1 FROM public.tenant_membership_branches branch_access
          WHERE branch_access.tenant_id = membership.tenant_id
            AND branch_access.membership_id = membership.id
            AND branch_access.branch_id = target_branch
        )
      )
    ON CONFLICT (audit_event_id, user_id) DO NOTHING;
  END IF;

  IF required_platform_permission IS NOT NULL THEN
    INSERT INTO public.notifications (
      tenant_id, user_id, audit_event_id, code, title, message,
      severity, resource_type, resource_id, action_url
    )
    SELECT DISTINCT
      NULL, assignment.user_id, NEW.id, NEW.action, notification_title,
      notification_message, notification_severity, NEW.resource_type,
      NEW.resource_id,
      CASE WHEN notification_url LIKE '/admin/%' THEN notification_url
           ELSE '/admin/kyb' END
    FROM public.platform_role_assignments assignment
    JOIN public.user_profiles profile ON profile.id = assignment.user_id
    JOIN public.role_permissions role_permission
      ON role_permission.role_id = assignment.role_id
     AND role_permission.permission_code = required_platform_permission
    WHERE NOT profile.disabled
      AND (NEW.actor_user_id IS NULL OR assignment.user_id <> NEW.actor_user_id)
    ON CONFLICT (audit_event_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER audit_events_create_notifications
AFTER INSERT ON public.audit_events
FOR EACH ROW EXECUTE FUNCTION public.app_notify_from_audit_event();

REVOKE ALL ON FUNCTION public.app_queue_notification_email() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_notify_from_audit_event() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1
       FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'notifications'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END
$$;
