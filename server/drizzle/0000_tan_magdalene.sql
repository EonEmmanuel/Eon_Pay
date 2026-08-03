CREATE TYPE "public"."allocation_target" AS ENUM('down_payment', 'installment_principal', 'installment_finance_charge', 'fee', 'unapplied_credit');-- End of the preceding independently reviewable database operation.
CREATE TYPE "public"."application_status" AS ENUM('draft', 'submitted', 'kyc_review', 'credit_review', 'approved', 'rejected', 'cancelled', 'expired');-- End of the preceding independently reviewable database operation.
CREATE TYPE "public"."contract_status" AS ENUM('draft', 'pending_signature', 'cancelled', 'active', 'past_due', 'suspended', 'completed', 'terminated', 'written_off');-- End of the preceding independently reviewable database operation.
CREATE TYPE "public"."fee_kind" AS ENUM('origination', 'late_payment', 'collection', 'device_restriction', 'restructuring', 'other');-- End of the preceding independently reviewable database operation.
CREATE TYPE "public"."fee_status" AS ENUM('assessed', 'waived', 'reversed');-- End of the preceding independently reviewable database operation.
CREATE TYPE "public"."fee_subject" AS ENUM('application', 'contract', 'installment', 'payment');-- End of the preceding independently reviewable database operation.
CREATE TYPE "public"."journal_kind" AS ENUM('standard', 'reversal');-- End of the preceding independently reviewable database operation.
CREATE TYPE "public"."journal_side" AS ENUM('debit', 'credit');-- End of the preceding independently reviewable database operation.
CREATE TYPE "public"."journal_source" AS ENUM('application', 'contract', 'installment', 'payment', 'fee', 'manual');-- End of the preceding independently reviewable database operation.
CREATE TYPE "public"."kyc_status" AS ENUM('not_started', 'pending', 'verified', 'needs_correction', 'failed');-- End of the preceding independently reviewable database operation.
CREATE TYPE "public"."ledger_account_type" AS ENUM('asset', 'liability', 'equity', 'income', 'expense', 'contra_asset');-- End of the preceding independently reviewable database operation.
CREATE TYPE "public"."membership_status" AS ENUM('invited', 'active', 'suspended', 'revoked');-- End of the preceding independently reviewable database operation.
CREATE TYPE "public"."payment_channel" AS ENUM('cash', 'mtn_momo', 'orange_money', 'bank_transfer', 'card', 'ussd');-- End of the preceding independently reviewable database operation.
CREATE TYPE "public"."payment_status" AS ENUM('initiated', 'pending', 'settled', 'failed', 'cancelled', 'reversed');-- End of the preceding independently reviewable database operation.
CREATE TYPE "public"."repayment_frequency" AS ENUM('weekly', 'biweekly', 'monthly');-- End of the preceding independently reviewable database operation.
CREATE TYPE "public"."role_scope" AS ENUM('platform', 'tenant');-- End of the preceding independently reviewable database operation.
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"request_id" text,
	"ip_address" text,
	"user_agent" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
