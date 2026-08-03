import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  ApplicantSnapshot,
  DeviceSnapshot,
  FeeCalculationSnapshot,
  FinancingTerms,
  RequestedFinancingTerms,
} from "../domain/index.js";

const createdAt = timestamp("created_at", {
  withTimezone: true,
  mode: "string",
})
  .notNull()
  .defaultNow();
const updatedAt = timestamp("updated_at", {
  withTimezone: true,
  mode: "string",
})
  .notNull()
  .defaultNow();

export const inventoryUnitStatusEnum = pgEnum("inventory_unit_status", [
  "available",
  "reserved",
  "financed",
  "sold",
  "returned",
  "damaged",
]);

export const membershipStatusEnum = pgEnum("membership_status", [
  "invited",
  "active",
  "suspended",
  "revoked",
]);
export const tenantOnboardingStatusEnum = pgEnum("tenant_onboarding_status", [
  "pending_owner",
  "business_profile_required",
  "kyb_required",
  "kyb_in_review",
  "branch_setup_required",
  "configuration_required",
  "pending_approval",
  "active",
  "rejected",
]);
export const businessLegalFormEnum = pgEnum("business_legal_form", [
  "sole_proprietorship",
  "limited_liability_company",
  "public_limited_company",
  "partnership",
  "cooperative",
  "other",
]);
export const retailerKybStatusEnum = pgEnum("retailer_kyb_status", [
  "not_started",
  "in_progress",
  "in_review",
  "resubmission_required",
  "provider_approved",
  "provider_declined",
  "approved",
  "rejected",
]);
export const tenantInvitationStatusEnum = pgEnum("tenant_invitation_status", [
  "pending",
  "accepted",
  "expired",
  "revoked",
]);
export const invitationDeliveryStatusEnum = pgEnum("invitation_delivery_status", [
  "pending",
  "sent",
  "failed",
]);
export const roleScopeEnum = pgEnum("role_scope", ["platform", "tenant"]);
export const applicationStatusEnum = pgEnum("application_status", [
  "draft",
  "submitted",
  "kyc_review",
  "credit_review",
  "approved",
  "rejected",
  "cancelled",
  "expired",
]);
export const kycStatusEnum = pgEnum("kyc_status", [
  "not_started",
  "pending",
  "verified",
  "needs_correction",
  "failed",
]);
export const contractStatusEnum = pgEnum("contract_status", [
  "draft",
  "pending_signature",
  "cancelled",
  "active",
  "past_due",
  "suspended",
  "completed",
  "terminated",
  "written_off",
]);
export const repaymentFrequencyEnum = pgEnum("repayment_frequency", [
  "weekly",
  "biweekly",
  "monthly",
]);
export const paymentStatusEnum = pgEnum("payment_status", [
  "initiated",
  "pending",
  "settled",
  "failed",
  "cancelled",
  "reversed",
]);
export const paymentChannelEnum = pgEnum("payment_channel", [
  "cash",
  "mtn_momo",
  "orange_money",
  "bank_transfer",
  "card",
  "ussd",
]);
export const allocationTargetEnum = pgEnum("allocation_target", [
  "down_payment",
  "installment_principal",
  "installment_finance_charge",
  "fee",
  "unapplied_credit",
]);
export const feeKindEnum = pgEnum("fee_kind", [
  "origination",
  "late_payment",
  "collection",
  "device_restriction",
  "restructuring",
  "other",
]);
export const feeStatusEnum = pgEnum("fee_status", ["assessed", "waived", "reversed"]);
export const feeSubjectEnum = pgEnum("fee_subject", [
  "application",
  "contract",
  "installment",
  "payment",
]);
export const ledgerAccountTypeEnum = pgEnum("ledger_account_type", [
  "asset",
  "liability",
  "equity",
  "income",
  "expense",
  "contra_asset",
]);
export const journalKindEnum = pgEnum("journal_kind", ["standard", "reversal"]);
export const journalSideEnum = pgEnum("journal_side", ["debit", "credit"]);
export const journalSourceEnum = pgEnum("journal_source", [
  "application",
  "contract",
  "installment",
  "payment",
  "fee",
  "manual",
]);
export const providerEventStatusEnum = pgEnum("provider_event_status", [
  "received",
  "processed",
  "ignored",
  "failed",
]);
export const reconciliationRunStatusEnum = pgEnum("reconciliation_run_status", [
  "pending",
  "processing",
  "completed",
  "failed",
]);
export const reconciliationItemStatusEnum = pgEnum("reconciliation_item_status", [
  "matched",
  "missing_internal",
  "missing_provider",
  "amount_mismatch",
  "status_mismatch",
]);
export const documentStatusEnum = pgEnum("document_status", [
  "requested",
  "uploading",
  "uploaded",
  "verified",
  "rejected",
  "deleted",
]);
export const kycSessionStatusEnum = pgEnum("kyc_session_status", [
  "not_started",
  "in_progress",
  "in_review",
  "approved",
  "declined",
  "abandoned",
  "expired",
  "failed",
]);
export const managedDeviceStatusEnum = pgEnum("managed_device_status", [
  "pending_enrollment",
  "active",
  "restricted",
  "released",
  "wiped",
  "error",
]);
export const mdmCommandKindEnum = pgEnum("mdm_command_kind", [
  "lock",
  "restrict",
  "release",
  "sync",
  "wipe",
]);
export const mdmCommandStatusEnum = pgEnum("mdm_command_status", [
  "queued",
  "sent",
  "acknowledged",
  "failed",
]);
export const notificationSeverityEnum = pgEnum("notification_severity", [
  "info",
  "success",
  "warning",
  "critical",
]);
export const notificationEmailStatusEnum = pgEnum("notification_email_status", [
  "pending",
  "sent",
  "failed",
  "skipped",
]);

export const userProfiles = pgTable("user_profiles", {
  id: uuid("id").primaryKey(),
  email: text("email"),
  displayName: text("display_name"),
  disabled: boolean("disabled").notNull().default(false),
  createdAt,
  updatedAt,
});

export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
    onboardingStatus: tenantOnboardingStatusEnum("onboarding_status")
      .notNull()
      .default("active"),
    archivedAt: timestamp("archived_at", {
      withTimezone: true,
      mode: "string",
    }),
    archivedBy: uuid("archived_by").references(() => userProfiles.id),
    archiveReason: text("archive_reason"),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("tenants_slug_unique").on(table.slug),
    uniqueIndex("tenants_tenant_id_unique").on(table.id, table.id),
    check(
      "tenants_archive_consistent",
      sql`(${table.archivedAt} is null
            and ${table.archivedBy} is null
            and ${table.archiveReason} is null)
          or (${table.archivedAt} is not null
            and ${table.archivedBy} is not null
            and ${table.archiveReason} is not null
            and length(btrim(${table.archiveReason})) >= 3
            and ${table.active} = false)`,
    ),
  ],
);

