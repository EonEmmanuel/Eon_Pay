import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { Reflector } from "@nestjs/core";
import { PLATFORM_PERMISSIONS_KEY } from "../src/common/decorators.js";
import type { AuthorizationContext } from "../src/common/request-context.js";
import { PlatformTenantsController } from "../src/tenants/tenants.controller.js";
import type { TenantsService } from "../src/tenants/tenants.service.js";

test("retailer archival requires management permission and forwards the reason", async () => {
  const calls: Array<{ tenantId: string; reason: string }> = [];
  const service = {
    archivePlatform(
      _context: AuthorizationContext,
      tenantId: string,
      input: { reason: string },
    ) {
      calls.push({ tenantId, reason: input.reason });
      return Promise.resolve({ id: tenantId, archivedAt: "2026-07-29T00:00:00.000Z" });
    },
  } as unknown as TenantsService;
  const controller = new PlatformTenantsController(service);
  const reflector = new Reflector();
  assert.deepEqual(
    reflector.get<readonly string[]>(PLATFORM_PERMISSIONS_KEY, controller.archive),
    ["platform.tenants.manage"],
  );

  const context: AuthorizationContext = {
    user: { id: "11111111-1111-4111-8111-111111111111" },
    permissions: new Set(["platform.tenants.manage"]),
  };
  const tenantId = "22222222-2222-4222-8222-222222222222";
  const result = await controller.archive(
    context,
    { id: tenantId },
    { reason: "Retailer requested closure" },
  );

  assert.deepEqual(calls, [{ tenantId, reason: "Retailer requested closure" }]);
  assert.deepEqual(result, {
    id: tenantId,
    archivedAt: "2026-07-29T00:00:00.000Z",
  });
});
