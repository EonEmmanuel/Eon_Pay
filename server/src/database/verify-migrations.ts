import "dotenv/config";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { Pool } from "pg";
import { postgresPoolConfig } from "./connection.js";

interface VerificationResult {
  appliedMigrations: number;
  protectedTables: number;
  runtimeRoleExists: boolean;
  providerRoleExists: boolean;
  auditChainFunctionExists: boolean;
  platformAuditFunctionExists: boolean;
  platformAccessFunctionsExist: boolean;
  branchAccessFunctionsExist: boolean;
  platformRolesAreDistinct: boolean;
  platformAnalyticsAreCanonical: boolean;
  retailerOnboardingIsSecure: boolean;
  retailerKybControlsExist: boolean;
  notificationControlsExist: boolean;
  inventoryPermissionsAreSeparated: boolean;
  domainTransitionsAreCrossEnumSafe: boolean;
}

interface MigrationJournal {
  entries: unknown[];
}

const protectedTables = [
  "audit_events",
  "branches",
  "catalog_products",
  "customers",
  "documents",
  "fee_assessments",
  "financing_applications",
  "financing_contracts",
  "idempotency_records",
  "installments",
  "inventory_units",
  "journal_entries",
  "journal_lines",
  "kyc_verification_sessions",
  "ledger_accounts",
  "managed_devices",
  "mdm_commands",
  "notifications",
  "notification_preferences",
  "notification_email_outbox",
  "payment_allocations",
  "payment_provider_events",
  "payments",
  "permissions",
  "platform_invitations",
  "platform_role_assignments",
  "reconciliation_items",
  "reconciliation_runs",
  "role_permissions",
  "roles",
  "tenant_invitation_branches",
  "tenant_invitations",
  "tenant_member_roles",
  "tenant_membership_branches",
  "tenant_memberships",
  "tenant_business_profiles",
  "tenant_kyb_cases",
  "tenants",
  "user_profiles",
] as const;

const migrationUrl = process.env["DATABASE_MIGRATION_URL"];
if (migrationUrl === undefined || migrationUrl.trim() === "") {
  throw new Error("DATABASE_MIGRATION_URL is required.");
}

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const journalPath = resolve(currentDirectory, "../../drizzle/meta/_journal.json");
const journal = JSON.parse(await readFile(journalPath, "utf8")) as MigrationJournal;

const pool = new Pool(
  postgresPoolConfig(migrationUrl, {
    max: 1,
    application_name: "investor-ready-migration-verifier",
    connectionTimeoutMillis: 10_000,
  }),
);

