import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiTags } from "@nestjs/swagger";
import { CurrentAuthorization, RequirePermissions } from "../common/decorators.js";
import type { AuthorizationContext } from "../common/request-context.js";
import { IdParamDto } from "../common/validation.js";
import {
  CreateApplicationDto,
  DecideApplicationDto,
  ReviewKycDto,
} from "./applications.dto.js";
import { ApplicationsService } from "./applications.service.js";

@ApiTags("applications")
@ApiBearerAuth()
@ApiHeader({ name: "X-Tenant-Id", required: true })
@Controller("applications")
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  @RequirePermissions("applications.read")
  @Get()
  list(@CurrentAuthorization() context: AuthorizationContext) {
    return this.applications.list(context);
  }

  @RequirePermissions("applications.read")
  @Get(":id")
  get(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
  ) {
    return this.applications.get(context, params.id);
  }

  @RequirePermissions("applications.create", "customers.create", "customers.read")
  @Post()
  create(
    @CurrentAuthorization() context: AuthorizationContext,
    @Body() input: CreateApplicationDto,
  ) {
    return this.applications.create(context, input);
  }

  @RequirePermissions("applications.submit")
  @Post(":id/submit")
  submit(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
  ) {
    return this.applications.submit(context, params.id);
  }

  @RequirePermissions("applications.review")
  @Post(":id/kyc-review")
  reviewKyc(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
    @Body() input: ReviewKycDto,
  ) {
    return this.applications.reviewKyc(context, params.id, input);
  }

  @RequirePermissions("applications.review")
  @Post(":id/decision")
  decide(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
    @Body() input: DecideApplicationDto,
  ) {
    return this.applications.decide(context, params.id, input);
  }
}