export const tenantBusinessProfiles = pgTable(
  "tenant_business_profiles",
  {
    tenantId: uuid("tenant_id")
      .primaryKey()
      .references(() => tenants.id),
    legalName: text("legal_name").notNull(),
    tradingName: text("trading_name"),
    legalForm: businessLegalFormEnum("legal_form").notNull(),
    registrationNumber: text("registration_number").notNull(),
    taxIdentificationNumber: text("tax_identification_number").notNull(),
    countryCode: text("country_code").notNull().default("CM"),
    registeredAddressLine1: text("registered_address_line_1").notNull(),
    registeredAddressLine2: text("registered_address_line_2"),
    city: text("city").notNull(),
    region: text("region"),
    postalCode: text("postal_code"),
    contactEmail: text("contact_email").notNull(),
    contactPhone: text("contact_phone").notNull(),
    websiteUrl: text("website_url"),
    incorporationDate: date("incorporation_date", { mode: "string" }),
    baseCurrency: text("base_currency").notNull().default("XAF"),
    updatedBy: uuid("updated_by")
      .notNull()
      .references(() => userProfiles.id),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("tenant_business_profiles_registration_unique").on(
      table.registrationNumber,
    ),
    uniqueIndex("tenant_business_profiles_tax_identifier_unique").on(
      table.taxIdentificationNumber,
    ),
    check(
      "tenant_business_profiles_country_code_format",
      sql`${table.countryCode} ~ '^[A-Z]{2}$'`,
    ),
    check(
      "tenant_business_profiles_base_currency_format",
      sql`${table.baseCurrency} ~ '^[A-Z]{3}$'`,
    ),
    check(
      "tenant_business_profiles_contact_phone_format",
      sql`${table.contactPhone} ~ '^\\+[1-9][0-9]{7,14}$'`,
    ),
  ],
);

export const tenantKybCases = pgTable(
  "tenant_kyb_cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    provider: text("provider").notNull().default("didit"),
    providerSessionId: text("provider_session_id"),
    verificationUrl: text("verification_url"),
    status: retailerKybStatusEnum("status").notNull().default("not_started"),
    providerStatus: text("provider_status"),
    decision: jsonb("decision").$type<Record<string, unknown>>(),
    decisionReason: text("decision_reason"),
    riskScore: integer("risk_score"),
    submittedAt: timestamp("submitted_at", {
      withTimezone: true,
      mode: "string",
    }),
    providerCompletedAt: timestamp("provider_completed_at", {
      withTimezone: true,
      mode: "string",
    }),
    reviewedAt: timestamp("reviewed_at", {
      withTimezone: true,
      mode: "string",
    }),
    reviewedBy: uuid("reviewed_by").references(() => userProfiles.id),
    reviewNotes: text("review_notes"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => userProfiles.id),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("tenant_kyb_cases_tenant_unique").on(table.tenantId),
    uniqueIndex("tenant_kyb_cases_provider_session_unique").on(
      table.provider,
      table.providerSessionId,
    ),
    index("tenant_kyb_cases_status_idx").on(table.status, table.updatedAt),
    check(
      "tenant_kyb_cases_risk_score_valid",
      sql`${table.riskScore} is null or (${table.riskScore} >= 0 and ${table.riskScore} <= 100)`,
    ),
    check(
      "tenant_kyb_cases_review_consistent",
      sql`(${table.reviewedAt} is null and ${table.reviewedBy} is null)
        or (${table.reviewedAt} is not null and ${table.reviewedBy} is not null)`,
    ),
  ],
);

export const branches = pgTable(
  "branches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("branches_tenant_code_unique").on(table.tenantId, table.code),
    uniqueIndex("branches_tenant_id_unique").on(table.tenantId, table.id),
    index("branches_tenant_idx").on(table.tenantId),
  ],
);

export const catalogProducts = pgTable(
  "catalog_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    sku: text("sku").notNull(),
    brand: text("brand").notNull(),
    model: text("model").notNull(),
    storage: text("storage").notNull(),
    color: text("color").notNull(),
    cashPrice: bigint("cash_price", { mode: "number" }).notNull(),
    imagePath: text("image_path"),
    active: boolean("active").notNull().default(true),
    version: integer("version").notNull().default(1),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("catalog_products_tenant_sku_unique").on(table.tenantId, table.sku),
    uniqueIndex("catalog_products_tenant_id_unique").on(table.tenantId, table.id),
    index("catalog_products_tenant_active_idx").on(table.tenantId, table.active),
    check("catalog_products_cash_price_positive", sql`${table.cashPrice} > 0`),
    check("catalog_products_version_positive", sql`${table.version} > 0`),
  ],
);

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id").notNull(),
    userId: uuid("user_id").references(() => userProfiles.id),
    fullName: text("full_name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    nationalIdReference: text("national_id_reference"),
    version: integer("version").notNull().default(1),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("customers_tenant_id_unique").on(table.tenantId, table.id),
    uniqueIndex("customers_tenant_phone_unique").on(table.tenantId, table.phone),
    index("customers_tenant_user_idx").on(table.tenantId, table.userId),
    foreignKey({
      name: "customers_branch_fk",
      columns: [table.tenantId, table.branchId],
      foreignColumns: [branches.tenantId, branches.id],
    }),
    index("customers_tenant_branch_idx").on(table.tenantId, table.branchId),
    check("customers_version_positive", sql`${table.version} > 0`),
  ],
);

export const permissions = pgTable("permissions", {
  code: text("code").primaryKey(),
  description: text("description").notNull(),
  createdAt,
});

export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    scope: roleScopeEnum("scope").notNull(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    system: boolean("system").notNull().default(false),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("roles_global_key_unique")
      .on(table.scope, table.key)
      .where(sql`${table.tenantId} is null`),
    uniqueIndex("roles_tenant_key_unique")
      .on(table.tenantId, table.key)
      .where(sql`${table.tenantId} is not null`),
    uniqueIndex("roles_tenant_id_unique").on(table.tenantId, table.id),
    check(
      "roles_scope_tenant_consistent",
      sql`(${table.scope} = 'platform' and ${table.tenantId} is null)
          or ${table.scope} = 'tenant'`,
    ),
  ],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id),
    permissionCode: text("permission_code")
      .notNull()
      .references(() => permissions.code),
    createdAt,
  },
  (table) => [
    primaryKey({
      name: "role_permissions_pk",
      columns: [table.roleId, table.permissionCode],
    }),
  ],
);

export const tenantMemberships = pgTable(
  "tenant_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => userProfiles.id),
    status: membershipStatusEnum("status").notNull().default("invited"),
    allBranches: boolean("all_branches").notNull().default(false),
    invitedBy: uuid("invited_by").references(() => userProfiles.id),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("tenant_memberships_tenant_user_unique").on(
      table.tenantId,
      table.userId,
    ),
    uniqueIndex("tenant_memberships_tenant_id_unique").on(table.tenantId, table.id),
    index("tenant_memberships_user_idx").on(table.userId),
  ],
);

