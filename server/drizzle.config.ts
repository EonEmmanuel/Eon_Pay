import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const url = process.env["DATABASE_MIGRATION_URL"] ?? process.env["DATABASE_URL"];

if (url === undefined || url.trim() === "") {
  throw new Error(
    "DATABASE_MIGRATION_URL or DATABASE_URL is required for Drizzle commands.",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/database/schema.ts",
  out: "./drizzle",
  dbCredentials: { url },
  strict: true,
  verbose: true,
  breakpoints: false,
});