try {
  const result = await pool.query<VerificationResult>(
    `
      with expected_tables(table_name) as (
        select unnest($1::text[])
      )
      select
        (
          select count(*)::integer
          from drizzle.__drizzle_migrations
        ) as "appliedMigrations",
        (
          select count(*)::integer
          from expected_tables expected
          join pg_namespace namespace
            on namespace.nspname = 'public'
          join pg_class relation
            on relation.relnamespace = namespace.oid
           and relation.relname = expected.table_name
           and relation.relkind = 'r'
           and relation.relrowsecurity
           and relation.relforcerowsecurity
        ) as "protectedTables",
        exists(
          select 1 from pg_roles where rolname = 'app_runtime'
        ) as "runtimeRoleExists",
        exists(
          select 1 from pg_roles where rolname = 'app_provider'
        ) as "providerRoleExists",
        to_regprocedure('public.app_verify_audit_chain(uuid)') is not null
          as "auditChainFunctionExists",
        to_regprocedure('public.app_verify_platform_audit_chain()') is not null
          as "platformAuditFunctionExists",
        (
          to_regprocedure('public.app_accept_platform_invitation(uuid,text,text,text)') is not null
          and to_regprocedure('public.app_assign_platform_role(uuid,uuid,text,text,text)') is not null
          and to_regprocedure('public.app_revoke_platform_role(uuid,uuid,text,text,text)') is not null
          and to_regprocedure('public.app_set_platform_user_disabled(uuid,boolean,text,text,text)') is not null
          and to_regprocedure('public.app_platform_mfa_required()') is not null
        ) as "platformAccessFunctionsExist",
        (
          to_regprocedure('public.app_has_all_branch_access(uuid)') is not null
          and to_regprocedure('public.app_can_access_branch(uuid,uuid)') is not null
          and to_regprocedure('public.app_can_access_customer(uuid,uuid)') is not null
          and to_regprocedure('public.app_can_access_application(uuid,uuid)') is not null
          and to_regprocedure('public.app_can_access_contract(uuid,uuid)') is not null
          and to_regprocedure('public.app_can_access_payment(uuid,uuid)') is not null
          and to_regprocedure('public.app_set_tenant_membership_branch_access(uuid,boolean,uuid[])') is not null
          and to_regprocedure('public.app_assign_tenant_role(uuid,uuid)') is not null
          and to_regprocedure('public.app_revoke_tenant_role(uuid,uuid)') is not null
          and to_regprocedure('public.app_set_tenant_membership_status(uuid,public.membership_status)') is not null
        ) as "branchAccessFunctionsExist",
        (
          to_regprocedure('public.advance_retailer_owner_onboarding()') is not null
          and exists (
            select 1
            from pg_trigger trigger
            join pg_class relation on relation.oid = trigger.tgrelid
            join pg_namespace namespace on namespace.oid = relation.relnamespace
            where namespace.nspname = 'public'
              and relation.relname = 'tenant_invitations'
              and trigger.tgname = 'tenant_invitation_advance_owner_onboarding'
              and not trigger.tgisinternal
          )
        ) as "retailerOnboardingIsSecure",
        (
          exists (select 1 from public.permissions where code = 'platform.kyb.read')
          and exists (select 1 from public.permissions where code = 'platform.kyb.manage')
          and exists (
            select 1
            from public.role_permissions assignment
            join public.roles role on role.id = assignment.role_id
            where role.key = 'platform_compliance'
              and assignment.permission_code = 'platform.kyb.manage'
          )
          and position(
            'WHEN ''kyb'' THEN'
            in pg_get_functiondef('public.app_resolve_provider_tenant(text,text,text)'::regprocedure)
          ) > 0
        ) as "retailerKybControlsExist",
        (
          exists (select 1 from pg_roles where rolname = 'app_notification_worker')
          and not pg_has_role('app_runtime', 'app_notification_worker', 'member')
          and to_regprocedure('public.app_notify_from_audit_event()') is not null
          and position(
            'NULL::uuid, assignment.user_id'
            in pg_get_functiondef('public.app_notify_from_audit_event()'::regprocedure)
          ) > 0
          and to_regprocedure('public.app_queue_notification_email()') is not null
          and to_regprocedure('public.app_notify_retailer_from_platform_kyb()') is not null
          and exists (
            select 1
            from pg_trigger trigger
            join pg_class relation on relation.oid = trigger.tgrelid
            join pg_namespace namespace on namespace.oid = relation.relnamespace
            where namespace.nspname = 'public'
              and relation.relname = 'audit_events'
              and trigger.tgname = 'audit_events_create_notifications'
              and not trigger.tgisinternal
          )
          and exists (
            select 1
            from pg_trigger trigger
            join pg_class relation on relation.oid = trigger.tgrelid
            join pg_namespace namespace on namespace.oid = relation.relnamespace
            where namespace.nspname = 'public'
              and relation.relname = 'audit_events'
              and trigger.tgname = 'audit_events_notify_retailer_kyb_decision'
              and not trigger.tgisinternal
          )
        ) as "notificationControlsExist",
        (
          exists (
            select 1
            from public.role_permissions assignment
            join public.roles role on role.id = assignment.role_id
            where role.scope = 'tenant'
              and role.key = 'branch_manager'
              and assignment.permission_code = 'inventory.stock.manage'
          )
          and not exists (
            select 1
            from public.role_permissions assignment
            join public.roles role on role.id = assignment.role_id
            where role.scope = 'tenant'
              and role.key = 'branch_manager'
              and assignment.permission_code in (
                'inventory.catalog.manage',
                'inventory.manage'
              )
          )
        ) as "inventoryPermissionsAreSeparated",
        (
          position(
            'old_status := OLD.status::text'
            in pg_get_functiondef('public.validate_domain_transition()'::regprocedure)
          ) > 0
          and position(
            'new_status := NEW.status::text'
            in pg_get_functiondef('public.validate_domain_transition()'::regprocedure)
          ) > 0
        ) as "domainTransitionsAreCrossEnumSafe",
        (
          exists (
            select 1
            from public.role_permissions assignment
            join public.roles role on role.id = assignment.role_id
            where role.key = 'platform_owner'
              and assignment.permission_code = 'platform.owners.manage'
          )
          and not exists (
            select 1
            from public.role_permissions assignment
            join public.roles role on role.id = assignment.role_id
            where role.key = 'platform_admin'
              and assignment.permission_code = 'platform.owners.manage'
          )
          and (
            select count(*)
            from public.roles role
            where role.scope = 'platform'
          ) >= 6
        ) as "platformRolesAreDistinct",
        (
          select
            position('delinquent' in pg_get_functiondef(procedure.oid)) = 0
            and position('defaulted' in pg_get_functiondef(procedure.oid)) = 0
            and position('repossessed' in pg_get_functiondef(procedure.oid)) = 0
            and position('writtenOffContracts' in pg_get_functiondef(procedure.oid)) > 0
            and position('writtenOffBalance' in pg_get_functiondef(procedure.oid)) > 0
          from pg_proc procedure
          join pg_namespace namespace on namespace.oid = procedure.pronamespace
          where namespace.nspname = 'public'
            and procedure.proname = 'app_platform_analytics'
            and procedure.pronargs = 0
        ) as "platformAnalyticsAreCanonical"
    `,
    [protectedTables],
  );
  const verification = result.rows[0];

  if (verification === undefined) {
    throw new Error("Migration verification returned no diagnostic row.");
  }
  if (verification.appliedMigrations !== journal.entries.length) {
    throw new Error(
      `Expected ${journal.entries.length} applied migrations but found ${verification.appliedMigrations}.`,
    );
  }
  if (verification.protectedTables !== protectedTables.length) {
    throw new Error(
      `Expected ${protectedTables.length} tables with forced RLS but found ${verification.protectedTables}.`,
    );
  }
  if (!verification.runtimeRoleExists || !verification.providerRoleExists) {
    throw new Error("Expected application database roles are missing.");
  }
  if (!verification.auditChainFunctionExists) {
    throw new Error("The audit-chain verification function is missing.");
  }
  if (!verification.platformAuditFunctionExists) {
    throw new Error("The platform audit-chain verification function is missing.");
  }
  if (!verification.platformAccessFunctionsExist) {
    throw new Error(
      "Platform invitation, role, lockout, or MFA functions are missing.",
    );
  }
  if (!verification.branchAccessFunctionsExist) {
    throw new Error(
      "Branch-scoped customer, finance, invitation, and staff mutation functions are missing.",
    );
  }
  if (!verification.retailerOnboardingIsSecure) {
    throw new Error(
      "Retailer business-profile isolation or onboarding transition controls are missing.",
    );
  }
  if (!verification.retailerKybControlsExist) {
    throw new Error(
      "Retailer KYB permissions, compliance grants, or provider resolution are missing.",
    );
  }
  if (!verification.notificationControlsExist) {
    throw new Error(
      "Notification isolation, audit projection, or email-outbox controls are missing.",
    );
  }
  if (!verification.inventoryPermissionsAreSeparated) {
    throw new Error(
      "Catalog administration and branch stock permissions are not separated.",
    );
  }
  if (!verification.domainTransitionsAreCrossEnumSafe) {
    throw new Error(
      "The shared domain-transition trigger can compare incompatible enum types.",
    );
  }
  if (!verification.platformRolesAreDistinct) {
    throw new Error("Platform owner and operations roles are not distinctly scoped.");
  }
  if (!verification.platformAnalyticsAreCanonical) {
    throw new Error(
      "Platform analytics do not use the canonical servicing and write-off semantics.",
    );
  }

  console.log(
    `database: ${verification.appliedMigrations} migrations applied; ${verification.protectedTables} application tables enforce RLS; security roles, MFA enforcement, branch isolation, retailer KYB, notifications, owner continuity, and audit-chain verification are present.`,
  );
} finally {
  await pool.end();
}