export const tenantMemberRoles = pgTable(
  "tenant_member_roles",
  {
    tenantId: uuid("tenant_id").notNull(),
    membershipId: uuid("membership_id").notNull(),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id),
    assignedBy: uuid("assigned_by").references(() => userProfiles.id),
    createdAt,
  },
  (table) => [
    primaryKey({
      name: "tenant_member_roles_pk",
      columns: [table.tenantId, table.membershipId, table.roleId],
    }),
    foreignKey({
      name: "tenant_member_roles_membership_fk",
      columns: [table.tenantId, table.membershipId],
      foreignColumns: [tenantMemberships.tenantId, tenantMemberships.id],
    }),
    index("tenant_member_roles_role_idx").on(table.roleId),
  ],
);
export const tenantMembershipBranches = pgTable(
  "tenant_membership_branches",
  {
    tenantId: uuid("tenant_id").notNull(),
    membershipId: uuid("membership_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    assignedBy: uuid("assigned_by")
      .notNull()
      .references(() => userProfiles.id),
    createdAt,
  },
  (table) => [
    primaryKey({
      name: "tenant_membership_branches_pk",
      columns: [table.tenantId, table.membershipId, table.branchId],
    }),
    foreignKey({
      name: "tenant_membership_branches_membership_fk",
      columns: [table.tenantId, table.membershipId],
      foreignColumns: [tenantMemberships.tenantId, tenantMemberships.id],
    }),
    foreignKey({
      name: "tenant_membership_branches_branch_fk",
      columns: [table.tenantId, table.branchId],
      foreignColumns: [branches.tenantId, branches.id],
    }),
    index("tenant_membership_branches_branch_idx").on(table.tenantId, table.branchId),
  ],
);

export const tenantInvitations = pgTable(
  "tenant_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    email: text("email").notNull(),
    normalizedEmail: text("normalized_email").notNull(),
    fullName: text("full_name").notNull(),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id),
    allBranches: boolean("all_branches").notNull().default(false),
    status: tenantInvitationStatusEnum("status").notNull().default("pending"),
    deliveryStatus: invitationDeliveryStatusEnum("delivery_status")
      .notNull()
      .default("pending"),
    requiresPasswordSetup: boolean("requires_password_setup").notNull().default(true),
    sentAt: timestamp("sent_at", {
      withTimezone: true,
      mode: "string",
    }),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    acceptedBy: uuid("accepted_by").references(() => userProfiles.id),
    acceptedAt: timestamp("accepted_at", {
      withTimezone: true,
      mode: "string",
    }),
    deliveryError: text("delivery_error"),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => userProfiles.id),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("tenant_invitations_tenant_id_unique").on(table.tenantId, table.id),
    uniqueIndex("tenant_invitations_pending_email_role_unique")
      .on(table.tenantId, table.normalizedEmail, table.roleId)
      .where(sql`${table.status} = 'pending'`),
    index("tenant_invitations_recipient_idx").on(
      table.normalizedEmail,
      table.status,
      table.expiresAt,
    ),
    index("tenant_invitations_tenant_status_idx").on(table.tenantId, table.status),
    check(
      "tenant_invitations_email_normalized",
      sql`${table.normalizedEmail} = lower(btrim(${table.email}))`,
    ),
    check(
      "tenant_invitations_acceptance_consistent",
      sql`(${table.status} = 'accepted' AND ${table.acceptedBy} IS NOT NULL AND ${table.acceptedAt} IS NOT NULL)
          OR (${table.status} <> 'accepted' AND ${table.acceptedBy} IS NULL AND ${table.acceptedAt} IS NULL)`,
    ),
    check(
      "tenant_invitations_expiry_valid",
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
  ],
);

export const tenantInvitationBranches = pgTable(
  "tenant_invitation_branches",
  {
    tenantId: uuid("tenant_id").notNull(),
    invitationId: uuid("invitation_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    createdAt,
  },
  (table) => [
    primaryKey({
      name: "tenant_invitation_branches_pk",
      columns: [table.tenantId, table.invitationId, table.branchId],
    }),
    foreignKey({
      name: "tenant_invitation_branches_invitation_fk",
      columns: [table.tenantId, table.invitationId],
      foreignColumns: [tenantInvitations.tenantId, tenantInvitations.id],
    }),
    foreignKey({
      name: "tenant_invitation_branches_branch_fk",
      columns: [table.tenantId, table.branchId],
      foreignColumns: [branches.tenantId, branches.id],
    }),
    index("tenant_invitation_branches_branch_idx").on(table.tenantId, table.branchId),
  ],
);

export const platformInvitations = pgTable(
  "platform_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    normalizedEmail: text("normalized_email").notNull(),
    fullName: text("full_name").notNull(),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id),
    status: tenantInvitationStatusEnum("status").notNull().default("pending"),
    deliveryStatus: invitationDeliveryStatusEnum("delivery_status")
      .notNull()
      .default("pending"),
    requiresPasswordSetup: boolean("requires_password_setup").notNull().default(true),
    sentAt: timestamp("sent_at", {
      withTimezone: true,
      mode: "string",
    }),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    acceptedBy: uuid("accepted_by").references(() => userProfiles.id),
    acceptedAt: timestamp("accepted_at", {
      withTimezone: true,
      mode: "string",
    }),
    deliveryError: text("delivery_error"),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => userProfiles.id),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("platform_invitations_pending_email_role_unique")
      .on(table.normalizedEmail, table.roleId)
      .where(sql`${table.status} = 'pending'`),
    index("platform_invitations_recipient_idx").on(
      table.normalizedEmail,
      table.status,
      table.expiresAt,
    ),
    index("platform_invitations_status_idx").on(table.status, table.createdAt),
    check(
      "platform_invitations_email_normalized",
      sql`${table.normalizedEmail} = lower(btrim(${table.email}))`,
    ),
    check(
      "platform_invitations_acceptance_consistent",
      sql`(${table.status} = 'accepted' AND ${table.acceptedBy} IS NOT NULL AND ${table.acceptedAt} IS NOT NULL)
          OR (${table.status} <> 'accepted' AND ${table.acceptedBy} IS NULL AND ${table.acceptedAt} IS NULL)`,
    ),
    check(
      "platform_invitations_expiry_valid",
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
  ],
);
export const platformRoleAssignments = pgTable(
  "platform_role_assignments",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => userProfiles.id),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id),
    assignedBy: uuid("assigned_by").references(() => userProfiles.id),
    createdAt,
  },
  (table) => [
    primaryKey({
      name: "platform_role_assignments_pk",
      columns: [table.userId, table.roleId],
    }),
  ],
);

