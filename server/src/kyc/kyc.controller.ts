import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { ApiBearerAuth, ApiHeader, ApiTags } from "@nestjs/swagger";
import {
  CurrentAuthorization,
  Public,
  RequirePermissions,
  RequirePlatformPermissions,
  AllowDuringTenantOnboarding,
} from "../common/decorators.js";
import type { AuthorizationContext } from "../common/request-context.js";
import { IdParamDto } from "../common/validation.js";
import { StartKycSessionDto } from "./kyc.dto.js";
import { diditSessionKind } from "./didit-webhook.js";
import { KycService } from "./kyc.service.js";
import { RetailerKybService } from "./retailer-kyb.service.js";
import { ReviewRetailerKybDto, StartRetailerKybDto } from "./retailer-kyb.dto.js";

@ApiTags("kyc")
@Controller()
export class KycController {
  constructor(
    private readonly kyc: KycService,
    private readonly retailerKyb: RetailerKybService,
  ) {}

  @ApiBearerAuth()
  @ApiHeader({ name: "X-Tenant-Id", required: true })
  @RequirePermissions("tenant.manage")
  @Get("retailer/kyb")
  retailerCase(@CurrentAuthorization() context: AuthorizationContext) {
    return this.retailerKyb.getTenantCase(context);
  }

  @ApiBearerAuth()
  @ApiHeader({ name: "X-Tenant-Id", required: true })
  @AllowDuringTenantOnboarding()
  @RequirePermissions("tenant.manage")
  @Post("retailer/kyb/session")
  startRetailerKyb(
    @CurrentAuthorization() context: AuthorizationContext,
    @Body() input: StartRetailerKybDto,
  ) {
    return this.retailerKyb.start(context, input);
  }

  @ApiBearerAuth()
  @ApiHeader({ name: "X-Tenant-Id", required: true })
  @AllowDuringTenantOnboarding()
  @RequirePermissions("tenant.manage")
  @Post("retailer/kyb/sync")
  syncRetailerKyb(@CurrentAuthorization() context: AuthorizationContext) {
    return this.retailerKyb.syncTenantCase(context);
  }

  @ApiBearerAuth()
  @RequirePlatformPermissions("platform.kyb.read")
  @Get("platform/kyb/cases")
  platformCases(@CurrentAuthorization() context: AuthorizationContext) {
    return this.retailerKyb.listPlatformCases(context);
  }

  @ApiBearerAuth()
  @RequirePlatformPermissions("platform.kyb.read")
  @Get("platform/kyb/cases/:id")
  platformCase(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
  ) {
    return this.retailerKyb.getPlatformCase(context, params.id);
  }

  @ApiBearerAuth()
  @RequirePlatformPermissions("platform.kyb.read", "platform.kyb.manage")
  @Post("platform/kyb/cases/:id/sync")
  syncPlatformCase(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
  ) {
    return this.retailerKyb.syncPlatformCase(context, params.id);
  }

  @ApiBearerAuth()
  @RequirePlatformPermissions("platform.kyb.manage")
  @Patch("platform/kyb/cases/:id/review")
  reviewPlatformCase(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
    @Body() input: ReviewRetailerKybDto,
  ) {
    return this.retailerKyb.review(context, params.id, input);
  }

  @ApiBearerAuth()
  @RequirePlatformPermissions("platform.kyb.read")
  @Get("platform/kyb/cases/:id/report")
  async platformCaseReport(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
    @Res() response: Response,
  ) {
    const report = await this.retailerKyb.report(context, params.id);
    response.setHeader("content-type", report.contentType);
    response.setHeader(
      "content-disposition",
      `attachment; filename="${report.fileName}"`,
    );
    response.send(Buffer.from(report.body));
  }

  @ApiBearerAuth()
  @ApiHeader({ name: "X-Tenant-Id", required: true })
  @RequirePermissions()
  @Post("applications/:id/kyc/session")
  start(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
    @Body() input: StartKycSessionDto,
  ) {
    return this.kyc.start(context, params.id, input);
  }

  @ApiBearerAuth()
  @ApiHeader({ name: "X-Tenant-Id", required: true })
  @RequirePermissions()
  @Get("applications/:id/kyc/status")
  status(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
  ) {
    return this.kyc.status(context, params.id);
  }

  @ApiBearerAuth()
  @ApiHeader({ name: "X-Tenant-Id", required: true })
  @RequirePermissions()
  @Post("applications/:id/kyc/sync")
  sync(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
  ) {
    return this.kyc.sync(context, params.id);
  }

  @Public()
  @Post("webhooks/didit")
  diditWebhook(
    @Body() payload: Record<string, unknown>,
    @Headers("x-signature-v2") signature: string | undefined,
    @Headers("x-timestamp") timestamp: string | undefined,
  ) {
    const sessionKind = diditSessionKind(payload);
    if (sessionKind === "kyb") {
      return this.retailerKyb.handleWebhook(payload, signature, timestamp);
    }
    if (sessionKind === "kyc") {
      return this.kyc.handleDiditWebhook(payload, signature, timestamp);
    }
    throw new BadRequestException("Didit webhook session kind is unsupported.");
  }

  @Public()
  @Post("webhooks/kyc/didit")
  webhook(
    @Body() payload: Record<string, unknown>,
    @Headers("x-signature-v2") signature: string | undefined,
    @Headers("x-timestamp") timestamp: string | undefined,
  ) {
    return this.kyc.handleDiditWebhook(payload, signature, timestamp);
  }

  @Public()
  @Post("webhooks/kyb/didit")
  retailerWebhook(
    @Body() payload: Record<string, unknown>,
    @Headers("x-signature-v2") signature: string | undefined,
    @Headers("x-timestamp") timestamp: string | undefined,
  ) {
    return this.retailerKyb.handleWebhook(payload, signature, timestamp);
  }
}
