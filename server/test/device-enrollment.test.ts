import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ConfigService } from "@nestjs/config";
import type { Environment } from "../src/config/environment.js";
import { DevicePolicySigner } from "../src/devices/device-policy-signer.service.js";

const migration = readFileSync(
  new URL("../drizzle/0023_first_party_device_enrollment.sql", import.meta.url),
  "utf8",
);
const recoverableMigration = readFileSync(
  new URL("../drizzle/0025_recoverable_device_policy.sql", import.meta.url),
  "utf8",
);
const enrollmentService = readFileSync(
  new URL("../src/devices/device-enrollment.service.ts", import.meta.url),
  "utf8",
);
const contractsService = readFileSync(
  new URL("../src/contracts/contracts.service.ts", import.meta.url),
  "utf8",
);
const devicesService = readFileSync(
  new URL("../src/devices/devices.service.ts", import.meta.url),
  "utf8",
);
const deviceGateway = readFileSync(
  new URL("../src/devices/device-agent-gateway.service.ts", import.meta.url),
  "utf8",
);

test("device policies are Ed25519 signed and verifiable by the Android wire format", () => {
  const pair = generateKeyPairSync("ed25519");
  const privateKey = pair.privateKey.export({ format: "der", type: "pkcs8" });
  const config = new ConfigService<Environment, true>({
    DPC_POLICY_PRIVATE_KEY_BASE64: privateKey.toString("base64"),
    DPC_POLICY_TTL_MINUTES: 360,
    DPC_OFFLINE_GRACE_HOURS: 48,
  } as Environment);
  const signer = new DevicePolicySigner(config);
  const token = signer.sign({
    deviceId: "00000000-0000-4000-8000-000000000001",
    tenantId: "00000000-0000-4000-8000-000000000002",
    policyTier: "active",
    amountDue: "0",
    daysOverdue: 0,
    brandingConfig: {
      brandName: "Retailer",
      brandColor: "#2457C5",
      languageTag: "en",
      currencyCode: "XAF",
    },
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    policyVersion: 1,
    offlinePolicy: signer.offlinePolicy(),
  });
  const [payload, signature] = token.split(".");
  assert.ok(payload);
  assert.ok(signature);
  assert.equal(
    verify(
      null,
      Buffer.from(payload, "base64url"),
      pair.publicKey,
      Buffer.from(signature, "base64url"),
    ),
    true,
  );
});

test("one-time enrollment secrets are hash-only and agent access uses narrow database functions", () => {
  assert.match(migration, /app_enroll_first_party_device/);
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /REVOKE ALL ON FUNCTION/);
  assert.match(migration, /enrollment_token_hash text/);
  assert.match(migration, /credential_hash text/);
  assert.doesNotMatch(migration, /GRANT app_device TO app_runtime/);
  assert.match(enrollmentService, /randomBytes\(32\)\.toString\("base64url"\)/);
  assert.match(enrollmentService, /createHash\("sha256"\)/);
  assert.doesNotMatch(
    enrollmentService,
    /enrollmentToken:\s*rawToken[\s\S]*recordAudit/,
  );
});

test("financed contract activation requires the reserved and enrolled physical unit", () => {
  assert.match(contractsService, /inventoryUnit\.status !== "reserved"/);
  assert.match(
    contractsService,
    /eq\(managedDevices\.inventoryUnitId, inventoryUnit\.id\)/,
  );
  assert.match(contractsService, /eq\(managedDevices\.deviceOwnerAttested, true\)/);
  assert.match(contractsService, /Complete Device Owner enrollment/);
});

test("active legacy contracts can retrofit only their already-financed inventory unit", () => {
  assert.match(enrollmentService, /\["active", "past_due", "suspended"\]\.includes/);
  assert.match(
    enrollmentService,
    /unit.status === "financed" && unit.contractId === contract.id/,
  );
  assert.match(enrollmentService, /isPreActivation && unit.status === "available"/);
});

test("recoverable device policy returns signed context without public execution", () => {
  assert.match(recoverableMigration, /app_check_in_first_party_device_v2/);
  assert.match(recoverableMigration, /provider_state jsonb/);
  assert.match(recoverableMigration, /SECURITY DEFINER/);
  assert.match(
    recoverableMigration,
    /REVOKE ALL ON FUNCTION public\.app_check_in_first_party_device_v2/,
  );
});

test("backend release remains an authoritative recovery path", () => {
  assert.match(devicesService, /policyOverride.*active/s);
  assert.match(devicesService, /providerState.*- 'policyOverride'/s);
  assert.match(deviceGateway, /providerState\?\.\["policyOverride"\] === "active"/);
  assert.match(deviceGateway, /app_check_in_first_party_device_v2/);
});