export const platformSettings = pgTable(
  "platform_settings",
  {
    key: text("key").primaryKey(),
    value: jsonb("value").$type<Record<string, unknown>>().notNull(),
    version: integer("version").notNull().default(1),
    updatedBy: uuid("updated_by")
      .notNull()
      .references(() => userProfiles.id),
    createdAt,
    updatedAt,
  },
  (table) => [check("platform_settings_version_positive", sql`${table.version} > 0`)],
);
export const financingApplications = pgTable(
  "financing_applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    customerId: uuid("customer_id"),
    catalogProductId: uuid("catalog_product_id").notNull(),
    applicant: jsonb("applicant").$type<ApplicantSnapshot>().notNull(),
    device: jsonb("device").$type<DeviceSnapshot>().notNull(),
    requestedTerms: jsonb("requested_terms").$type<RequestedFinancingTerms>().notNull(),
    approvedTerms: jsonb("approved_terms").$type<FinancingTerms>(),
    kycStatus: kycStatusEnum("kyc_status").notNull().default("not_started"),
    status: applicationStatusEnum("status").notNull().default("draft"),
    submittedAt: timestamp("submitted_at", {
      withTimezone: true,
      mode: "string",
    }),
    decisionOutcome: text("decision_outcome"),
    decisionReasonCode: text("decision_reason_code"),
    decisionNotes: text("decision_notes"),
    decidedBy: uuid("decided_by").references(() => userProfiles.id),
    decidedAt: timestamp("decided_at", {
      withTimezone: true,
      mode: "string",
    }),
    convertedContractId: uuid("converted_contract_id"),
    version: integer("version").notNull().default(1),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("applications_tenant_id_unique").on(table.tenantId, table.id),
    foreignKey({
      name: "applications_branch_fk",
      columns: [table.tenantId, table.branchId],
      foreignColumns: [branches.tenantId, branches.id],
    }),
    foreignKey({
      name: "applications_customer_fk",
      columns: [table.tenantId, table.customerId],
      foreignColumns: [customers.tenantId, customers.id],
    }),
    foreignKey({
      name: "applications_catalog_product_fk",
      columns: [table.tenantId, table.catalogProductId],
      foreignColumns: [catalogProducts.tenantId, catalogProducts.id],
    }),
    index("applications_tenant_status_idx").on(table.tenantId, table.status),
    check("applications_version_positive", sql`${table.version} > 0`),
    check(
      "applications_decision_outcome_valid",
      sql`${table.decisionOutcome} is null or ${table.decisionOutcome} in ('approved', 'rejected')`,
    ),
  ],
);

export const financingContracts = pgTable(
  "financing_contracts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    customerId: uuid("customer_id").notNull(),
    sourceApplicationId: uuid("source_application_id").notNull(),
    device: jsonb("device").$type<DeviceSnapshot>().notNull(),
    currency: text("currency").notNull().default("XAF"),
    deviceCashPrice: bigint("device_cash_price", { mode: "number" }).notNull(),
    downPayment: bigint("down_payment", { mode: "number" }).notNull(),
    financedPrincipal: bigint("financed_principal", {
      mode: "number",
    }).notNull(),
    financeCharge: bigint("finance_charge", { mode: "number" }).notNull(),
    installmentCount: integer("installment_count").notNull(),
    repaymentFrequency: repaymentFrequencyEnum("repayment_frequency").notNull(),
    firstDueDate: date("first_due_date", { mode: "string" }).notNull(),
    gracePeriodDays: integer("grace_period_days").notNull(),
    status: contractStatusEnum("status").notNull().default("pending_signature"),
    signedAt: timestamp("signed_at", { withTimezone: true, mode: "string" }),
    activatedAt: timestamp("activated_at", {
      withTimezone: true,
      mode: "string",
    }),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "string",
    }),
    terminatedAt: timestamp("terminated_at", {
      withTimezone: true,
      mode: "string",
    }),
    version: integer("version").notNull().default(1),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("contracts_tenant_id_unique").on(table.tenantId, table.id),
    uniqueIndex("contracts_source_application_unique").on(
      table.tenantId,
      table.sourceApplicationId,
    ),
    foreignKey({
      name: "contracts_branch_fk",
      columns: [table.tenantId, table.branchId],
      foreignColumns: [branches.tenantId, branches.id],
    }),
    foreignKey({
      name: "contracts_customer_fk",
      columns: [table.tenantId, table.customerId],
      foreignColumns: [customers.tenantId, customers.id],
    }),
    foreignKey({
      name: "contracts_application_fk",
      columns: [table.tenantId, table.sourceApplicationId],
      foreignColumns: [financingApplications.tenantId, financingApplications.id],
    }),
    index("contracts_tenant_status_idx").on(table.tenantId, table.status),
    check("contracts_currency_xaf", sql`${table.currency} = 'XAF'`),
    check(
      "contracts_amounts_valid",
      sql`${table.deviceCashPrice} >= 0
          and ${table.downPayment} >= 0
          and ${table.financedPrincipal} >= 0
          and ${table.financeCharge} >= 0
          and ${table.deviceCashPrice} = ${table.downPayment} + ${table.financedPrincipal}`,
    ),
    check(
      "contracts_schedule_valid",
      sql`${table.installmentCount} > 0 and ${table.gracePeriodDays} >= 0`,
    ),
    check("contracts_version_positive", sql`${table.version} > 0`),
  ],
);

export const inventoryUnits = pgTable(
  "inventory_units",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    catalogProductId: uuid("catalog_product_id").notNull(),
    imei: text("imei").notNull(),
    serialNumber: text("serial_number"),
    status: inventoryUnitStatusEnum("status").notNull().default("available"),
    reservedApplicationId: uuid("reserved_application_id"),
    contractId: uuid("contract_id"),
    version: integer("version").notNull().default(1),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("inventory_units_tenant_id_unique").on(table.tenantId, table.id),
    uniqueIndex("inventory_units_imei_unique").on(table.imei),
    uniqueIndex("inventory_units_tenant_contract_unique")
      .on(table.tenantId, table.contractId)
      .where(sql`${table.contractId} is not null`),
    foreignKey({
      name: "inventory_units_branch_fk",
      columns: [table.tenantId, table.branchId],
      foreignColumns: [branches.tenantId, branches.id],
    }),
    foreignKey({
      name: "inventory_units_catalog_product_fk",
      columns: [table.tenantId, table.catalogProductId],
      foreignColumns: [catalogProducts.tenantId, catalogProducts.id],
    }),
    foreignKey({
      name: "inventory_units_application_fk",
      columns: [table.tenantId, table.reservedApplicationId],
      foreignColumns: [financingApplications.tenantId, financingApplications.id],
    }),
    foreignKey({
      name: "inventory_units_contract_fk",
      columns: [table.tenantId, table.contractId],
      foreignColumns: [financingContracts.tenantId, financingContracts.id],
    }),
    index("inventory_units_branch_status_idx").on(
      table.tenantId,
      table.branchId,
      table.status,
    ),
    index("inventory_units_product_status_idx").on(
      table.tenantId,
      table.catalogProductId,
      table.status,
    ),
    check("inventory_units_imei_valid", sql`${table.imei} ~ '^[0-9]{15}$'`),
    check("inventory_units_version_positive", sql`${table.version} > 0`),
    check(
      "inventory_units_assignment_consistent",
      sql`(
        (${table.status} = 'reserved' and ${table.reservedApplicationId} is not null and ${table.contractId} is null)
        or (${table.status} = 'financed' and ${table.contractId} is not null)
        or (${table.status} not in ('reserved', 'financed') and ${table.reservedApplicationId} is null and ${table.contractId} is null)
      )`,
    ),
  ],
);

