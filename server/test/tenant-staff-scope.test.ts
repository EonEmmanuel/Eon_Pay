import assert from "node:assert/strict";
import test from "node:test";
import { ConflictException } from "@nestjs/common";
import { validateStaffAccessScope } from "../src/invitations/invitations.service.js";

function rejectsScope(
  roleKey: string,
  allBranches: boolean,
  branchIds: string[],
): void {
  assert.throws(
    () => validateStaffAccessScope(roleKey, allBranches, branchIds),
    ConflictException,
  );
}

test("owners and administrators require retailer-wide access", () => {
  assert.doesNotThrow(() => validateStaffAccessScope("tenant_owner", true, []));
  assert.doesNotThrow(() => validateStaffAccessScope("tenant_admin", true, []));
  rejectsScope("tenant_owner", false, ["branch-a"]);
  rejectsScope("tenant_admin", false, ["branch-a"]);
});

test("branch managers and cashiers require at least one branch", () => {
  assert.doesNotThrow(() =>
    validateStaffAccessScope("branch_manager", false, ["branch-a"]),
  );
  assert.doesNotThrow(() =>
    validateStaffAccessScope("cashier", false, ["branch-a", "branch-b"]),
  );
  rejectsScope("branch_manager", true, []);
  rejectsScope("cashier", false, []);
});

test("underwriters and other operational staff support either scope", () => {
  assert.doesNotThrow(() => validateStaffAccessScope("underwriter", true, []));
  assert.doesNotThrow(() =>
    validateStaffAccessScope("underwriter", false, ["branch-a"]),
  );
  assert.doesNotThrow(() =>
    validateStaffAccessScope("collections_agent", false, ["branch-a"]),
  );
  rejectsScope("underwriter", true, ["branch-a"]);
});
