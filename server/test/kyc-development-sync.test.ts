import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const service = await readFile(
  resolve(currentDirectory, "../src/kyc/kyc.service.ts"),
  "utf8",
);
const migration = await readFile(
  resolve(currentDirectory, "../drizzle/0021_kyc_development_sync_and_resume.sql"),
  "utf8",
);

test("KYC development sync is gated and uses the canonical status mapping", () => {
  assert.match(service, /DIDIT_KYC_POLLING_FALLBACK_ENABLED/);
  assert.match(service, /The Didit KYC polling fallback is disabled/);
  assert.match(service, /retrieveDecision/);
  assert.match(service, /kycApplicationOutcome\(status\)/);
  assert.match(service, /kyc\.polling_fallback_synced/);
});

test("KYC sessions persist a resumable verification URL", () => {
  assert.match(migration, /ADD COLUMN verification_url text/);
  assert.match(service, /verificationUrl: providerSession\.url/);
  assert.match(service, /prepared\.existing\?\.verificationUrl/);
});