-- End of the preceding independently reviewable database operation.
CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
-- End of the preceding independently reviewable database operation.
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid,
	"full_name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"national_id_reference" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_version_positive" CHECK ("customers"."version" > 0)
);
-- End of the preceding independently reviewable database operation.
CREATE TABLE "fee_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"subject_type" "fee_subject" NOT NULL,
	"application_id" uuid,
	"contract_id" uuid,
	"installment_id" uuid,
	"payment_id" uuid,
	"kind" "fee_kind" NOT NULL,
	"currency" text DEFAULT 'XAF' NOT NULL,
	"amount" bigint NOT NULL,
	"calculation" jsonb NOT NULL,
	"status" "fee_status" DEFAULT 'assessed' NOT NULL,
	"assessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_date" date,
	"ledger_entry_id" uuid NOT NULL,
	"waived_at" timestamp with time zone,
	"waived_by" uuid,
	"waiver_reason" text,
	"waiver_entry_id" uuid,
	"reversed_at" timestamp with time zone,
	"reversal_entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fees_values_valid" CHECK ("fee_assessments"."currency" = 'XAF' and "fee_assessments"."amount" > 0)
);
-- End of the preceding independently reviewable database operation.
CREATE TABLE "financing_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"customer_id" uuid,
	"applicant" jsonb NOT NULL,
	"device" jsonb NOT NULL,
	"requested_terms" jsonb NOT NULL,
	"approved_terms" jsonb,
	"kyc_status" "kyc_status" DEFAULT 'not_started' NOT NULL,
	"status" "application_status" DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp with time zone,
	"decision_outcome" text,
	"decision_reason_code" text,
	"decision_notes" text,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"converted_contract_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applications_version_positive" CHECK ("financing_applications"."version" > 0),
	CONSTRAINT "applications_decision_outcome_valid" CHECK ("financing_applications"."decision_outcome" is null or "financing_applications"."decision_outcome" in ('approved', 'rejected'))
);
-- End of the preceding independently reviewable database operation.
CREATE TABLE "financing_contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"source_application_id" uuid NOT NULL,
	"device" jsonb NOT NULL,
	"currency" text DEFAULT 'XAF' NOT NULL,
	"device_cash_price" bigint NOT NULL,
	"down_payment" bigint NOT NULL,
	"financed_principal" bigint NOT NULL,
	"finance_charge" bigint NOT NULL,
	"installment_count" integer NOT NULL,
	"repayment_frequency" "repayment_frequency" NOT NULL,
	"first_due_date" date NOT NULL,
	"grace_period_days" integer NOT NULL,
	"status" "contract_status" DEFAULT 'pending_signature' NOT NULL,
	"signed_at" timestamp with time zone,
	"activated_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"terminated_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contracts_currency_xaf" CHECK ("financing_contracts"."currency" = 'XAF'),
	CONSTRAINT "contracts_amounts_valid" CHECK ("financing_contracts"."device_cash_price" >= 0
          and "financing_contracts"."down_payment" >= 0
          and "financing_contracts"."financed_principal" >= 0
          and "financing_contracts"."finance_charge" >= 0
          and "financing_contracts"."device_cash_price" = "financing_contracts"."down_payment" + "financing_contracts"."financed_principal"),
	CONSTRAINT "contracts_schedule_valid" CHECK ("financing_contracts"."installment_count" > 0 and "financing_contracts"."grace_period_days" >= 0),
	CONSTRAINT "contracts_version_positive" CHECK ("financing_contracts"."version" > 0)
);
-- End of the preceding independently reviewable database operation.
CREATE TABLE "idempotency_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"key" text NOT NULL,
	"request_hash" text NOT NULL,
	"resource_type" text,
	"resource_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
