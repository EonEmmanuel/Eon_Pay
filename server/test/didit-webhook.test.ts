import assert from "node:assert/strict";
import test from "node:test";
import { diditSessionKind } from "../src/kyc/didit-webhook.js";

test("Didit user sessions route to KYC processing", () => {
  assert.equal(diditSessionKind({ session_kind: "user" }), "kyc");
  assert.equal(diditSessionKind({ data: { session_kind: "KYC" } }), "kyc");
});

test("Didit business sessions route to KYB processing", () => {
  assert.equal(diditSessionKind({ session_kind: "business" }), "kyb");
  assert.equal(
    diditSessionKind({ data: { business_session_id: "session-id" } }),
    "kyb",
  );
});

test("Didit events without a supported session kind are rejected", () => {
  assert.equal(diditSessionKind({ type: "transaction.created" }), undefined);
});