export const installments = pgTable(
  "installments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    contractId: uuid("contract_id").notNull(),
    sequence: integer("sequence").notNull(),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    currency: text("currency").notNull().default("XAF"),
    principalDue: bigint("principal_due", { mode: "number" }).notNull(),
    financeChargeDue: bigint("finance_charge_due", {
      mode: "number",
    }).notNull(),
    createdAt,
  },
  (table) => [
    uniqueIndex("installments_tenant_id_unique").on(table.tenantId, table.id),
    uniqueIndex("installments_contract_sequence_unique").on(
      table.tenantId,
      table.contractId,
      table.sequence,
    ),
    foreignKey({
      name: "installments_contract_fk",
      columns: [table.tenantId, table.contractId],
      foreignColumns: [financingContracts.tenantId, financingContracts.id],
    }),
    index("installments_tenant_due_date_idx").on(table.tenantId, table.dueDate),
    check(
      "installments_values_valid",
      sql`${table.sequence} > 0
          and ${table.currency} = 'XAF'
          and ${table.principalDue} >= 0
          and ${table.financeChargeDue} >= 0
          and (${table.principalDue} > 0 or ${table.financeChargeDue} > 0)`,
    ),
  ],
);

export const ledgerAccounts = pgTable(
  "ledger_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    type: ledgerAccountTypeEnum("type").notNull(),
    currency: text("currency").notNull().default("XAF"),
    active: boolean("active").notNull().default(true),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("ledger_accounts_tenant_id_unique").on(table.tenantId, table.id),
    uniqueIndex("ledger_accounts_tenant_code_unique").on(table.tenantId, table.code),
    check("ledger_accounts_currency_xaf", sql`${table.currency} = 'XAF'`),
  ],
);

export const journalEntries = pgTable(
  "journal_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    sourceType: journalSourceEnum("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    kind: journalKindEnum("kind").notNull().default("standard"),
    reversesEntryId: uuid("reverses_entry_id"),
    effectiveAt: timestamp("effective_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    postedAt: timestamp("posted_at", {
      withTimezone: true,
      mode: "string",
    })
      .notNull()
      .defaultNow(),
    postedBy: text("posted_by").notNull(),
    description: text("description").notNull(),
  },
  (table) => [
    uniqueIndex("journal_entries_tenant_id_unique").on(table.tenantId, table.id),
    uniqueIndex("journal_entries_source_unique").on(
      table.tenantId,
      table.sourceType,
      table.sourceId,
      table.kind,
    ),
    foreignKey({
      name: "journal_entries_reversal_fk",
      columns: [table.tenantId, table.reversesEntryId],
      foreignColumns: [table.tenantId, table.id],
    }),
    index("journal_entries_tenant_effective_idx").on(table.tenantId, table.effectiveAt),
    check(
      "journal_entries_reversal_consistent",
      sql`(${table.kind} = 'standard' and ${table.reversesEntryId} is null)
          or (${table.kind} = 'reversal' and ${table.reversesEntryId} is not null)`,
    ),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    customerId: uuid("customer_id").notNull(),
    contractId: uuid("contract_id"),
    currency: text("currency").notNull().default("XAF"),
    amount: bigint("amount", { mode: "number" }).notNull(),
    channel: paymentChannelEnum("channel").notNull(),
    status: paymentStatusEnum("status").notNull().default("initiated"),
    idempotencyKey: text("idempotency_key").notNull(),
    provider: text("provider"),
    externalReference: text("external_reference"),
    initiatedAt: timestamp("initiated_at", {
      withTimezone: true,
      mode: "string",
    })
      .notNull()
      .defaultNow(),
    settledAt: timestamp("settled_at", {
      withTimezone: true,
      mode: "string",
    }),
    failedAt: timestamp("failed_at", {
      withTimezone: true,
      mode: "string",
    }),
    failureCode: text("failure_code"),
    reversedAt: timestamp("reversed_at", {
      withTimezone: true,
      mode: "string",
    }),
    ledgerEntryId: uuid("ledger_entry_id"),
    reversalEntryId: uuid("reversal_entry_id"),
    version: integer("version").notNull().default(1),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("payments_tenant_id_unique").on(table.tenantId, table.id),
    uniqueIndex("payments_tenant_idempotency_unique").on(
      table.tenantId,
      table.idempotencyKey,
    ),
    foreignKey({
      name: "payments_customer_fk",
      columns: [table.tenantId, table.customerId],
      foreignColumns: [customers.tenantId, customers.id],
    }),
    foreignKey({
      name: "payments_contract_fk",
      columns: [table.tenantId, table.contractId],
      foreignColumns: [financingContracts.tenantId, financingContracts.id],
    }),
    foreignKey({
      name: "payments_ledger_entry_fk",
      columns: [table.tenantId, table.ledgerEntryId],
      foreignColumns: [journalEntries.tenantId, journalEntries.id],
    }),
    foreignKey({
      name: "payments_reversal_entry_fk",
      columns: [table.tenantId, table.reversalEntryId],
      foreignColumns: [journalEntries.tenantId, journalEntries.id],
    }),
    index("payments_tenant_status_idx").on(table.tenantId, table.status),
    uniqueIndex("payments_provider_reference_unique")
      .on(table.provider, table.externalReference)
      .where(
        sql`${table.provider} is not null and ${table.externalReference} is not null`,
      ),
    check(
      "payments_values_valid",
      sql`${table.currency} = 'XAF' and ${table.amount} > 0 and ${table.version} > 0`,
    ),
  ],
);

