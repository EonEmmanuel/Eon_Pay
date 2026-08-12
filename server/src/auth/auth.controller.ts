import { Controller, Get, Param, Post, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  CurrentAuthorization,
  CurrentUser,
  RequirePermissions,
} from "../common/decorators.js";
import type {
  AuthenticatedUser,
  AuthenticatedRequest,
  AuthorizationContext,
} from "../common/request-context.js";
import { AuthService } from "./auth.service.js";
import { IdParamDto } from "../common/validation.js";
import { InvitationsService } from "../invitations/invitations.service.js";

@ApiTags("authentication")
@ApiBearerAuth()
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly invitationsService: InvitationsService,
  ) { }

  @Get("me")
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  @Get("memberships")
  memberships(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.memberships(user.id);
  }

  @RequirePermissions()
  @Get("tenant-access")
  tenantAccess(@CurrentAuthorization() context: AuthorizationContext) {
    return {
      allowed: true as const,
      permissions: [...context.permissions].sort(),
    };
  }

  @Get("platform-access")
  platformAccess(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.platformAccess(user);
  }

  @Get("invitations")
  invitations(@CurrentUser() user: AuthenticatedUser) {
    return this.invitationsService.listForUser(user);
  }
  @Get("platform-invitations")
  platformInvitations(@CurrentUser() user: AuthenticatedUser) {
    return this.invitationsService.listPlatformForUser(user);
  }

  @Post("invitations/:id/accept")
  acceptInvitation(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: IdParamDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const userAgent = request.header("user-agent");
    return this.invitationsService.accept(user, params.id, {
      ...(request.requestId === undefined ? {} : { requestId: request.requestId }),
      ...(request.ip === undefined ? {} : { ipAddress: request.ip }),
      ...(userAgent === undefined ? {} : { userAgent }),
    });
  }

  @Post("platform-invitations/:id/accept")
  acceptPlatformInvitation(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: IdParamDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const userAgent = request.header("user-agent");
    return this.invitationsService.acceptPlatform(user, params.id, {
      ...(request.requestId === undefined ? {} : { requestId: request.requestId }),
      ...(request.ip === undefined ? {} : { ipAddress: request.ip }),
      ...(userAgent === undefined ? {} : { userAgent }),
    });
  }
}