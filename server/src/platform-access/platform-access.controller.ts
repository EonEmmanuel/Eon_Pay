import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  CurrentAuthorization,
  RequirePlatformPermissions,
} from "../common/decorators.js";
import type { AuthorizationContext } from "../common/request-context.js";
import { IdParamDto } from "../common/validation.js";
import { InvitationsService } from "../invitations/invitations.service.js";
import {
  AssignPlatformRoleDto,
  InvitePlatformUserDto,
  UpdatePlatformAccessDto,
  UpdatePlatformProfileDto,
} from "./platform-access.dto.js";
import { PlatformAccessService, type PlatformUser } from "./platform-access.service.js";

@ApiTags("platform access administration")
@ApiBearerAuth()
@Controller("platform")
export class PlatformAccessController {
  constructor(
    private readonly access: PlatformAccessService,
    private readonly invitations: InvitationsService,
  ) {}

  @RequirePlatformPermissions("platform.users.read")
  @Get("users")
  users(
    @CurrentAuthorization() context: AuthorizationContext,
  ): Promise<PlatformUser[]> {
    return this.access.users(context);
  }

  @RequirePlatformPermissions("platform.users.read")
  @Get("roles")
  roles(@CurrentAuthorization() context: AuthorizationContext) {
    return this.access.platformRoles(context);
  }

  @RequirePlatformPermissions("platform.users.update")
  @Patch("users/:id")
  updateProfile(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
    @Body() input: UpdatePlatformProfileDto,
  ) {
    return this.access.updateProfile(context, params.id, input);
  }

  @RequirePlatformPermissions("platform.users.disable")
  @Patch("users/:id/access")
  updateAccess(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
    @Body() input: UpdatePlatformAccessDto,
  ) {
    return this.access.updateAccess(context, params.id, input);
  }

  @RequirePlatformPermissions("platform.users.roles.manage")
  @Post("users/:id/roles")
  assignRole(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
    @Body() input: AssignPlatformRoleDto,
  ) {
    return this.access.assignRole(context, params.id, input.roleId);
  }

  @RequirePlatformPermissions("platform.users.roles.manage")
  @Delete("users/:id/roles/:roleId")
  revokeRole(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("id", new ParseUUIDPipe({ version: "4" })) userId: string,
    @Param("roleId", new ParseUUIDPipe({ version: "4" })) roleId: string,
  ) {
    return this.access.revokeRole(context, userId, roleId);
  }

  @RequirePlatformPermissions("platform.users.read")
  @Get("invitations")
  platformInvitations(@CurrentAuthorization() context: AuthorizationContext) {
    return this.invitations.listPlatformInvitations(context);
  }

  @RequirePlatformPermissions("platform.users.invite")
  @Post("invitations")
  invitePlatformUser(
    @CurrentAuthorization() context: AuthorizationContext,
    @Body() input: InvitePlatformUserDto,
  ) {
    return this.invitations.invitePlatformUser(context, input);
  }

  @RequirePlatformPermissions("platform.users.invite")
  @Post("invitations/:id/resend")
  resendPlatformInvitation(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
  ) {
    return this.invitations.resendPlatformInvitation(context, params.id);
  }

  @RequirePlatformPermissions("platform.users.invite")
  @Post("invitations/:id/revoke")
  revokePlatformInvitation(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
  ) {
    return this.invitations.revokePlatformInvitation(context, params.id);
  }
}