export const feeAssessments = pgTable(
  "fee_assessments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    subjectType: feeSubjectEnum("subject_type").notNull(),
    applicationId: uuid("application_id"),
    contractId: uuid("contract_id"),
    installmentId: uuid("installment_id"),
    paymentId: uuid("payment_id"),
    kind: feeKindEnum("kind").notNull(),
    currency: text("currency").notNull().default("XAF"),
    amount: bigint("amount", { mode: "number" }).notNull(),
    calculation: jsonb("calculation").$type<FeeCalculationSnapshot>().notNull(),
    status: feeStatusEnum("status").notNull().default("assessed"),
    assessedAt: timestamp("assessed_at", {
      withTimezone: true,
      mode: "string",
    })
      .notNull()
      .defaultNow(),
    dueDate: date("due_date", { mode: "string" }),
    ledgerEntryId: uuid("ledger_entry_id").notNull(),
    waivedAt: timestamp("waived_at", {
      withTimezone: true,
      mode: "string",
    }),
    waivedBy: uuid("waived_by").references(() => userProfiles.id),
    waiverReason: text("waiver_reason"),
    waiverEntryId: uuid("waiver_entry_id"),
    reversedAt: timestamp("reversed_at", {
      withTimezone: true,
      mode: "string",
    }),
    reversalEntryId: uuid("reversal_entry_id"),
    createdAt,
  },
  (table) => [
    uniqueIndex("fee_assessments_tenant_id_unique").on(table.tenantId, table.id),
    foreignKey({
      name: "fee_application_fk",
      columns: [table.tenantId, table.applicationId],
      foreignColumns: [financingApplications.tenantId, financingApplications.id],
    }),
    foreignKey({
      name: "fee_contract_fk",
      columns: [table.tenantId, table.contractId],
      foreignColumns: [financingContracts.tenantId, financingContracts.id],
    }),
    foreignKey({
      name: "fee_installment_fk",
      columns: [table.tenantId, table.installmentId],
      foreignColumns: [installments.tenantId, installments.id],
    }),
    foreignKey({
      name: "fee_payment_fk",
      columns: [table.tenantId, table.paymentId],
      foreignColumns: [payments.tenantId, payments.id],
    }),
    foreignKey({
      name: "fee_ledger_entry_fk",
      columns: [table.tenantId, table.ledgerEntryId],
      foreignColumns: [journalEntries.tenantId, journalEntries.id],
    }),
    foreignKey({
      name: "fee_waiver_entry_fk",
      columns: [table.tenantId, table.waiverEntryId],
      foreignColumns: [journalEntries.tenantId, journalEntries.id],
    }),
    foreignKey({
      name: "fee_reversal_entry_fk",
      columns: [table.tenantId, table.reversalEntryId],
      foreignColumns: [journalEntries.tenantId, journalEntries.id],
    }),
    index("fees_tenant_status_idx").on(table.tenantId, table.status),
    check("fees_values_valid", sql`${table.currency} = 'XAF' and ${table.amount} > 0`),
  ],
);

export const paymentAllocations = pgTable(
  "payment_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    paymentId: uuid("payment_id").notNull(),
    targetType: allocationTargetEnum("target_type").notNull(),
    contractId: uuid("contract_id"),
    installmentId: uuid("installment_id"),
    feeAssessmentId: uuid("fee_assessment_id"),
    currency: text("currency").notNull().default("XAF"),
    amount: bigint("amount", { mode: "number" }).notNull(),
    allocatedAt: timestamp("allocated_at", {
      withTimezone: true,
      mode: "string",
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("payment_allocations_tenant_id_unique").on(table.tenantId, table.id),
    foreignKey({
      name: "payment_allocations_payment_fk",
      columns: [table.tenantId, table.paymentId],
      foreignColumns: [payments.tenantId, payments.id],
    }),
    foreignKey({
      name: "payment_allocations_contract_fk",
      columns: [table.tenantId, table.contractId],
      foreignColumns: [financingContracts.tenantId, financingContracts.id],
    }),
    foreignKey({
      name: "payment_allocations_installment_fk",
      columns: [table.tenantId, table.installmentId],
      foreignColumns: [installments.tenantId, installments.id],
    }),
    foreignKey({
      name: "payment_allocations_fee_fk",
      columns: [table.tenantId, table.feeAssessmentId],
      foreignColumns: [feeAssessments.tenantId, feeAssessments.id],
    }),
    index("payment_allocations_payment_idx").on(table.tenantId, table.paymentId),
    check(
      "payment_allocations_values_valid",
      sql`${table.currency} = 'XAF' and ${table.amount} > 0`,
    ),
  ],
);

export const journalLines = pgTable(
  "journal_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    journalEntryId: uuid("journal_entry_id").notNull(),
    accountId: uuid("account_id").notNull(),
    side: journalSideEnum("side").notNull(),
    currency: text("currency").notNull().default("XAF"),
    amount: bigint("amount", { mode: "number" }).notNull(),
    memo: text("memo"),
    customerId: uuid("customer_id"),
    contractId: uuid("contract_id"),
    installmentId: uuid("installment_id"),
    paymentId: uuid("payment_id"),
    feeAssessmentId: uuid("fee_assessment_id"),
  },
  (table) => [
    uniqueIndex("journal_lines_tenant_id_unique").on(table.tenantId, table.id),
    foreignKey({
      name: "journal_lines_entry_fk",
      columns: [table.tenantId, table.journalEntryId],
      foreignColumns: [journalEntries.tenantId, journalEntries.id],
    }),
    foreignKey({
      name: "journal_lines_account_fk",
      columns: [table.tenantId, table.accountId],
      foreignColumns: [ledgerAccounts.tenantId, ledgerAccounts.id],
    }),
    foreignKey({
      name: "journal_lines_customer_fk",
      columns: [table.tenantId, table.customerId],
      foreignColumns: [customers.tenantId, customers.id],
    }),
    foreignKey({
      name: "journal_lines_contract_fk",
      columns: [table.tenantId, table.contractId],
      foreignColumns: [financingContracts.tenantId, financingContracts.id],
    }),
    foreignKey({
      name: "journal_lines_installment_fk",
      columns: [table.tenantId, table.installmentId],
      foreignColumns: [installments.tenantId, installments.id],
    }),
    foreignKey({
      name: "journal_lines_payment_fk",
      columns: [table.tenantId, table.paymentId],
      foreignColumns: [payments.tenantId, payments.id],
    }),
    foreignKey({
      name: "journal_lines_fee_fk",
      columns: [table.tenantId, table.feeAssessmentId],
      foreignColumns: [feeAssessments.tenantId, feeAssessments.id],
    }),
    index("journal_lines_entry_idx").on(table.tenantId, table.journalEntryId),
    check(
      "journal_lines_values_valid",
      sql`${table.currency} = 'XAF' and ${table.amount} > 0`,
    ),
  ],
);

export const idempotencyRecords = pgTable(
  "idempotency_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    operation: text("operation").notNull(),
    key: text("key").notNull(),
    requestHash: text("request_hash").notNull(),
    resourceType: text("resource_type"),
    resourceId: text("resource_id"),
    createdAt,
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
  },
  (table) => [
    uniqueIndex("idempotency_tenant_operation_key_unique").on(
      table.tenantId,
      table.operation,
      table.key,
    ),
    index("idempotency_expires_idx").on(table.expiresAt),
  ],
);

