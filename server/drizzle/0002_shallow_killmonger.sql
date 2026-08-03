CREATE TYPE "public"."document_status" AS ENUM('requested', 'uploading', 'uploaded', 'verified', 'rejected', 'deleted');
CREATE TYPE "public"."kyc_session_status" AS ENUM('not_started', 'in_progress', 'in_review', 'approved', 'declined', 'abandoned', 'expired', 'failed');
CREATE TYPE "public"."managed_device_status" AS ENUM('pending_enrollment', 'active', 'restricted', 'released', 'wiped', 'error');
CREATE TYPE "public"."mdm_command_kind" AS ENUM('lock', 'restrict', 'release', 'sync', 'wipe');
CREATE TYPE "public"."mdm_command_status" AS ENUM('queued', 'sent', 'acknowledged', 'failed');
CREATE TYPE "public"."provider_event_status" AS ENUM('received', 'processed', 'ignored', 'failed');
CREATE TYPE "public"."reconciliation_item_status" AS ENUM('matched', 'missing_internal', 'missing_provider', 'amount_mismatch', 'status_mismatch');
CREATE TYPE "public"."reconciliation_run_status" AS ENUM('pending', 'processing', 'completed', 'failed');
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid,
	"application_id" uuid,
	"category" text NOT NULL,
	"original_file_name" text NOT NULL,
	"object_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	"status" "document_status" DEFAULT 'requested' NOT NULL,
	"uploaded_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_reference_present" CHECK ("documents"."customer_id" is not null or "documents"."application_id" is not null),
	CONSTRAINT "documents_metadata_valid" CHECK ("documents"."size_bytes" > 0 and "documents"."size_bytes" <= 20971520 and "documents"."sha256" ~ '^[a-f0-9]{64}$')
);

CREATE TABLE "kyc_verification_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"customer_id" uuid,
	"provider" text NOT NULL,
	"provider_session_id" text NOT NULL,
	"status" "kyc_session_status" DEFAULT 'not_started' NOT NULL,
	"decision" jsonb,
	"risk_score" integer,
	"completed_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kyc_sessions_risk_score_valid" CHECK ("kyc_verification_sessions"."risk_score" is null or ("kyc_verification_sessions"."risk_score" >= 0 and "kyc_verification_sessions"."risk_score" <= 100))
);

CREATE TABLE "managed_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_device_id" text NOT NULL,
	"imei" text NOT NULL,
	"status" "managed_device_status" DEFAULT 'pending_enrollment' NOT NULL,
	"last_seen_at" timestamp with time zone,
	"enrolled_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"provider_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "managed_devices_imei_valid" CHECK ("managed_devices"."imei" ~ '^[0-9]{15}$')
);

CREATE TABLE "mdm_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"managed_device_id" uuid NOT NULL,
	"kind" "mdm_command_kind" NOT NULL,
	"status" "mdm_command_status" DEFAULT 'queued' NOT NULL,
	"idempotency_key" text NOT NULL,
	"provider_command_id" text,
	"reason" text NOT NULL,
	"requested_by" uuid NOT NULL,
	"sent_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "payment_provider_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"payment_id" uuid,
	"provider" text NOT NULL,
	"external_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload_hash" text NOT NULL,
	"payload" jsonb NOT NULL,
	"signature_valid" boolean NOT NULL,
	"status" "provider_event_status" DEFAULT 'received' NOT NULL,
	"processing_attempts" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "payment_provider_events_attempts_nonnegative" CHECK ("payment_provider_events"."processing_attempts" >= 0)
);

CREATE TABLE "reconciliation_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"payment_id" uuid,
	"external_reference" text NOT NULL,
	"internal_amount" bigint,
	"provider_amount" bigint,
	"internal_status" text,
	"provider_status" text NOT NULL,
	"status" "reconciliation_item_status" NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reconciliation_items_amounts_nonnegative" CHECK (("reconciliation_items"."internal_amount" is null or "reconciliation_items"."internal_amount" >= 0)
          and ("reconciliation_items"."provider_amount" is null or "reconciliation_items"."provider_amount" >= 0))
);

CREATE TABLE "reconciliation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"source_sha256" text NOT NULL,
	"status" "reconciliation_run_status" DEFAULT 'pending' NOT NULL,
	"total_items" integer DEFAULT 0 NOT NULL,
	"matched_items" integer DEFAULT 0 NOT NULL,
	"exception_items" integer DEFAULT 0 NOT NULL,
	"started_by" uuid NOT NULL,
	"failure_reason" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reconciliation_runs_period_valid" CHECK ("reconciliation_runs"."period_end" > "reconciliation_runs"."period_start"),
	CONSTRAINT "reconciliation_runs_counts_nonnegative" CHECK ("reconciliation_runs"."total_items" >= 0 and "reconciliation_runs"."matched_items" >= 0 and "reconciliation_runs"."exception_items" >= 0)
);

