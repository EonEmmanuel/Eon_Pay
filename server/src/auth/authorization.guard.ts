import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { isUUID } from "class-validator";
import {
  PLATFORM_ANY_PERMISSIONS_KEY,
  PLATFORM_PERMISSIONS_KEY,
  SKIP_PLATFORM_MFA_KEY,
  TENANT_PERMISSIONS_KEY,
  ALLOW_DURING_TENANT_ONBOARDING_KEY,
} from "../common/decorators.js";
import type { AuthenticatedRequest } from "../common/request-context.js";
import { DatabaseService } from "../database/database.service.js";

@Injectable()
export class AuthorizationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly database: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const tenantPermissions = this.reflector.getAllAndOverride<readonly string[]>(
      TENANT_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    const platformPermissions = this.reflector.getAllAndOverride<readonly string[]>(
      PLATFORM_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    const anyPlatformPermissions = this.reflector.getAllAndOverride<readonly string[]>(
      PLATFORM_ANY_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (
      tenantPermissions === undefined &&
      platformPermissions === undefined &&
      anyPlatformPermissions === undefined
    ) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.user === undefined) {
      return false;
    }

    if (platformPermissions !== undefined || anyPlatformPermissions !== undefined) {
      const permissions = await this.database.authorizePlatform(
        request.user.id,
        platformPermissions ?? [],
      );
      if (
        anyPlatformPermissions !== undefined &&
        !anyPlatformPermissions.some((permission) => permissions.has(permission))
      ) {
        throw new ForbiddenException("Insufficient platform permission.");
      }

      const platformMfaRequired = await this.database.platformMfaRequired(
        request.user.id,
      );
      const skipMfa =
        this.reflector.getAllAndOverride<boolean>(SKIP_PLATFORM_MFA_KEY, [
          context.getHandler(),
          context.getClass(),
        ]) === true;
      if (platformMfaRequired && request.user.assuranceLevel !== "aal2" && !skipMfa) {
        throw new ForbiddenException({
          code: "PLATFORM_MFA_REQUIRED",
          message:
            "Multi-factor authentication is required for platform administration.",
        });
      }

      const userAgent = request.header("user-agent");
      request.authorization = {
        user: request.user,
        permissions,
        platformMfaRequired,
        ...(request.requestId === undefined ? {} : { requestId: request.requestId }),
        ...(request.ip === undefined ? {} : { ipAddress: request.ip }),
        ...(userAgent === undefined ? {} : { userAgent }),
      };
      return true;
    }

    const tenantId = request.header("x-tenant-id");
    if (tenantId === undefined || !isUUID(tenantId, "4")) {
      throw new BadRequestException("A valid X-Tenant-Id UUID header is required.");
    }

    const permissions = await this.database.authorizeTenant(
      request.user.id,
      tenantId,
      tenantPermissions ?? [],
    );
    const allowDuringOnboarding =
      this.reflector.getAllAndOverride<boolean>(ALLOW_DURING_TENANT_ONBOARDING_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) === true;
    if (
      !["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase()) &&
      !allowDuringOnboarding
    ) {
      await this.database.assertTenantOperational(tenantId, request.user.id);
    }
    const userAgent = request.header("user-agent");
    request.authorization = {
      user: request.user,
      tenantId,
      permissions,
      ...(request.requestId === undefined ? {} : { requestId: request.requestId }),
      ...(request.ip === undefined ? {} : { ipAddress: request.ip }),
      ...(userAgent === undefined ? {} : { userAgent }),
    };
    return true;
  }
}
