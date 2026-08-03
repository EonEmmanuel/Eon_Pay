import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const migration = await readFile(
  resolve(currentDirectory, "../drizzle/0020_fix_cross_table_integrity_trigger.sql"),
  "utf8",
);

test("shared integrity trigger accesses fields only inside table branches", () => {
  assert.match(
    migration,
    /IF TG_TABLE_NAME = 'payments' THEN\s+IF NEW\.contract_id IS NOT NULL/,
  );
  assert.match(
    migration,
    /ELSIF TG_TABLE_NAME = 'kyc_verification_sessions' THEN\s+IF NEW\.customer_id IS NOT NULL/,
  );
  assert.doesNotMatch(migration, /TG_TABLE_NAME = 'payments' AND NEW\.contract_id/);
});