ALTER TABLE "audit_events" ADD COLUMN "previous_hash" text;
ALTER TABLE "audit_events" ADD COLUMN "event_hash" text DEFAULT '' NOT NULL;
CREATE UNIQUE INDEX "documents_tenant_id_unique" ON "documents" USING btree ("tenant_id","id");
CREATE UNIQUE INDEX "documents_object_key_unique" ON "documents" USING btree ("object_key");
CREATE INDEX "documents_tenant_application_idx" ON "documents" USING btree ("tenant_id","application_id");
CREATE UNIQUE INDEX "kyc_sessions_tenant_id_unique" ON "kyc_verification_sessions" USING btree ("tenant_id","id");
CREATE UNIQUE INDEX "kyc_sessions_provider_session_unique" ON "kyc_verification_sessions" USING btree ("provider","provider_session_id");
CREATE INDEX "kyc_sessions_tenant_application_idx" ON "kyc_verification_sessions" USING btree ("tenant_id","application_id");
CREATE UNIQUE INDEX "managed_devices_tenant_id_unique" ON "managed_devices" USING btree ("tenant_id","id");
CREATE UNIQUE INDEX "managed_devices_contract_unique" ON "managed_devices" USING btree ("tenant_id","contract_id");
CREATE UNIQUE INDEX "managed_devices_provider_device_unique" ON "managed_devices" USING btree ("provider","provider_device_id");
CREATE UNIQUE INDEX "managed_devices_tenant_imei_unique" ON "managed_devices" USING btree ("tenant_id","imei");
CREATE INDEX "managed_devices_tenant_status_idx" ON "managed_devices" USING btree ("tenant_id","status");
CREATE UNIQUE INDEX "mdm_commands_tenant_id_unique" ON "mdm_commands" USING btree ("tenant_id","id");
CREATE UNIQUE INDEX "mdm_commands_tenant_idempotency_unique" ON "mdm_commands" USING btree ("tenant_id","idempotency_key");
CREATE UNIQUE INDEX "mdm_commands_provider_command_unique" ON "mdm_commands" USING btree ("provider_command_id") WHERE "mdm_commands"."provider_command_id" is not null;
CREATE INDEX "mdm_commands_device_created_idx" ON "mdm_commands" USING btree ("managed_device_id","created_at");
CREATE UNIQUE INDEX "payment_provider_events_external_unique" ON "payment_provider_events" USING btree ("provider","external_event_id");
CREATE UNIQUE INDEX "payment_provider_events_tenant_id_unique" ON "payment_provider_events" USING btree ("tenant_id","id");
CREATE INDEX "payment_provider_events_tenant_status_idx" ON "payment_provider_events" USING btree ("tenant_id","status");
CREATE UNIQUE INDEX "reconciliation_items_tenant_id_unique" ON "reconciliation_items" USING btree ("tenant_id","id");
CREATE UNIQUE INDEX "reconciliation_items_run_reference_unique" ON "reconciliation_items" USING btree ("tenant_id","run_id","external_reference");
CREATE INDEX "reconciliation_items_run_status_idx" ON "reconciliation_items" USING btree ("run_id","status");
CREATE UNIQUE INDEX "reconciliation_runs_tenant_id_unique" ON "reconciliation_runs" USING btree ("tenant_id","id");
CREATE UNIQUE INDEX "reconciliation_runs_source_unique" ON "reconciliation_runs" USING btree ("tenant_id","provider","source_sha256");
CREATE INDEX "reconciliation_runs_tenant_created_idx" ON "reconciliation_runs" USING btree ("tenant_id","created_at");
CREATE UNIQUE INDEX "payments_provider_reference_unique" ON "payments" USING btree ("provider","external_reference") WHERE "payments"."provider" is not null and "payments"."external_reference" is not null;
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_user_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "documents" ADD CONSTRAINT "documents_customer_fk" FOREIGN KEY ("tenant_id","customer_id") REFERENCES "public"."customers"("tenant_id","id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "documents" ADD CONSTRAINT "documents_application_fk" FOREIGN KEY ("tenant_id","application_id") REFERENCES "public"."financing_applications"("tenant_id","id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "kyc_verification_sessions" ADD CONSTRAINT "kyc_verification_sessions_created_by_user_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "kyc_verification_sessions" ADD CONSTRAINT "kyc_sessions_application_fk" FOREIGN KEY ("tenant_id","application_id") REFERENCES "public"."financing_applications"("tenant_id","id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "kyc_verification_sessions" ADD CONSTRAINT "kyc_sessions_customer_fk" FOREIGN KEY ("tenant_id","customer_id") REFERENCES "public"."customers"("tenant_id","id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "managed_devices" ADD CONSTRAINT "managed_devices_contract_fk" FOREIGN KEY ("tenant_id","contract_id") REFERENCES "public"."financing_contracts"("tenant_id","id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "mdm_commands" ADD CONSTRAINT "mdm_commands_requested_by_user_profiles_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "mdm_commands" ADD CONSTRAINT "mdm_commands_device_fk" FOREIGN KEY ("tenant_id","managed_device_id") REFERENCES "public"."managed_devices"("tenant_id","id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "payment_provider_events" ADD CONSTRAINT "payment_provider_events_payment_fk" FOREIGN KEY ("tenant_id","payment_id") REFERENCES "public"."payments"("tenant_id","id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "reconciliation_items" ADD CONSTRAINT "reconciliation_items_run_fk" FOREIGN KEY ("tenant_id","run_id") REFERENCES "public"."reconciliation_runs"("tenant_id","id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "reconciliation_items" ADD CONSTRAINT "reconciliation_items_payment_fk" FOREIGN KEY ("tenant_id","payment_id") REFERENCES "public"."payments"("tenant_id","id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "reconciliation_runs" ADD CONSTRAINT "reconciliation_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "reconciliation_runs" ADD CONSTRAINT "reconciliation_runs_started_by_user_profiles_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;
