import "dotenv/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { postgresPoolConfig } from "./connection.js";

const migrationUrl =
  process.env["DATABASE_MIGRATION_URL"] ?? process.env["DATABASE_URL"];

if (migrationUrl === undefined || migrationUrl.trim() === "") {
  throw new Error("DATABASE_MIGRATION_URL or DATABASE_URL is required.");
}

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(currentDirectory, "../../drizzle");
const pool = new Pool(
  postgresPoolConfig(migrationUrl, {
    max: 1,
    application_name: "investor-ready-migrator",
  }),
);

try {
  await migrate(drizzle(pool), { migrationsFolder });
} finally {
  await pool.end();
}
