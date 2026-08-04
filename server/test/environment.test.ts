import assert from "node:assert/strict";
import test from "node:test";
import { parseCorsOrigins, validateEnvironment } from "../src/config/environment.js";

test("environment validation rejects missing security-critical configuration", () => {
  assert.throws(
    () => validateEnvironment({}),
    /DATABASE_URL.*SUPABASE_URL|SUPABASE_URL.*DATABASE_URL/,
  );
});

test("environment validation accepts a minimal secure configuration", () => {
  const environment = validateEnvironment({
    DATABASE_URL: "postgresql://runtime:secret@localhost:5432/postgres",
    SUPABASE_URL: "https://project.supabase.co",
  });
  assert.equal(environment.PORT, 3001);
  assert.equal(environment.SUPABASE_JWT_AUDIENCE, "authenticated");
});

test("environment validation rejects partially configured provider credentials", () => {
  assert.throws(
    () =>
      validateEnvironment({
        DATABASE_URL: "postgresql://runtime:secret@localhost:5432/postgres",
        SUPABASE_URL: "https://project.supabase.co",
        DIDIT_API_KEY: "configured-without-workflow-and-secret",
      }),
    /DIDIT_WORKFLOW_ID.*DIDIT_WEBHOOK_SECRET|DIDIT_WEBHOOK_SECRET.*DIDIT_WORKFLOW_ID/,
  );
});

test("invitation email configuration requires a key and redirect URL together", () => {
  assert.throws(
    () =>
      validateEnvironment({
        DATABASE_URL: "postgresql://runtime:secret@localhost:5432/postgres",
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      }),
    /SUPABASE_INVITE_REDIRECT_URL/,
  );
});

test("Didit KYB workflow requires a dedicated retailer callback", () => {
  assert.throws(
    () =>
      validateEnvironment({
        DATABASE_URL: "postgresql://runtime:secret@localhost:5432/postgres",
        SUPABASE_URL: "https://project.supabase.co",
        DIDIT_KYB_WORKFLOW_ID: "11111111-2222-4333-8444-555555555555",
      }),
    /DIDIT_KYB_CALLBACK_URL/,
  );
});

test("Didit KYB polling fallback is restricted to non-production environments", () => {
  assert.throws(
    () =>
      validateEnvironment({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://runtime:secret@localhost:5432/postgres",
        SUPABASE_URL: "https://project.supabase.co",
        DIDIT_KYB_POLLING_FALLBACK_ENABLED: "true",
      }),
    /polling fallback cannot be enabled in production/,
  );

  const development = validateEnvironment({
    NODE_ENV: "development",
    DATABASE_URL: "postgresql://runtime:secret@localhost:5432/postgres",
    SUPABASE_URL: "https://project.supabase.co",
    DIDIT_KYB_POLLING_FALLBACK_ENABLED: "true",
  });
  assert.equal(development.DIDIT_KYB_POLLING_FALLBACK_ENABLED, true);
});

test("Didit KYC polling fallback is restricted to non-production environments", () => {
  assert.throws(
    () =>
      validateEnvironment({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://runtime:secret@localhost:5432/postgres",
        SUPABASE_URL: "https://project.supabase.co",
        DIDIT_KYC_POLLING_FALLBACK_ENABLED: "true",
      }),
    /KYC polling fallback cannot be enabled in production/,
  );

  const development = validateEnvironment({
    NODE_ENV: "development",
    DATABASE_URL: "postgresql://runtime:secret@localhost:5432/postgres",
    SUPABASE_URL: "https://project.supabase.co",
    DIDIT_KYC_POLLING_FALLBACK_ENABLED: "true",
  });
  assert.equal(development.DIDIT_KYC_POLLING_FALLBACK_ENABLED, true);
});

test("Play Integrity cannot be enabled without verifier credentials", () => {
  assert.throws(
    () =>
      validateEnvironment({
        DATABASE_URL: "postgresql://runtime:secret@localhost:5432/postgres",
        SUPABASE_URL: "https://project.supabase.co",
        PLAY_INTEGRITY_ENABLED: "true",
      }),
    /PLAY_INTEGRITY_SERVICE_ACCOUNT_BASE64/,
  );
});
test("notification email delivery requires complete Resend configuration", () => {
  assert.throws(
    () =>
      validateEnvironment({
        DATABASE_URL: "postgresql://runtime:secret@localhost:5432/postgres",
        SUPABASE_URL: "https://project.supabase.co",
        RESEND_API_KEY: "re_test_key",
      }),
    /NOTIFICATION_FROM_EMAIL.*NOTIFICATION_DATABASE_URL|NOTIFICATION_DATABASE_URL.*NOTIFICATION_FROM_EMAIL/,
  );
});

test("CORS parsing rejects wildcard origins", () => {
  assert.throws(() => parseCorsOrigins("*"), /exact origins/);
  assert.deepEqual(parseCorsOrigins("http://localhost:5173, http://127.0.0.1:5173"), [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ]);
});
