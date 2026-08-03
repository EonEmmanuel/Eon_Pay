import { Body, Controller, Get, Headers, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiTags } from "@nestjs/swagger";
import { CurrentAuthorization, RequirePermissions } from "../common/decorators.js";
import type { AuthorizationContext } from "../common/request-context.js";
import { IdParamDto } from "../common/validation.js";
import { PortalService } from "./portal.service.js";
import { CreateSelfPaymentDto } from "./portal.dto.js";
import { CreateApplicationDto } from "../applications/applications.dto.js";

@ApiTags("customer self-service")
@ApiBearerAuth()
@ApiHeader({ name: "X-Tenant-Id", required: true })
@Controller("me")
export class PortalController {
  constructor(private readonly portal: PortalService) {}

  @RequirePermissions("self.contracts.read")
  @Get("contracts")
  contracts(@CurrentAuthorization() context: AuthorizationContext) {
    return this.portal.contracts(context);
  }

  @RequirePermissions("self.installments.read")
  @Get("contracts/:id/installments")
  installments(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
  ) {
    return this.portal.installments(context, params.id);
  }

  @RequirePermissions("self.payments.read")
  @Get("payments")
  payments(@CurrentAuthorization() context: AuthorizationContext) {
    return this.portal.payments(context);
  }

  @RequirePermissions("self.fees.read")
  @Get("fees")
  fees(@CurrentAuthorization() context: AuthorizationContext) {
    return this.portal.fees(context);
  }

  @RequirePermissions("self.payments.create")
  @Post("payments")
  createPayment(
    @CurrentAuthorization() context: AuthorizationContext,
    @Headers("idempotency-key") idempotencyKey: string,
    @Body() input: CreateSelfPaymentDto,
  ) {
    return this.portal.createPayment(context, idempotencyKey, input);
  }

  @RequirePermissions("self.applications.read")
  @Get("applications")
  applications(@CurrentAuthorization() context: AuthorizationContext) {
    return this.portal.applications(context);
  }

  @RequirePermissions("self.applications.create")
  @Post("applications")
  createApplication(
    @CurrentAuthorization() context: AuthorizationContext,
    @Body() input: CreateApplicationDto,
  ) {
    return this.portal.createApplication(context, input);
  }

  @RequirePermissions("self.applications.create")
  @Get("products")
  products(
    @CurrentAuthorization() context: AuthorizationContext,
    @Query("branchId") branchId: string,
  ) {
    return this.portal.products(context, branchId);
  }

  @RequirePermissions("self.applications.create")
  @Get("branches")
  branches(@CurrentAuthorization() context: AuthorizationContext) {
    return this.portal.branches(context);
  }

  @RequirePermissions("self.contracts.read")
  @Get("profile")
  profile(@CurrentAuthorization() context: AuthorizationContext) {
    return this.portal.profile(context);
  }
}
