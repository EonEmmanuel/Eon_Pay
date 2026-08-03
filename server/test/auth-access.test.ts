import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { Reflector } from "@nestjs/core";
import { TENANT_PERMISSIONS_KEY } from "../src/common/decorators.js";
import type { AuthorizationContext } from "../src/common/request-context.js";
import { AuthController } from "../src/auth/auth.controller.js";
import type { AuthService } from "../src/auth/auth.service.js";
import type { InvitationsService } from "../src/invitations/invitations.service.js";

test("platform access endpoint reports self-access without requiring a platform grant", async () => {
  const user = {
    id: "11111111-1111-4111-8111-111111111111",
    assuranceLevel: "aal1" as const,
  };
  const response = {
    allowed: false,
    permissions: [] as string[],
    mfaRequired: false,
    mfaSatisfied: true,
  };
  const auth = {
    platformAccess: async (receivedUser: typeof user) => {
      assert.equal(receivedUser, user);
      return response;
    },
  } as AuthService;
  const controller = new AuthController(auth, {} as InvitationsService);
  const reflector = new Reflector();
  assert.equal(
    reflector.get(TENANT_PERMISSIONS_KEY, controller.platformAccess),
    undefined,
  );
  assert.deepEqual(await controller.platformAccess(user), response);
});
test("tenant access endpoint requires membership and returns effective permissions", () => {
  const controller = new AuthController({} as AuthService, {} as InvitationsService);
  const reflector = new Reflector();
  assert.deepEqual(
    reflector.get<readonly string[]>(TENANT_PERMISSIONS_KEY, controller.tenantAccess),
    [],
  );

  const context: AuthorizationContext = {
    user: { id: "11111111-1111-4111-8111-111111111111" },
    tenantId: "22222222-2222-4222-8222-222222222222",
    permissions: new Set(["contracts.read", "customers.read"]),
  };
  assert.deepEqual(controller.tenantAccess(context), {
    allowed: true,
    permissions: ["contracts.read", "customers.read"],
  });
});
