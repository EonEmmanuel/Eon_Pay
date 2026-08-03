import { Body, Controller, Get, Param, Patch } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiTags } from "@nestjs/swagger";
import {
  CurrentAuthorization,
  RequireAnyPlatformPermissions,
  RequirePermissions,
  RequirePlatformPermissions,
} from "../common/decorators.js";
import type { AuthorizationContext } from "../common/request-context.js";
import {
  PlatformSettingKeyParamDto,
  UpdatePlatformSettingDto,
} from "./analytics.dto.js";
import { AnalyticsService } from "./analytics.service.js";

@ApiTags("tenant analytics")
@ApiBearerAuth()
@ApiHeader({ name: "X-Tenant-Id", required: true })
@Controller("analytics")
export class TenantAnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @RequirePermissions("customers.read", "contracts.read", "installments.read")
  @Get("tenant")
  tenant(@CurrentAuthorization() context: AuthorizationContext) {
    return this.analytics.tenant(context);
  }
}

@ApiTags("platform analytics")
@ApiBearerAuth()
@Controller("platform")
export class PlatformAnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @RequirePlatformPermissions("platform.tenants.read")
  @Get("analytics")
  platform(@CurrentAuthorization() context: AuthorizationContext) {
    return this.analytics.platform(context);
  }

  @RequireAnyPlatformPermissions("platform.settings.read", "platform.risk.read")
  @Get("settings")
  settings(@CurrentAuthorization() context: AuthorizationContext) {
    return this.analytics.settings(context);
  }

  @RequireAnyPlatformPermissions("platform.settings.manage", "platform.risk.manage")
  @Patch("settings/:key")
  updateSetting(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: PlatformSettingKeyParamDto,
    @Body() input: UpdatePlatformSettingDto,
  ) {
    return this.analytics.updateSetting(context, params.key, input);
  }

  @RequirePlatformPermissions("platform.health.read")
  @Get("system-health")
  health(@CurrentAuthorization() context: AuthorizationContext) {
    return this.analytics.systemHealth(context);
  }
}