-- End of the preceding independently reviewable database operation.
CREATE TABLE "installments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"due_date" date NOT NULL,
	"currency" text DEFAULT 'XAF' NOT NULL,
	"principal_due" bigint NOT NULL,
	"finance_charge_due" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "installments_values_valid" CHECK ("installments"."sequence" > 0
          and "installments"."currency" = 'XAF'
          and "installments"."principal_due" >= 0
          and "installments"."finance_charge_due" >= 0
          and ("installments"."principal_due" > 0 or "installments"."finance_charge_due" > 0))
);
-- End of the preceding independently reviewable database operation.
CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"source_type" "journal_source" NOT NULL,
	"source_id" text NOT NULL,
	"kind" "journal_kind" DEFAULT 'standard' NOT NULL,
	"reverses_entry_id" uuid,
	"effective_at" timestamp with time zone NOT NULL,
	"posted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"posted_by" text NOT NULL,
	"description" text NOT NULL,
	CONSTRAINT "journal_entries_reversal_consistent" CHECK (("journal_entries"."kind" = 'standard' and "journal_entries"."reverses_entry_id" is null)
          or ("journal_entries"."kind" = 'reversal' and "journal_entries"."reverses_entry_id" is not null))
);
-- End of the preceding independently reviewable database operation.
CREATE TABLE "journal_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"journal_entry_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"side" "journal_side" NOT NULL,
	"currency" text DEFAULT 'XAF' NOT NULL,
	"amount" bigint NOT NULL,
	"memo" text,
	"customer_id" uuid,
	"contract_id" uuid,
	"installment_id" uuid,
	"payment_id" uuid,
	"fee_assessment_id" uuid,
	CONSTRAINT "journal_lines_values_valid" CHECK ("journal_lines"."currency" = 'XAF' and "journal_lines"."amount" > 0)
);
-- End of the preceding independently reviewable database operation.
CREATE TABLE "ledger_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" "ledger_account_type" NOT NULL,
	"currency" text DEFAULT 'XAF' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_accounts_currency_xaf" CHECK ("ledger_accounts"."currency" = 'XAF')
);
-- End of the preceding independently reviewable database operation.
CREATE TABLE "payment_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"target_type" "allocation_target" NOT NULL,
	"contract_id" uuid,
	"installment_id" uuid,
	"fee_assessment_id" uuid,
	"currency" text DEFAULT 'XAF' NOT NULL,
	"amount" bigint NOT NULL,
	"allocated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_allocations_values_valid" CHECK ("payment_allocations"."currency" = 'XAF' and "payment_allocations"."amount" > 0)
);
-- End of the preceding independently reviewable database operation.
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"contract_id" uuid,
	"currency" text DEFAULT 'XAF' NOT NULL,
	"amount" bigint NOT NULL,
	"channel" "payment_channel" NOT NULL,
	"status" "payment_status" DEFAULT 'initiated' NOT NULL,
	"idempotency_key" text NOT NULL,
	"provider" text,
	"external_reference" text,
	"initiated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"failure_code" text,
	"reversed_at" timestamp with time zone,
	"ledger_entry_id" uuid,
	"reversal_entry_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_values_valid" CHECK ("payments"."currency" = 'XAF' and "payments"."amount" > 0 and "payments"."version" > 0)
);
-- End of the preceding independently reviewable database operation.
CREATE TABLE "permissions" (
	"code" text PRIMARY KEY NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
-- End of the preceding independently reviewable database operation.
CREATE TABLE "platform_role_assignments" (
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"assigned_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_role_assignments_pk" PRIMARY KEY("user_id","role_id")
);
-- End of the preceding independently reviewable database operation.
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_permissions_pk" PRIMARY KEY("role_id","permission_code")
);
-- End of the preceding independently reviewable database operation.
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"scope" "role_scope" NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_scope_tenant_consistent" CHECK (("roles"."scope" = 'platform' and "roles"."tenant_id" is null)
          or "roles"."scope" = 'tenant')
);
-- End of the preceding independently reviewable database operation.
CREATE TABLE "tenant_member_roles" (
	"tenant_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"assigned_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_member_roles_pk" PRIMARY KEY("tenant_id","membership_id","role_id")
);
-- End of the preceding independently reviewable database operation.
CREATE TABLE "tenant_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "membership_status" DEFAULT 'invited' NOT NULL,
	"invited_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
-- End of the preceding independently reviewable database operation.
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
-- End of the preceding independently reviewable database operation.
CREATE TABLE "user_profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text,
	"display_name" text,
	"disabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
