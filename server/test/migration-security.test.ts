import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const migrationPath = resolve(currentDirectory, "../drizzle/0001_security_and_rls.sql");
const migration = await readFile(migrationPath, "utf8");
const structuralMigration = await readFile(
  resolve(currentDirectory, "../drizzle/0000_tan_magdalene.sql"),
  "utf8",
);
const operationalStructure = await readFile(
  resolve(currentDirectory, "../drizzle/0002_shallow_killmonger.sql"),
  "utf8",
);
const operationalIntegrity = await readFile(
  resolve(currentDirectory, "../drizzle/0003_operational_integrity.sql"),
  "utf8",
);
const invitationSecurity = await readFile(
  resolve(currentDirectory, "../drizzle/0004_pretty_miek.sql"),
  "utf8",
);
const contractAnalyticsSemantics = await readFile(
  resolve(currentDirectory, "../drizzle/0006_contract_analytics_semantics.sql"),
  "utf8",
);
const platformAdminSecurity = await readFile(
  resolve(currentDirectory, "../drizzle/0007_platform_admin_rbac.sql"),
  "utf8",
);
const branchScopedSecurity = await readFile(
  resolve(currentDirectory, "../drizzle/0008_pink_marvel_apes.sql"),
  "utf8",
);
const invitationAcceptanceCorrection = await readFile(
  resolve(currentDirectory, "../drizzle/0009_fix_tenant_invitation_acceptance.sql"),
  "utf8",
);
const retailerOnboardingStates = await readFile(
  resolve(currentDirectory, "../drizzle/0010_retailer_onboarding_states.sql"),
  "utf8",
);
const retailerBusinessProfile = await readFile(
  resolve(currentDirectory, "../drizzle/0011_retailer_business_profile.sql"),
  "utf8",
);
const retailerKybWorkflow = await readFile(
  resolve(currentDirectory, "../drizzle/0012_retailer_kyb_workflow.sql"),
  "utf8",
);
const notificationSecurity = await readFile(
  resolve(currentDirectory, "../drizzle/0013_giant_sentry.sql"),
  "utf8",
);
const notificationTenantTypeCorrection = await readFile(
  resolve(
    currentDirectory,
    "../drizzle/0016_fix_platform_notification_tenant_uuid.sql",
  ),
  "utf8",
);
const retailerKybDecisionNotifications = await readFile(
  resolve(
    currentDirectory,
    "../drizzle/0017_notify_retailers_of_platform_kyb_decisions.sql",
  ),
  "utf8",
);
const splitInventoryPermissions = await readFile(
  resolve(currentDirectory, "../drizzle/0018_split_inventory_permissions.sql"),
  "utf8",
);
const crossEnumStatusTransitionCorrection = await readFile(
  resolve(currentDirectory, "../drizzle/0019_fix_cross_enum_status_transition.sql"),
  "utf8",
);

const protectedTables = [
  "user_profiles",
  "tenants",
  "branches",
  "customers",
  "permissions",
  "roles",
  "role_permissions",
  "tenant_memberships",
  "tenant_member_roles",
  "platform_role_assignments",
  "financing_applications",
  "financing_contracts",
  "installments",
  "payments",
  "payment_allocations",
  "fee_assessments",
  "ledger_accounts",
  "journal_entries",
  "journal_lines",
  "idempotency_records",
  "audit_events",
] as const;

const operationalTables = [
  "payment_provider_events",
  "reconciliation_runs",
  "reconciliation_items",
  "documents",
  "kyc_verification_sessions",
  "managed_devices",
  "mdm_commands",
] as const;

function assertIndexPrecedesForeignKey(
  sql: string,
  indexName: string,
  foreignKeyName: string,
): void {
  const indexPosition = sql.indexOf(`CREATE UNIQUE INDEX "${indexName}"`);
  const foreignKeyPosition = sql.indexOf(`ADD CONSTRAINT "${foreignKeyName}"`);

  assert.notEqual(indexPosition, -1, `Missing unique index ${indexName}.`);
  assert.notEqual(foreignKeyPosition, -1, `Missing foreign key ${foreignKeyName}.`);
  assert.ok(
    indexPosition < foreignKeyPosition,
    `${indexName} must be created before ${foreignKeyName}.`,
  );
}

