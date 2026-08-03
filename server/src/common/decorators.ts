import {
  createParamDecorator,
  SetMetadata,
  type ExecutionContext,
} from "@nestjs/common";
import type { AuthenticatedRequest } from "./request-context.js";

export const IS_PUBLIC_KEY = "security:is-public";
export const TENANT_PERMISSIONS_KEY = "security:tenant-permissions";
export const PLATFORM_PERMISSIONS_KEY = "security:platform-permissions";
export const PLATFORM_ANY_PERMISSIONS_KEY = "security:platform-any-permissions";
export const SKIP_PLATFORM_MFA_KEY = "security:skip-platform-mfa";
export const ALLOW_DURING_TENANT_ONBOARDING_KEY =
  "security:allow-during-tenant-onboarding";

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(TENANT_PERMISSIONS_KEY, permissions);

export const RequirePlatformPermissions = (...permissions: string[]) =>
  SetMetadata(PLATFORM_PERMISSIONS_KEY, permissions);

export const RequireAnyPlatformPermissions = (...permissions: string[]) =>
  SetMetadata(PLATFORM_ANY_PERMISSIONS_KEY, permissions);

export const AllowPlatformMfaSetup = () => SetMetadata(SKIP_PLATFORM_MFA_KEY, true);

export const AllowDuringTenantOnboarding = () =>
  SetMetadata(ALLOW_DURING_TENANT_ONBOARDING_KEY, true);

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user;
  },
);

export const CurrentAuthorization = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.authorization;
  },
);
