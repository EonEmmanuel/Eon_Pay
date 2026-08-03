import "dotenv/config";
import { Pool } from "pg";
import { validateEnvironment } from "../config/environment.js";
import { postgresPoolConfig } from "./connection.js";

interface ConnectionDetails {
  currentUser: string;
  currentDatabase: string;
  serverAddress: string | null;
  sslEnabled: boolean;
  isSuperuser: boolean;
  bypassesRowLevelSecurity: boolean;
  isRuntimeMember: boolean;
}

const migrationOnly = process.argv.includes("--migration-only");

async function checkDatabaseConnection(
  label: string,
  connectionString: string,
  requireRuntimeRole: boolean,
): Promise<void> {
  const pool = new Pool(
    postgresPoolConfig(connectionString, {
      max: 1,
      application_name: `investor-ready-${label}-connection-check`,
      connectionTimeoutMillis: 10_000,
    }),
  );

  try {
    const result = await pool.query<ConnectionDetails>(`
      select
        current_user as "currentUser",
        current_database() as "currentDatabase",
        inet_server_addr()::text as "serverAddress",
        coalesce(
          (select ssl from pg_stat_ssl where pid = pg_backend_pid()),
          false
        ) as "sslEnabled",
        coalesce(
          (select rolsuper from pg_roles where rolname = current_user),
          false
        ) as "isSuperuser",
        coalesce(
          (select rolbypassrls from pg_roles where rolname = current_user),
          false
        ) as "bypassesRowLevelSecurity",
        coalesce(
          (
            select pg_has_role(current_user, oid, 'member')
            from pg_roles
            where rolname = 'app_runtime'
          ),
          false
        ) as "isRuntimeMember"
    `);
    const details = result.rows[0];
    if (details === undefined) {
      throw new Error(`${label} connection returned no diagnostic row.`);
    }

    if (!details.sslEnabled) {
      throw new Error(`${label} database connection is not using TLS.`);
    }

    if (
      requireRuntimeRole &&
      (details.isSuperuser ||
        details.bypassesRowLevelSecurity ||
        !details.isRuntimeMember)
    ) {
      throw new Error(
        "Runtime connection must be non-superuser, must not bypass RLS, and must inherit app_runtime.",
      );
    }

    console.log(
      `${label}: connected as ${details.currentUser} to ${details.currentDatabase} at ${details.serverAddress ?? "managed endpoint"} with TLS.`,
    );
  } finally {
    await pool.end();
  }
}

async function checkSupabaseJwks(supabaseUrl: string): Promise<void> {
  const issuer = `${supabaseUrl.replace(/\/+$/, "")}/auth/v1`;
  const response = await fetch(`${issuer}/.well-known/jwks.json`, {
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Supabase JWKS request failed with status ${response.status}.`);
  }

  const body: unknown = await response.json();
  if (
    typeof body !== "object" ||
    body === null ||
    !("keys" in body) ||
    !Array.isArray(body.keys) ||
    body.keys.length === 0
  ) {
    throw new Error(
      "Supabase JWKS has no asymmetric signing keys. Rotate Auth to ES256 or RS256.",
    );
  }

  console.log("auth: Supabase JWKS is reachable and exposes asymmetric keys.");
}

if (migrationOnly) {
  const migrationUrl = process.env["DATABASE_MIGRATION_URL"];
  if (migrationUrl === undefined || migrationUrl.trim() === "") {
    throw new Error("DATABASE_MIGRATION_URL is required.");
  }
  await checkDatabaseConnection("migration", migrationUrl, false);
} else {
  const environment = validateEnvironment(process.env);
  await checkDatabaseConnection("runtime", environment.DATABASE_URL, true);

  if (environment.DATABASE_MIGRATION_URL !== undefined) {
    await checkDatabaseConnection(
      "migration",
      environment.DATABASE_MIGRATION_URL,
      false,
    );
  } else {
    console.log("migration: skipped because DATABASE_MIGRATION_URL is not configured.");
  }

  await checkSupabaseJwks(environment.SUPABASE_URL);
}