-- End of the preceding independently reviewable database operation.
CREATE INDEX "audit_events_tenant_occurred_idx" ON "audit_events" USING btree ("tenant_id","occurred_at");-- End of the preceding independently reviewable database operation.
CREATE INDEX "audit_events_actor_idx" ON "audit_events" USING btree ("actor_user_id","occurred_at");-- End of the preceding independently reviewable database operation.
CREATE UNIQUE INDEX "branches_tenant_code_unique" ON "branches" USING btree ("tenant_id","code");-- End of the preceding independently reviewable database operation.
CREATE UNIQUE INDEX "branches_tenant_id_unique" ON "branches" USING btree ("tenant_id","id");-- End of the preceding independently reviewable database operation.
CREATE INDEX "branches_tenant_idx" ON "branches" USING btree ("tenant_id");-- End of the preceding independently reviewable database operation.
CREATE UNIQUE INDEX "customers_tenant_id_unique" ON "customers" USING btree ("tenant_id","id");-- End of the preceding independently reviewable database operation.
CREATE UNIQUE INDEX "customers_tenant_phone_unique" ON "customers" USING btree ("tenant_id","phone");-- End of the preceding independently reviewable database operation.
CREATE INDEX "customers_tenant_user_idx" ON "customers" USING btree ("tenant_id","user_id");-- End of the preceding independently reviewable database operation.
CREATE UNIQUE INDEX "fee_assessments_tenant_id_unique" ON "fee_assessments" USING btree ("tenant_id","id");-- End of the preceding independently reviewable database operation.
CREATE INDEX "fees_tenant_status_idx" ON "fee_assessments" USING btree ("tenant_id","status");-- End of the preceding independently reviewable database operation.
CREATE UNIQUE INDEX "applications_tenant_id_unique" ON "financing_applications" USING btree ("tenant_id","id");-- End of the preceding independently reviewable database operation.
CREATE INDEX "applications_tenant_status_idx" ON "financing_applications" USING btree ("tenant_id","status");-- End of the preceding independently reviewable database operation.
CREATE UNIQUE INDEX "contracts_tenant_id_unique" ON "financing_contracts" USING btree ("tenant_id","id");-- End of the preceding independently reviewable database operation.
CREATE UNIQUE INDEX "contracts_source_application_unique" ON "financing_contracts" USING btree ("tenant_id","source_application_id");-- End of the preceding independently reviewable database operation.
CREATE INDEX "contracts_tenant_status_idx" ON "financing_contracts" USING btree ("tenant_id","status");-- End of the preceding independently reviewable database operation.
CREATE UNIQUE INDEX "idempotency_tenant_operation_key_unique" ON "idempotency_records" USING btree ("tenant_id","operation","key");-- End of the preceding independently reviewable database operation.
CREATE INDEX "idempotency_expires_idx" ON "idempotency_records" USING btree ("expires_at");-- End of the preceding independently reviewable database operation.
CREATE UNIQUE INDEX "installments_tenant_id_unique" ON "installments" USING btree ("tenant_id","id");-- End of the preceding independently reviewable database operation.
CREATE UNIQUE INDEX "installments_contract_sequence_unique" ON "installments" USING btree ("tenant_id","contract_id","sequence");-- End of the preceding independently reviewable database operation.
CREATE INDEX "installments_tenant_due_date_idx" ON "installments" USING btree ("tenant_id","due_date");-- End of the preceding independently reviewable database operation.
CREATE UNIQUE INDEX "journal_entries_tenant_id_unique" ON "journal_entries" USING btree ("tenant_id","id");-- End of the preceding independently reviewable database operation.
CREATE UNIQUE INDEX "journal_entries_source_unique" ON "journal_entries" USING btree ("tenant_id","source_type","source_id","kind");-- End of the preceding independently reviewable database operation.
CREATE INDEX "journal_entries_tenant_effective_idx" ON "journal_entries" USING btree ("tenant_id","effective_at");-- End of the preceding independently reviewable database operation.
CREATE UNIQUE INDEX "journal_lines_tenant_id_unique" ON "journal_lines" USING btree ("tenant_id","id");-- End of the preceding independently reviewable database operation.
CREATE INDEX "journal_lines_entry_idx" ON "journal_lines" USING btree ("tenant_id","journal_entry_id");-- End of the preceding independently reviewable database operation.
CREATE UNIQUE INDEX "ledger_accounts_tenant_id_unique" ON "ledger_accounts" USING btree ("tenant_id","id");-- End of the preceding independently reviewable database operation.
CREATE UNIQUE INDEX "ledger_accounts_tenant_code_unique" ON "ledger_accounts" USING btree ("tenant_id","code");-- End of the preceding independently reviewable database operation.
CREATE UNIQUE INDEX "payment_allocations_tenant_id_unique" ON "payment_allocations" USING btree ("tenant_id","id");-- End of the preceding independently reviewable database operation.
CREATE INDEX "payment_allocations_payment_idx" ON "payment_allocations" USING btree ("tenant_id","payment_id");-- End of the preceding independently reviewable database operation.
CREATE UNIQUE INDEX "payments_tenant_id_unique" ON "payments" USING btree ("tenant_id","id");-- End of the preceding independently reviewable database operation.
CREATE UNIQUE INDEX "payments_tenant_idempotency_unique" ON "payments" USING btree ("tenant_id","idempotency_key");-- End of the preceding independently reviewable database operation.
CREATE INDEX "payments_tenant_status_idx" ON "payments" USING btree ("tenant_id","status");-- End of the preceding independently reviewable database operation.
CREATE UNIQUE INDEX "roles_global_key_unique" ON "roles" USING btree ("scope","key") WHERE "roles"."tenant_id" is null;-- End of the preceding independently reviewable database operation.
CREATE UNIQUE INDEX "roles_tenant_key_unique" ON "roles" USING btree ("tenant_id","key") WHERE "roles"."tenant_id" is not null;-- End of the preceding independently reviewable database operation.
CREATE UNIQUE INDEX "roles_tenant_id_unique" ON "roles" USING btree ("tenant_id","id");-- End of the preceding independently reviewable database operation.
CREATE INDEX "tenant_member_roles_role_idx" ON "tenant_member_roles" USING btree ("role_id");-- End of the preceding independently reviewable database operation.
CREATE UNIQUE INDEX "tenant_memberships_tenant_user_unique" ON "tenant_memberships" USING btree ("tenant_id","user_id");-- End of the preceding independently reviewable database operation.
CREATE UNIQUE INDEX "tenant_memberships_tenant_id_unique" ON "tenant_memberships" USING btree ("tenant_id","id");-- End of the preceding independently reviewable database operation.
CREATE INDEX "tenant_memberships_user_idx" ON "tenant_memberships" USING btree ("user_id");-- End of the preceding independently reviewable database operation.
CREATE UNIQUE INDEX "tenants_slug_unique" ON "tenants" USING btree ("slug");-- End of the preceding independently reviewable database operation.
CREATE UNIQUE INDEX "tenants_tenant_id_unique" ON "tenants" USING btree ("id","id");-- End of the preceding independently reviewable database operation.
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;-- End of the preceding independently reviewable database operation.
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_user_profiles_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;-- End of the preceding independently reviewable database operation.
ALTER TABLE "branches" ADD CONSTRAINT "branches_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;-- End of the preceding independently reviewable database operation.
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;-- End of the preceding independently reviewable database operation.
ALTER TABLE "customers" ADD CONSTRAINT "customers_user_id_user_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;-- End of the preceding independently reviewable database operation.
ALTER TABLE "fee_assessments" ADD CONSTRAINT "fee_assessments_waived_by_user_profiles_id_fk" FOREIGN KEY ("waived_by") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;-- End of the preceding independently reviewable database operation.
ALTER TABLE "fee_assessments" ADD CONSTRAINT "fee_application_fk" FOREIGN KEY ("tenant_id","application_id") REFERENCES "public"."financing_applications"("tenant_id","id") ON DELETE no action ON UPDATE no action;-- End of the preceding independently reviewable database operation.
ALTER TABLE "fee_assessments" ADD CONSTRAINT "fee_contract_fk" FOREIGN KEY ("tenant_id","contract_id") REFERENCES "public"."financing_contracts"("tenant_id","id") ON DELETE no action ON UPDATE no action;-- End of the preceding independently reviewable database operation.
ALTER TABLE "fee_assessments" ADD CONSTRAINT "fee_installment_fk" FOREIGN KEY ("tenant_id","installment_id") REFERENCES "public"."installments"("tenant_id","id") ON DELETE no action ON UPDATE no action;-- End of the preceding independently reviewable database operation.
ALTER TABLE "fee_assessments" ADD CONSTRAINT "fee_payment_fk" FOREIGN KEY ("tenant_id","payment_id") REFERENCES "public"."payments"("tenant_id","id") ON DELETE no action ON UPDATE no action;-- End of the preceding independently reviewable database operation.
ALTER TABLE "fee_assessments" ADD CONSTRAINT "fee_ledger_entry_fk" FOREIGN KEY ("tenant_id","ledger_entry_id") REFERENCES "public"."journal_entries"("tenant_id","id") ON DELETE no action ON UPDATE no action;-- End of the preceding independently reviewable database operation.
ALTER TABLE "fee_assessments" ADD CONSTRAINT "fee_waiver_entry_fk" FOREIGN KEY ("tenant_id","waiver_entry_id") REFERENCES "public"."journal_entries"("tenant_id","id") ON DELETE no action ON UPDATE no action;-- End of the preceding independently reviewable database operation.
ALTER TABLE "fee_assessments" ADD CONSTRAINT "fee_reversal_entry_fk" FOREIGN KEY ("tenant_id","reversal_entry_id") REFERENCES "public"."journal_entries"("tenant_id","id") ON DELETE no action ON UPDATE no action;-- End of the preceding independently reviewable database operation.
ALTER TABLE "financing_applications" ADD CONSTRAINT "financing_applications_decided_by_user_profiles_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;-- End of the preceding independently reviewable database operation.
ALTER TABLE "financing_applications" ADD CONSTRAINT "applications_branch_fk" FOREIGN KEY ("tenant_id","branch_id") REFERENCES "public"."branches"("tenant_id","id") ON DELETE no action ON UPDATE no action;-- End of the preceding independently reviewable database operation.
ALTER TABLE "financing_applications" ADD CONSTRAINT "applications_customer_fk" FOREIGN KEY ("tenant_id","customer_id") REFERENCES "public"."customers"("tenant_id","id") ON DELETE no action ON UPDATE no action;-- End of the preceding independently reviewable database operation.
ALTER TABLE "financing_contracts" ADD CONSTRAINT "contracts_branch_fk" FOREIGN KEY ("tenant_id","branch_id") REFERENCES "public"."branches"("tenant_id","id") ON DELETE no action ON UPDATE no action;-- End of the preceding independently reviewable database operation.
ALTER TABLE "financing_contracts" ADD CONSTRAINT "contracts_customer_fk" FOREIGN KEY ("tenant_id","customer_id") REFERENCES "public"."customers"("tenant_id","id") ON DELETE no action ON UPDATE no action;-- End of the preceding independently reviewable database operation.
ALTER TABLE "financing_contracts" ADD CONSTRAINT "contracts_application_fk" FOREIGN KEY ("tenant_id","source_application_id") REFERENCES "public"."financing_applications"("tenant_id","id") ON DELETE no action ON UPDATE no action;-- End of the preceding independently reviewable database operation.
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;-- End of the preceding independently reviewable database operation.
ALTER TABLE "installments" ADD CONSTRAINT "installments_contract_fk" FOREIGN KEY ("tenant_id","contract_id") REFERENCES "public"."financing_contracts"("tenant_id","id") ON DELETE no action ON UPDATE no action;-- End of the preceding independently reviewable database operation.
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;-- End of the preceding independently reviewable database operation.
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_reversal_fk" FOREIGN KEY ("tenant_id","reverses_entry_id") REFERENCES "public"."journal_entries"("tenant_id","id") ON DELETE no action ON UPDATE no action;-- End of the preceding independently reviewable database operation.
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_entry_fk" FOREIGN KEY ("tenant_id","journal_entry_id") REFERENCES "public"."journal_entries"("tenant_id","id") ON DELETE no action ON UPDATE no action;-- End of the preceding independently reviewable database operation.
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_fk" FOREIGN KEY ("tenant_id","account_id") REFERENCES "public"."ledger_accounts"("tenant_id","id") ON DELETE no action ON UPDATE no action;-- End of the preceding independently reviewable database operation.
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_customer_fk" FOREIGN KEY ("tenant_id","customer_id") REFERENCES "public"."customers"("tenant_id","id") ON DELETE no action ON UPDATE no action;-- End of the preceding independently reviewable database operation.
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_contract_fk" FOREIGN KEY ("tenant_id","contract_id") REFERENCES "public"."financing_contracts"("tenant_id","id") ON DELETE no action ON UPDATE no action;-- End of the preceding independently reviewable database operation.
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_installment_fk" FOREIGN KEY ("tenant_id","installment_id") REFERENCES "public"."installments"("tenant_id","id") ON DELETE no action ON UPDATE no action;-- End of the preceding independently reviewable database operation.
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_payment_fk" FOREIGN KEY ("tenant_id","payment_id") REFERENCES "public"."payments"("tenant_id","id") ON DELETE no action ON UPDATE no action;-- End of the preceding independently reviewable database operation.
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_fee_fk" FOREIGN KEY ("tenant_id","fee_assessment_id") REFERENCES "public"."fee_assessments"("tenant_id","id") ON DELETE no action ON UPDATE no action;-- End of the preceding independently reviewable database operation.
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;-- End of the preceding independently reviewable database operation.
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_fk" FOREIGN KEY ("tenant_id","payment_id") REFERENCES "public"."payments"("tenant_id","id") ON DELETE no action ON UPDATE no action;-- End of the preceding independently reviewable database operation.
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_contract_fk" FOREIGN KEY ("tenant_id","contract_id") REFERENCES "public"."financing_contracts"("tenant_id","id") ON DELETE no action ON UPDATE no action;-- End of the preceding independently reviewable database operation.
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_installment_fk" FOREIGN KEY ("tenant_id","installment_id") REFERENCES "public"."installments"("tenant_id","id") ON DELETE no action ON UPDATE no action;-- End of the preceding independently reviewable database operation.
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_fee_fk" FOREIGN KEY ("tenant_id","fee_assessment_id") REFERENCES "public"."fee_assessments"("tenant_id","id") ON DELETE no action ON UPDATE no action;-- End of the preceding independently reviewable database operation.
ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_fk" FOREIGN KEY ("tenant_id","customer_id") REFERENCES "public"."customers"("tenant_id","id") ON DELETE no action ON UPDATE no action;-- End of the preceding independently reviewable database operation.
ALTER TABLE "payments" ADD CONSTRAINT "payments_contract_fk" FOREIGN KEY ("tenant_id","contract_id") REFERENCES "public"."financing_contracts"("tenant_id","id") ON DELETE no action ON UPDATE no action;-- End of the preceding independently reviewable database operation.
ALTER TABLE "payments" ADD CONSTRAINT "payments_ledger_entry_fk" FOREIGN KEY ("tenant_id","ledger_entry_id") REFERENCES "public"."journal_entries"("tenant_id","id") ON DELETE no action ON UPDATE no action;-- End of the preceding independently reviewable database operation.
ALTER TABLE "payments" ADD CONSTRAINT "payments_reversal_entry_fk" FOREIGN KEY ("tenant_id","reversal_entry_id") REFERENCES "public"."journal_entries"("tenant_id","id") ON DELETE no action ON UPDATE no action;-- End of the preceding independently reviewable database operation.
ALTER TABLE "platform_role_assignments" ADD CONSTRAINT "platform_role_assignments_user_id_user_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;-- End of the preceding independently reviewable database operation.
ALTER TABLE "platform_role_assignments" ADD CONSTRAINT "platform_role_assignments_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;-- End of the preceding independently reviewable database operation.
ALTER TABLE "platform_role_assignments" ADD CONSTRAINT "platform_role_assignments_assigned_by_user_profiles_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;-- End of the preceding independently reviewable database operation.
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;-- End of the preceding independently reviewable database operation.
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_code_permissions_code_fk" FOREIGN KEY ("permission_code") REFERENCES "public"."permissions"("code") ON DELETE no action ON UPDATE no action;-- End of the preceding independently reviewable database operation.
ALTER TABLE "roles" ADD CONSTRAINT "roles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;-- End of the preceding independently reviewable database operation.
ALTER TABLE "tenant_member_roles" ADD CONSTRAINT "tenant_member_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;-- End of the preceding independently reviewable database operation.
ALTER TABLE "tenant_member_roles" ADD CONSTRAINT "tenant_member_roles_assigned_by_user_profiles_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;-- End of the preceding independently reviewable database operation.
ALTER TABLE "tenant_member_roles" ADD CONSTRAINT "tenant_member_roles_membership_fk" FOREIGN KEY ("tenant_id","membership_id") REFERENCES "public"."tenant_memberships"("tenant_id","id") ON DELETE no action ON UPDATE no action;-- End of the preceding independently reviewable database operation.
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;-- End of the preceding independently reviewable database operation.
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_user_id_user_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;-- End of the preceding independently reviewable database operation.
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_invited_by_user_profiles_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;-- End of the preceding independently reviewable database operation.