export const paymentProviderEvents = pgTable(
  "payment_provider_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    paymentId: uuid("payment_id"),
    provider: text("provider").notNull(),
    externalEventId: text("external_event_id").notNull(),
    eventType: text("event_type").notNull(),
    payloadHash: text("payload_hash").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    signatureValid: boolean("signature_valid").notNull(),
    status: providerEventStatusEnum("status").notNull().default("received"),
    processingAttempts: integer("processing_attempts").notNull().default(0),
    errorCode: text("error_code"),
    receivedAt: timestamp("received_at", {
      withTimezone: true,
      mode: "string",
    })
      .notNull()
      .defaultNow(),
    processedAt: timestamp("processed_at", {
      withTimezone: true,
      mode: "string",
    }),
  },
  (table) => [
    uniqueIndex("payment_provider_events_external_unique").on(
      table.provider,
      table.externalEventId,
    ),
    uniqueIndex("payment_provider_events_tenant_id_unique").on(
      table.tenantId,
      table.id,
    ),
    foreignKey({
      name: "payment_provider_events_payment_fk",
      columns: [table.tenantId, table.paymentId],
      foreignColumns: [payments.tenantId, payments.id],
    }),
    index("payment_provider_events_tenant_status_idx").on(table.tenantId, table.status),
    check(
      "payment_provider_events_attempts_nonnegative",
      sql`${table.processingAttempts} >= 0`,
    ),
  ],
);

export const reconciliationRuns = pgTable(
  "reconciliation_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    provider: text("provider").notNull(),
    periodStart: timestamp("period_start", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    periodEnd: timestamp("period_end", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    sourceSha256: text("source_sha256").notNull(),
    status: reconciliationRunStatusEnum("status").notNull().default("pending"),
    totalItems: integer("total_items").notNull().default(0),
    matchedItems: integer("matched_items").notNull().default(0),
    exceptionItems: integer("exception_items").notNull().default(0),
    startedBy: uuid("started_by")
      .notNull()
      .references(() => userProfiles.id),
    failureReason: text("failure_reason"),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "string",
    }),
    createdAt,
  },
  (table) => [
    uniqueIndex("reconciliation_runs_tenant_id_unique").on(table.tenantId, table.id),
    uniqueIndex("reconciliation_runs_source_unique").on(
      table.tenantId,
      table.provider,
      table.sourceSha256,
    ),
    index("reconciliation_runs_tenant_created_idx").on(table.tenantId, table.createdAt),
    check(
      "reconciliation_runs_period_valid",
      sql`${table.periodEnd} > ${table.periodStart}`,
    ),
    check(
      "reconciliation_runs_counts_nonnegative",
      sql`${table.totalItems} >= 0 and ${table.matchedItems} >= 0 and ${table.exceptionItems} >= 0`,
    ),
  ],
);

export const reconciliationItems = pgTable(
  "reconciliation_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    runId: uuid("run_id").notNull(),
    paymentId: uuid("payment_id"),
    externalReference: text("external_reference").notNull(),
    internalAmount: bigint("internal_amount", { mode: "number" }),
    providerAmount: bigint("provider_amount", { mode: "number" }),
    internalStatus: text("internal_status"),
    providerStatus: text("provider_status").notNull(),
    status: reconciliationItemStatusEnum("status").notNull(),
    details: jsonb("details")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt,
  },
  (table) => [
    uniqueIndex("reconciliation_items_tenant_id_unique").on(table.tenantId, table.id),
    uniqueIndex("reconciliation_items_run_reference_unique").on(
      table.tenantId,
      table.runId,
      table.externalReference,
    ),
    foreignKey({
      name: "reconciliation_items_run_fk",
      columns: [table.tenantId, table.runId],
      foreignColumns: [reconciliationRuns.tenantId, reconciliationRuns.id],
    }),
    foreignKey({
      name: "reconciliation_items_payment_fk",
      columns: [table.tenantId, table.paymentId],
      foreignColumns: [payments.tenantId, payments.id],
    }),
    index("reconciliation_items_run_status_idx").on(table.runId, table.status),
    check(
      "reconciliation_items_amounts_nonnegative",
      sql`(${table.internalAmount} is null or ${table.internalAmount} >= 0)
          and (${table.providerAmount} is null or ${table.providerAmount} >= 0)`,
    ),
  ],
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    customerId: uuid("customer_id"),
    applicationId: uuid("application_id"),
    category: text("category").notNull(),
    originalFileName: text("original_file_name").notNull(),
    objectKey: text("object_key").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    sha256: text("sha256").notNull(),
    status: documentStatusEnum("status").notNull().default("requested"),
    uploadedAt: timestamp("uploaded_at", {
      withTimezone: true,
      mode: "string",
    }),
    verifiedAt: timestamp("verified_at", {
      withTimezone: true,
      mode: "string",
    }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => userProfiles.id),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("documents_tenant_id_unique").on(table.tenantId, table.id),
    uniqueIndex("documents_object_key_unique").on(table.objectKey),
    foreignKey({
      name: "documents_customer_fk",
      columns: [table.tenantId, table.customerId],
      foreignColumns: [customers.tenantId, customers.id],
    }),
    foreignKey({
      name: "documents_application_fk",
      columns: [table.tenantId, table.applicationId],
      foreignColumns: [financingApplications.tenantId, financingApplications.id],
    }),
    index("documents_tenant_application_idx").on(table.tenantId, table.applicationId),
    check(
      "documents_reference_present",
      sql`${table.customerId} is not null or ${table.applicationId} is not null`,
    ),
    check(
      "documents_metadata_valid",
      sql`${table.sizeBytes} > 0 and ${table.sizeBytes} <= 20971520 and ${table.sha256} ~ '^[a-f0-9]{64}$'`,
    ),
  ],
);

export const kycVerificationSessions = pgTable(
  "kyc_verification_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    applicationId: uuid("application_id").notNull(),
    customerId: uuid("customer_id"),
    provider: text("provider").notNull(),
    providerSessionId: text("provider_session_id").notNull(),
    verificationUrl: text("verification_url"),
    status: kycSessionStatusEnum("status").notNull().default("not_started"),
    decision: jsonb("decision").$type<Record<string, unknown>>(),
    riskScore: integer("risk_score"),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "string",
    }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => userProfiles.id),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("kyc_sessions_tenant_id_unique").on(table.tenantId, table.id),
    uniqueIndex("kyc_sessions_provider_session_unique").on(
      table.provider,
      table.providerSessionId,
    ),
    foreignKey({
      name: "kyc_sessions_application_fk",
      columns: [table.tenantId, table.applicationId],
      foreignColumns: [financingApplications.tenantId, financingApplications.id],
    }),
    foreignKey({
      name: "kyc_sessions_customer_fk",
      columns: [table.tenantId, table.customerId],
      foreignColumns: [customers.tenantId, customers.id],
    }),
    index("kyc_sessions_tenant_application_idx").on(
      table.tenantId,
      table.applicationId,
    ),
    check(
      "kyc_sessions_risk_score_valid",
      sql`${table.riskScore} is null or (${table.riskScore} >= 0 and ${table.riskScore} <= 100)`,
    ),
  ],
);

