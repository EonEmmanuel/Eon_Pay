import "dotenv/config";
import { Pool } from "pg";
import { postgresPoolConfig } from "./connection.js";

interface PlatformPrincipalRow {
  userId: string;
}

interface PlatformAnalyticsRow {
  data: {
    summary?: {
      overdueContracts?: unknown;
      writtenOffContracts?: unknown;
      writtenOffBalance?: unknown;
    };
  };
}

const migrationUrl = process.env["DATABASE_MIGRATION_URL"];
if (migrationUrl === undefined || migrationUrl.trim() === "") {
  throw new Error("DATABASE_MIGRATION_URL is required.");
}

const pool = new Pool(
  postgresPoolConfig(migrationUrl, {
    max: 1,
    application_name: "platform-analytics-verifier",
  }),
);

const client = await pool.connect();
try {
  await client.query("begin");
  const principal = await client.query<PlatformPrincipalRow>(`
    select assignment.user_id as "userId"
    from public.platform_role_assignments assignment
    join public.roles role on role.id = assignment.role_id
    join public.role_permissions permission on permission.role_id = role.id
    join public.user_profiles profile on profile.id = assignment.user_id
    where role.scope = 'platform'
      and role.tenant_id is null
      and permission.permission_code = 'platform.tenants.read'
      and not profile.disabled
    limit 1
  `);
  const userId = principal.rows[0]?.userId;
  if (userId === undefined) {
    throw new Error("No active platform analytics principal exists.");
  }

  await client.query("select set_config('app.user_id', $1, true)", [userId]);
  const analytics = await client.query<PlatformAnalyticsRow>(
    "select public.app_platform_analytics() as data",
  );
  const summary = analytics.rows[0]?.data.summary;
  if (
    typeof summary?.overdueContracts !== "number" ||
    typeof summary.writtenOffContracts !== "number" ||
    typeof summary.writtenOffBalance !== "number"
  ) {
    throw new Error("Platform analytics returned an invalid portfolio summary.");
  }

  console.log(
    `analytics: overdue=${summary.overdueContracts}; written-off=${summary.writtenOffContracts}; written-off balance=${summary.writtenOffBalance}.`,
  );
  await client.query("rollback");
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  client.release();
  await pool.end();
}