test("every application table enables and forces PostgreSQL RLS", () => {
  for (const table of protectedTables) {
    assert.match(
      migration,
      new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`),
    );
    assert.match(
      migration,
      new RegExp(`ALTER TABLE public\\.${table} FORCE ROW LEVEL SECURITY`),
    );
  }
  for (const table of operationalTables) {
    assert.match(
      operationalIntegrity,
      new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`),
    );
    assert.match(
      operationalIntegrity,
      new RegExp(`ALTER TABLE public\\.${table} FORCE ROW LEVEL SECURITY`),
    );
  }
});

test("notifications are recipient-isolated, branch-targeted, and delivered from an outbox", () => {
  for (const table of [
    "notifications",
    "notification_preferences",
    "notification_email_outbox",
  ]) {
    assert.match(
      notificationSecurity,
      new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`),
    );
    assert.match(
      notificationSecurity,
      new RegExp(`ALTER TABLE public\\.${table} FORCE ROW LEVEL SECURITY`),
    );
  }
  assert.match(notificationSecurity, /user_id = public\.app_user_id\(\)/);
  assert.match(notificationSecurity, /tenant_membership_branches/);
  assert.match(
    notificationSecurity,
    /FOR UPDATE OF outbox SKIP LOCKED|notification_email_outbox/,
  );
  assert.doesNotMatch(notificationSecurity, /CREATE POLICY[\s\S]*?FOR DELETE/i);
  assert.match(notificationTenantTypeCorrection, /NULL::uuid, assignment\.user_id/);
  assert.match(
    notificationTenantTypeCorrection,
    /REVOKE ALL ON FUNCTION public\.app_notify_from_audit_event\(\) FROM PUBLIC/,
  );
  assert.match(
    retailerKybDecisionNotifications,
    /app_notify_retailer_from_platform_kyb/,
  );
  assert.match(
    retailerKybDecisionNotifications,
    /role_permission\.permission_code = 'tenant\.manage'/,
  );
  assert.match(retailerKybDecisionNotifications, /platform\.kyb\.request_resubmission/);
  assert.match(retailerKybDecisionNotifications, /'\/business-profile'/);
});

test("tenant invitations are RLS-protected and accepted atomically", () => {
  assert.match(
    invitationSecurity,
    /ALTER TABLE public\.tenant_invitations ENABLE ROW LEVEL SECURITY/,
  );
  assert.match(
    invitationSecurity,
    /ALTER TABLE public\.tenant_invitations FORCE ROW LEVEL SECURITY/,
  );
  assert.match(invitationSecurity, /app_has_pending_tenant_invitation/);
  assert.match(invitationSecurity, /app_accept_tenant_invitation/);
  assert.match(invitationSecurity, /membership\.invitation_accepted/);
  assert.doesNotMatch(invitationSecurity, /CREATE POLICY[\s\S]*?FOR DELETE/i);
  assert.match(invitationAcceptanceCorrection, /#variable_conflict use_column/);
});

test("retailer onboarding profiles are isolated and advance accepted owners safely", () => {
  assert.match(retailerOnboardingStates, /business_profile_required/);
  assert.match(retailerOnboardingStates, /kyb_required/);
  assert.match(
    retailerBusinessProfile,
    /ALTER TABLE public\.tenant_business_profiles ENABLE ROW LEVEL SECURITY/,
  );
  assert.match(
    retailerBusinessProfile,
    /ALTER TABLE public\.tenant_business_profiles FORCE ROW LEVEL SECURITY/,
  );
  assert.match(retailerBusinessProfile, /app_has_permission\('tenant\.manage'\)/);
  assert.match(retailerBusinessProfile, /updated_by = public\.app_user_id\(\)/);
  assert.match(retailerBusinessProfile, /advance_retailer_owner_onboarding/);
  assert.match(
    retailerBusinessProfile,
    /onboarding_status = 'business_profile_required'/,
  );
  assert.doesNotMatch(retailerBusinessProfile, /CREATE POLICY[\s\S]*?FOR DELETE/i);
});

test("retailer KYB cases use dedicated RBAC, forced RLS, and provider tenant resolution", () => {
  assert.match(
    retailerKybWorkflow,
    /ALTER TABLE public\.tenant_kyb_cases ENABLE ROW LEVEL SECURITY/,
  );
  assert.match(
    retailerKybWorkflow,
    /ALTER TABLE public\.tenant_kyb_cases FORCE ROW LEVEL SECURITY/,
  );
  assert.match(retailerKybWorkflow, /platform\.kyb\.read/);
  assert.match(retailerKybWorkflow, /platform\.kyb\.manage/);
  assert.match(retailerKybWorkflow, /WHEN 'kyb' THEN/);
  assert.match(retailerKybWorkflow, /provider_session_id = provider_reference/);
  assert.match(
    retailerKybWorkflow,
    /GRANT UPDATE \(onboarding_status, updated_at\) ON public\.tenants TO app_provider/,
  );
  assert.doesNotMatch(retailerKybWorkflow, /CREATE POLICY[\s\S]*?FOR DELETE/i);
});

test("runtime role cannot delete rows and receives no bypass role", () => {
  assert.match(migration, /CREATE ROLE app_runtime NOLOGIN NOINHERIT/);
  assert.match(migration, /REVOKE DELETE, TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES/);
  assert.doesNotMatch(migration, /app_runtime[^;\n]*BYPASSRLS/i);
});

test("tenant context, membership, permissions, and immutable journals are enforced", () => {
  assert.match(migration, /current_setting\('app\.tenant_id', true\)/);
  assert.match(migration, /current_setting\('app\.user_id', true\)/);
  assert.match(migration, /app_is_active_member/);
  assert.match(migration, /app_has_permission/);
  assert.match(migration, /app_owns_customer/);
  assert.match(migration, /self\.contracts\.read/);
  assert.match(migration, /journal_entries_are_immutable/);
  assert.match(migration, /journal_entry_balance_on_lines/);
  assert.match(migration, /prevent_tenant_reassignment/);
  assert.match(migration, /validate_domain_transition/);
});

test("business tables have no DELETE policy", () => {
  assert.doesNotMatch(migration, /CREATE POLICY[\s\S]*?FOR DELETE/i);
  assert.doesNotMatch(operationalIntegrity, /CREATE POLICY[\s\S]*?FOR DELETE/i);
});

test("provider evidence, reconciliation rows, and the audit hash chain are immutable", () => {
  assert.match(operationalIntegrity, /payment_provider_event_evidence_immutable/);
  assert.match(operationalIntegrity, /reconciliation_items_are_immutable/);
  assert.match(operationalIntegrity, /audit_events_are_immutable/);
  assert.match(operationalIntegrity, /audit_events_set_hash/);
  assert.match(operationalIntegrity, /hash_audit_event/);
  assert.match(operationalIntegrity, /app_verify_audit_chain/);
});

test("provider ingestion uses a narrow database role and database-resolved tenant", () => {
  assert.match(operationalIntegrity, /CREATE ROLE app_provider NOLOGIN NOINHERIT/);
  assert.match(operationalIntegrity, /app_resolve_provider_tenant/);
  assert.match(
    operationalIntegrity,
    /REVOKE ALL ON ALL TABLES IN SCHEMA public FROM app_provider/,
  );
  assert.doesNotMatch(operationalIntegrity, /GRANT DELETE[^;]*app_provider/i);
});

test("allocation totals and cross-entity ownership are database enforced", () => {
  assert.match(operationalIntegrity, /assert_payment_allocation_integrity/);
  assert.match(operationalIntegrity, /payment_allocation_integrity_on_allocation/);
  assert.match(operationalIntegrity, /payment_allocation_integrity_on_payment/);
  assert.match(operationalIntegrity, /validate_cross_entity_integrity/);
  assert.match(operationalIntegrity, /pg_advisory_xact_lock/);
});

test("composite foreign keys are created after their supporting unique indexes", () => {
  for (const [indexName, foreignKeyName] of [
    ["applications_tenant_id_unique", "fee_application_fk"],
    ["contracts_tenant_id_unique", "fee_contract_fk"],
    ["installments_tenant_id_unique", "fee_installment_fk"],
    ["payments_tenant_id_unique", "fee_payment_fk"],
    ["journal_entries_tenant_id_unique", "fee_ledger_entry_fk"],
    ["branches_tenant_id_unique", "applications_branch_fk"],
    ["customers_tenant_id_unique", "applications_customer_fk"],
    ["ledger_accounts_tenant_id_unique", "journal_lines_account_fk"],
    ["fee_assessments_tenant_id_unique", "journal_lines_fee_fk"],
    ["tenant_memberships_tenant_id_unique", "tenant_member_roles_membership_fk"],
  ] as const) {
    assertIndexPrecedesForeignKey(structuralMigration, indexName, foreignKeyName);
  }

  assertIndexPrecedesForeignKey(
    operationalStructure,
    "managed_devices_tenant_id_unique",
    "mdm_commands_device_fk",
  );
  assertIndexPrecedesForeignKey(
    operationalStructure,
    "reconciliation_runs_tenant_id_unique",
    "reconciliation_items_run_fk",
  );
});

test("platform analytics preserve servicing and write-off semantics", () => {
  assert.match(
    contractAnalyticsSemantics,
    /contract\.status IN \('active', 'past_due', 'suspended'\)/,
  );
  assert.match(contractAnalyticsSemantics, /contract\.status = 'past_due'/);
  assert.match(contractAnalyticsSemantics, /'writtenOffContracts'/);
  assert.match(contractAnalyticsSemantics, /'writtenOffBalance'/);
  assert.doesNotMatch(
    contractAnalyticsSemantics,
    /'delinquent'|'defaulted'|'repossessed'/,
  );
  assert.match(
    contractAnalyticsSemantics,
    /REVOKE ALL ON FUNCTION public\.app_platform_analytics\(\) FROM PUBLIC/,
  );
  assert.match(
    contractAnalyticsSemantics,
    /GRANT EXECUTE ON FUNCTION public\.app_platform_analytics\(\) TO app_runtime/,
  );
});

test("platform administration separates roles and protects staff access", () => {
  assert.match(
    platformAdminSecurity,
    /ALTER TABLE public\.platform_invitations ENABLE ROW LEVEL SECURITY/,
  );
  assert.match(
    platformAdminSecurity,
    /ALTER TABLE public\.platform_invitations FORCE ROW LEVEL SECURITY/,
  );
  assert.match(platformAdminSecurity, /platform_compliance/);
  assert.match(platformAdminSecurity, /platform_finance/);
  assert.match(platformAdminSecurity, /platform_support/);
  assert.match(platformAdminSecurity, /platform_auditor/);
  assert.match(platformAdminSecurity, /platform\.owners\.manage/);
  assert.match(platformAdminSecurity, /app_accept_platform_invitation/);
  assert.match(platformAdminSecurity, /app_assign_platform_role/);
  assert.match(platformAdminSecurity, /app_revoke_platform_role/);
  assert.match(platformAdminSecurity, /app_set_platform_user_disabled/);
  assert.match(platformAdminSecurity, /platform-owner-continuity/);
  assert.match(platformAdminSecurity, /last active platform owner cannot be/);
  assert.match(platformAdminSecurity, /Self-service role changes are not permitted/);
  assert.match(platformAdminSecurity, /app_platform_mfa_required/);
  assert.match(platformAdminSecurity, /app_verify_platform_audit_chain/);
  assert.doesNotMatch(platformAdminSecurity, /CREATE POLICY[\s\S]*?FOR DELETE/i);
});
test("retailer staff access is branch-scoped and owner continuity is protected", () => {
  assert.match(branchScopedSecurity, /tenant_membership_branches/);
  assert.match(branchScopedSecurity, /tenant_invitation_branches/);
  assert.match(branchScopedSecurity, /customers_branch_fk/);
  assert.match(branchScopedSecurity, /app_can_access_branch/);
  assert.match(branchScopedSecurity, /app_can_access_customer/);
  assert.match(branchScopedSecurity, /app_can_access_application/);
  assert.match(branchScopedSecurity, /app_can_access_contract/);
  assert.match(branchScopedSecurity, /app_can_access_payment/);
  assert.match(branchScopedSecurity, /app_set_tenant_membership_branch_access/);
  assert.match(branchScopedSecurity, /app_assign_tenant_role/);
  assert.match(branchScopedSecurity, /app_revoke_tenant_role/);
  assert.match(branchScopedSecurity, /app_set_tenant_membership_status/);
  assert.match(branchScopedSecurity, /tenant-owner-continuity/);
  assert.match(branchScopedSecurity, /final active retailer owner cannot be/);
  assert.match(branchScopedSecurity, /Self access-state changes are prohibited/);
  assert.match(
    branchScopedSecurity,
    /Branch managers and cashiers must be branch-restricted/,
  );
  assert.match(branchScopedSecurity, /applications_self_insert/);
  assert.match(branchScopedSecurity, /branch\.active/);
  assert.doesNotMatch(branchScopedSecurity, /CREATE POLICY[\s\S]*?FOR DELETE/i);
});

test("branch scope mutation functions are not publicly executable", () => {
  for (const signature of [
    "app_set_tenant_membership_branch_access\\(uuid, boolean, uuid\\[\\]\\)",
    "app_assign_tenant_role\\(uuid, uuid\\)",
    "app_revoke_tenant_role\\(uuid, uuid\\)",
    "app_set_tenant_membership_status\\(uuid, public\\.membership_status\\)",
  ]) {
    assert.match(
      branchScopedSecurity,
      new RegExp(`REVOKE ALL ON FUNCTION public\\.${signature} FROM PUBLIC`),
    );
  }
});
test("catalog administration is separated from branch stock management", () => {
  assert.match(splitInventoryPermissions, /inventory\.catalog\.manage/);
  assert.match(splitInventoryPermissions, /inventory\.stock\.manage/);
  assert.match(
    splitInventoryPermissions,
    /role\.key IN \('tenant_owner', 'tenant_admin'\)/,
  );
  assert.match(splitInventoryPermissions, /role\.key = 'branch_manager'/);
  assert.match(
    splitInventoryPermissions,
    /app_can_access_branch\(branch_id, tenant_id\)/,
  );
  assert.match(
    splitInventoryPermissions,
    /assignment\.permission_code = 'inventory\.manage'/,
  );
});
test("shared transition trigger compares status values as text", () => {
  assert.match(crossEnumStatusTransitionCorrection, /OLD\.status::text/);
  assert.match(crossEnumStatusTransitionCorrection, /NEW\.status::text/);
  assert.match(
    crossEnumStatusTransitionCorrection,
    /WHEN 'financing_applications' THEN CASE old_status/,
  );
  assert.match(
    crossEnumStatusTransitionCorrection,
    /WHEN 'financing_contracts' THEN CASE old_status/,
  );
  assert.doesNotMatch(
    crossEnumStatusTransitionCorrection,
    /CASE OLD\.status|NEW\.status IN/,
  );
});
test("migrations use descriptive comments instead of breakpoint markers", () => {
  for (const sql of [
    structuralMigration,
    migration,
    operationalStructure,
    operationalIntegrity,
    invitationSecurity,
    contractAnalyticsSemantics,
    platformAdminSecurity,
  ]) {
    assert.doesNotMatch(sql, /statement-breakpoint/);
  }
  for (const sql of [migration, operationalIntegrity]) {
    assert.match(
      sql,
      /End of the preceding independently reviewable database operation/,
    );
  }
});
