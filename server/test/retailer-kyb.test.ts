import assert from "node:assert/strict";
import test from "node:test";
import { canStartRetailerKyb } from "../src/kyc/retailer-kyb.service.js";

test("legacy active retailers can enter the enforced KYB lifecycle", () => {
  assert.equal(canStartRetailerKyb("active"), true);
  assert.equal(canStartRetailerKyb("kyb_required"), true);
  assert.equal(canStartRetailerKyb("pending_owner"), false);
  assert.equal(canStartRetailerKyb("business_profile_required"), false);
  assert.equal(canStartRetailerKyb("rejected"), false);
});
