import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiTags } from "@nestjs/swagger";
import {
  CurrentAuthorization,
  AllowDuringTenantOnboarding,
  RequirePermissions,
  RequirePlatformPermissions,
} from "../common/decorators.js";
import type { AuthorizationContext } from "../common/request-context.js";
import { IdParamDto } from "../common/validation.js";
import {
  ArchiveTenantDto,
  AssignRoleDto,
  CreateBranchDto,
  CreateCustomerDto,
  CreateTenantDto,
  InviteMembershipDto,
  UpdateBranchDto,
  UpdateBusinessProfileDto,
  UpdateCustomerDto,
  UpdateMembershipAccessDto,
  UpdateMembershipDto,
} from "./tenants.dto.js";
import { TenantsService } from "./tenants.service.js";

@ApiTags("platform tenants")
@ApiBearerAuth()
@Controller("platform/tenants")
export class PlatformTenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @RequirePlatformPermissions("platform.tenants.read")
  @Get()
  list(@CurrentAuthorization() context: AuthorizationContext) {
    return this.tenantsService.listPlatform(context);
  }

  @RequirePlatformPermissions("platform.tenants.create")
  @Post()
  create(
    @CurrentAuthorization() context: AuthorizationContext,
    @Body() input: CreateTenantDto,
  ) {
    return this.tenantsService.createTenant(context, input);
  }

  @RequirePlatformPermissions("platform.tenants.manage")
  @Delete(":id")
  archive(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
    @Body() input: ArchiveTenantDto,
  ) {
    return this.tenantsService.archivePlatform(context, params.id, input);
  }

  @RequirePlatformPermissions("platform.tenants.create", "platform.users.invite")
  @Post(":id/owner-invitation/resend")
  resendOwnerInvitation(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
  ) {
    return this.tenantsService.resendOwnerInvitation(context, params.id);
  }
}

@ApiTags("tenant administration")
@ApiBearerAuth()
@ApiHeader({ name: "X-Tenant-Id", required: true })
@Controller()
export class TenantAdministrationController {
  constructor(private readonly tenantsService: TenantsService) {}

  @RequirePermissions("tenant.manage")
  @Get("business-profile")
  businessProfile(@CurrentAuthorization() context: AuthorizationContext) {
    return this.tenantsService.getBusinessProfile(context);
  }

  @RequirePermissions("tenant.manage")
  @AllowDuringTenantOnboarding()
  @Put("business-profile")
  updateBusinessProfile(
    @CurrentAuthorization() context: AuthorizationContext,
    @Body() input: UpdateBusinessProfileDto,
  ) {
    return this.tenantsService.updateBusinessProfile(context, input);
  }

  @RequirePermissions("branches.read")
  @Get("branches")
  branches(@CurrentAuthorization() context: AuthorizationContext) {
    return this.tenantsService.listBranches(context);
  }

  @RequirePermissions("branches.manage")
  @Post("branches")
  createBranch(
    @CurrentAuthorization() context: AuthorizationContext,
    @Body() input: CreateBranchDto,
  ) {
    return this.tenantsService.createBranch(context, input);
  }

  @RequirePermissions("branches.manage")
  @Patch("branches/:id")
  updateBranch(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
    @Body() input: UpdateBranchDto,
  ) {
    return this.tenantsService.updateBranch(context, params.id, input);
  }

  @RequirePermissions("customers.read")
  @Get("customers")
  customers(@CurrentAuthorization() context: AuthorizationContext) {
    return this.tenantsService.listCustomers(context);
  }

  @RequirePermissions("customers.create")
  @Post("customers")
  createCustomer(
    @CurrentAuthorization() context: AuthorizationContext,
    @Body() input: CreateCustomerDto,
  ) {
    return this.tenantsService.createCustomer(context, input);
  }

  @RequirePermissions("customers.update")
  @Patch("customers/:id")
  updateCustomer(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
    @Body() input: UpdateCustomerDto,
  ) {
    return this.tenantsService.updateCustomer(context, params.id, input);
  }

  @RequirePermissions("memberships.read")
  @Get("memberships")
  memberships(@CurrentAuthorization() context: AuthorizationContext) {
    return this.tenantsService.listMemberships(context);
  }

  @RequirePermissions("memberships.read")
  @Get("membership-invitations")
  invitations(@CurrentAuthorization() context: AuthorizationContext) {
    return this.tenantsService.listInvitations(context);
  }

  @RequirePermissions("memberships.manage")
  @Post("membership-invitations")
  inviteMembership(
    @CurrentAuthorization() context: AuthorizationContext,
    @Body() input: InviteMembershipDto,
  ) {
    return this.tenantsService.addMembership(context, input);
  }

  @RequirePermissions("memberships.manage")
  @Post("membership-invitations/:id/resend")
  resendMembershipInvitation(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
  ) {
    return this.tenantsService.resendMembershipInvitation(context, params.id);
  }

  @RequirePermissions("memberships.manage")
  @Post("membership-invitations/:id/revoke")
  revokeMembershipInvitation(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
  ) {
    return this.tenantsService.revokeMembershipInvitation(context, params.id);
  }

  @RequirePermissions("memberships.manage")
  @Patch("memberships/:id")
  updateMembership(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
    @Body() input: UpdateMembershipDto,
  ) {
    return this.tenantsService.updateMembership(context, params.id, input);
  }

  @RequirePermissions("memberships.manage")
  @Patch("memberships/:id/access")
  updateMembershipAccess(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
    @Body() input: UpdateMembershipAccessDto,
  ) {
    return this.tenantsService.updateMembershipAccess(context, params.id, input);
  }

  @RequirePermissions("memberships.manage")
  @Post("memberships/:id/roles")
  assignRole(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
    @Body() input: AssignRoleDto,
  ) {
    return this.tenantsService.assignRole(context, params.id, input);
  }

  @RequirePermissions("memberships.manage")
  @Delete("memberships/:id/roles/:roleId")
  revokeRole(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("id") membershipId: string,
    @Param("roleId") roleId: string,
  ) {
    return this.tenantsService.revokeRole(context, membershipId, roleId);
  }

  @RequirePermissions("memberships.read")
  @Get("roles")
  roles(@CurrentAuthorization() context: AuthorizationContext) {
    return this.tenantsService.listRoles(context);
  }
}
