import { createHmac } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";
import { UnauthorizedException } from "@nestjs/common";
import { hashIdempotentRequest } from "../src/common/persistence.js";
import {
  canonicalJson,
  verifyCanonicalHmacSha256,
  verifyHmacSha256,
  verifyTimestamp,
} from "../src/providers/provider-security.js";

test("idempotency hashes are stable across object key order", () => {
  assert.equal(
    hashIdempotentRequest({
      customerId: "customer",
      amount: 25_000,
      metadata: { source: "mobile", attempt: 1 },
    }),
    hashIdempotentRequest({
      metadata: { attempt: 1, source: "mobile" },
      amount: 25_000,
      customerId: "customer",
    }),
  );
});

test("raw webhook HMAC rejects tampered evidence", () => {
  const secret = "test-webhook-secret-long-enough";
  const body = Buffer.from('{"status":"settled","amount":25000}');
  const signature = createHmac("sha256", secret).update(body).digest("hex");
  assert.doesNotThrow(() => verifyHmacSha256(body, signature, secret));
  assert.throws(
    () =>
      verifyHmacSha256(
        Buffer.from('{"status":"settled","amount":26000}'),
        signature,
        secret,
      ),
    UnauthorizedException,
  );
});

test("Didit canonical webhook HMAC handles nested key order", () => {
  const secret = "test-didit-secret-long-enough";
  const signedPayload = {
    status: "Approved",
    decision: { risk: 4, checks: ["id", "liveness"] },
    session_id: "session-id",
  };
  const receivedPayload = {
    session_id: "session-id",
    decision: { checks: ["id", "liveness"], risk: 4 },
    status: "Approved",
  };
  const signature = createHmac("sha256", secret)
    .update(canonicalJson(signedPayload))
    .digest("hex");
  assert.doesNotThrow(() =>
    verifyCanonicalHmacSha256(receivedPayload, signature, secret),
  );
});

test("webhook timestamp rejects deliveries outside the replay window", () => {
  assert.doesNotThrow(() => verifyTimestamp(String(Math.floor(Date.now() / 1_000))));
  assert.throws(
    () => verifyTimestamp(String(Math.floor(Date.now() / 1_000) - 301)),
    UnauthorizedException,
  );
});