export const managedDevices = pgTable(
  "managed_devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    contractId: uuid("contract_id").notNull(),
    provider: text("provider").notNull(),
    providerDeviceId: text("provider_device_id").notNull(),
    inventoryUnitId: uuid("inventory_unit_id"),
    imei: text("imei").notNull(),
    serialNumber: text("serial_number"),
    enrollmentTokenHash: text("enrollment_token_hash"),
    enrollmentExpiresAt: timestamp("enrollment_expires_at", {
      withTimezone: true,
      mode: "string",
    }),
    enrollmentConsumedAt: timestamp("enrollment_consumed_at", {
      withTimezone: true,
      mode: "string",
    }),
    credentialHash: text("credential_hash"),
    deviceOwnerAttested: boolean("device_owner_attested").notNull().default(false),
    policyVersion: bigint("policy_version", { mode: "number" }).notNull().default(0),
    status: managedDeviceStatusEnum("status").notNull().default("pending_enrollment"),
    lastSeenAt: timestamp("last_seen_at", {
      withTimezone: true,
      mode: "string",
    }),
    enrolledAt: timestamp("enrolled_at", {
      withTimezone: true,
      mode: "string",
    }),
    releasedAt: timestamp("released_at", {
      withTimezone: true,
      mode: "string",
    }),
    providerState: jsonb("provider_state")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("managed_devices_tenant_id_unique").on(table.tenantId, table.id),
    uniqueIndex("managed_devices_contract_unique").on(table.tenantId, table.contractId),
    uniqueIndex("managed_devices_provider_device_unique").on(
      table.provider,
      table.providerDeviceId,
    ),
    uniqueIndex("managed_devices_tenant_imei_unique").on(table.tenantId, table.imei),
    uniqueIndex("managed_devices_inventory_unit_unique")
      .on(table.tenantId, table.inventoryUnitId)
      .where(sql`${table.inventoryUnitId} is not null`),
    foreignKey({
      name: "managed_devices_inventory_unit_fk",
      columns: [table.tenantId, table.inventoryUnitId],
      foreignColumns: [inventoryUnits.tenantId, inventoryUnits.id],
    }),
    foreignKey({
      name: "managed_devices_contract_fk",
      columns: [table.tenantId, table.contractId],
      foreignColumns: [financingContracts.tenantId, financingContracts.id],
    }),
    index("managed_devices_tenant_status_idx").on(table.tenantId, table.status),
    check("managed_devices_imei_valid", sql`${table.imei} ~ '^[0-9]{15}$'`),
  ],
);

export const mdmCommands = pgTable(
  "mdm_commands",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    managedDeviceId: uuid("managed_device_id").notNull(),
    kind: mdmCommandKindEnum("kind").notNull(),
    status: mdmCommandStatusEnum("status").notNull().default("queued"),
    idempotencyKey: text("idempotency_key").notNull(),
    providerCommandId: text("provider_command_id"),
    reason: text("reason").notNull(),
    requestedBy: uuid("requested_by")
      .notNull()
      .references(() => userProfiles.id),
    sentAt: timestamp("sent_at", {
      withTimezone: true,
      mode: "string",
    }),
    acknowledgedAt: timestamp("acknowledged_at", {
      withTimezone: true,
      mode: "string",
    }),
    failureReason: text("failure_reason"),
    createdAt,
  },
  (table) => [
    uniqueIndex("mdm_commands_tenant_id_unique").on(table.tenantId, table.id),
    uniqueIndex("mdm_commands_tenant_idempotency_unique").on(
      table.tenantId,
      table.idempotencyKey,
    ),
    uniqueIndex("mdm_commands_provider_command_unique")
      .on(table.providerCommandId)
      .where(sql`${table.providerCommandId} is not null`),
    foreignKey({
      name: "mdm_commands_device_fk",
      columns: [table.tenantId, table.managedDeviceId],
      foreignColumns: [managedDevices.tenantId, managedDevices.id],
    }),
    index("mdm_commands_device_created_idx").on(table.managedDeviceId, table.createdAt),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    actorUserId: uuid("actor_user_id").references(() => userProfiles.id),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    requestId: text("request_id"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    details: jsonb("details")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    previousHash: text("previous_hash"),
    eventHash: text("event_hash").notNull().default(""),
    occurredAt: timestamp("occurred_at", {
      withTimezone: true,
      mode: "string",
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("audit_events_tenant_occurred_idx").on(table.tenantId, table.occurredAt),
    index("audit_events_actor_idx").on(table.actorUserId, table.occurredAt),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    branchId: uuid("branch_id").references(() => branches.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => userProfiles.id),
    auditEventId: uuid("audit_event_id")
      .notNull()
      .references(() => auditEvents.id),
    code: text("code").notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    severity: notificationSeverityEnum("severity").notNull().default("info"),
    resourceType: text("resource_type"),
    resourceId: text("resource_id"),
    actionUrl: text("action_url"),
    readAt: timestamp("read_at", { withTimezone: true, mode: "string" }),
    acknowledgedAt: timestamp("acknowledged_at", {
      withTimezone: true,
      mode: "string",
    }),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "string" }),
    soundPlayedAt: timestamp("sound_played_at", {
      withTimezone: true,
      mode: "string",
    }),
    createdAt,
  },
  (table) => [
    uniqueIndex("notifications_event_user_unique").on(table.auditEventId, table.userId),
    index("notifications_user_unread_idx").on(
      table.userId,
      table.readAt,
      table.createdAt,
    ),
    index("notifications_tenant_created_idx").on(table.tenantId, table.createdAt),
  ],
);

export const notificationPreferences = pgTable("notification_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => userProfiles.id),
  soundEnabled: boolean("sound_enabled").notNull().default(false),
  soundMinimumSeverity: notificationSeverityEnum("sound_minimum_severity")
    .notNull()
    .default("warning"),
  emailEnabled: boolean("email_enabled").notNull().default(false),
  emailMinimumSeverity: notificationSeverityEnum("email_minimum_severity")
    .notNull()
    .default("critical"),
  quietHoursStart: text("quiet_hours_start"),
  quietHoursEnd: text("quiet_hours_end"),
  updatedAt,
});

export const notificationEmailOutbox = pgTable(
  "notification_email_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    notificationId: uuid("notification_id")
      .notNull()
      .references(() => notifications.id),
    recipientEmail: text("recipient_email").notNull(),
    status: notificationEmailStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", {
      withTimezone: true,
      mode: "string",
    })
      .notNull()
      .defaultNow(),
    lastError: text("last_error"),
    sentAt: timestamp("sent_at", { withTimezone: true, mode: "string" }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("notification_email_outbox_notification_unique").on(
      table.notificationId,
    ),
    index("notification_email_outbox_pending_idx").on(
      table.status,
      table.nextAttemptAt,
    ),
    check("notification_email_outbox_attempts_valid", sql`${table.attempts} >= 0`),
  ],
);
