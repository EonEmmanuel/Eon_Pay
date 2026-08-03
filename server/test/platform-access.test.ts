import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { Reflector } from "@nestjs/core";
import { PLATFORM_PERMISSIONS_KEY } from "../src/common/decorators.js";
import type { InvitationsService } from "../src/invitations/invitations.service.js";
import { PlatformAccessController } from "../src/platform-access/platform-access.controller.js";
import type { PlatformAccessService } from "../src/platform-access/platform-access.service.js";

const controller = new PlatformAccessController(
  {} as PlatformAccessService,
  {} as InvitationsService,
);
const reflector = new Reflector();

test("platform staff reads and mutations use separate permissions", () => {
  assert.deepEqual(
    reflector.get<readonly string[]>(PLATFORM_PERMISSIONS_KEY, controller.users),
    ["platform.users.read"],
  );
  assert.deepEqual(
    reflector.get<readonly string[]>(
      PLATFORM_PERMISSIONS_KEY,
      controller.invitePlatformUser,
    ),
    ["platform.users.invite"],
  );
  assert.deepEqual(
    reflector.get<readonly string[]>(PLATFORM_PERMISSIONS_KEY, controller.updateAccess),
    ["platform.users.disable"],
  );
  assert.deepEqual(
    reflector.get<readonly string[]>(PLATFORM_PERMISSIONS_KEY, controller.assignRole),
    ["platform.users.roles.manage"],
  );
});

test("platform invitation resend and revoke require invitation authority", () => {
  for (const handler of [
    controller.resendPlatformInvitation,
    controller.revokePlatformInvitation,
  ]) {
    assert.deepEqual(
      reflector.get<readonly string[]>(PLATFORM_PERMISSIONS_KEY, handler),
      ["platform.users.invite"],
    );
  }
});
