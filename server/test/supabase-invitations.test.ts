import assert from "node:assert/strict";
import test from "node:test";
import { ConfigService } from "@nestjs/config";
import type { Environment } from "../src/config/environment.js";
import {
  InvitationDeliveryError,
  SupabaseInvitationsProvider,
} from "../src/providers/supabase-invitations.provider.js";

test("invitation delivery reports missing Supabase configuration", async () => {
  const config = new ConfigService({
    SUPABASE_URL: "https://project.supabase.co",
  }) as ConfigService<Environment, true>;
  const provider = new SupabaseInvitationsProvider(config);

  assert.equal(provider.configured, false);
  await assert.rejects(
    provider.send({
      email: "owner@example.com",
      fullName: "Retailer Owner",
    }),
    (error: unknown) => {
      assert.ok(error instanceof InvitationDeliveryError);
      assert.equal(error.reason, "not_configured");
      return true;
    },
  );
});
