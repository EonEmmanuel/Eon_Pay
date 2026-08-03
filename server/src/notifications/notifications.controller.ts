import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiTags } from "@nestjs/swagger";
import {
  AllowDuringTenantOnboarding,
  CurrentAuthorization,
  RequireAnyPlatformPermissions,
  RequirePermissions,
} from "../common/decorators.js";
import type { AuthorizationContext } from "../common/request-context.js";
import { IdParamDto } from "../common/validation.js";
import { UpdateNotificationPreferencesDto } from "./notifications.dto.js";
import { NotificationsService } from "./notifications.service.js";

@ApiTags("notifications")
@ApiBearerAuth()
@ApiHeader({ name: "X-Tenant-Id", required: true })
@RequirePermissions()
@AllowDuringTenantOnboarding()
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentAuthorization() context: AuthorizationContext) {
    return this.notifications.tenantNotifications(context);
  }

  @Get("preferences")
  preferences(@CurrentAuthorization() context: AuthorizationContext) {
    return this.notifications.preferences(context);
  }

  @Patch("preferences")
  updatePreferences(
    @CurrentAuthorization() context: AuthorizationContext,
    @Body() input: UpdateNotificationPreferencesDto,
  ) {
    return this.notifications.updatePreferences(context, input);
  }

  @Post("read-all")
  readAll(@CurrentAuthorization() context: AuthorizationContext) {
    return this.notifications.markAllRead(context, false);
  }

  @Patch(":id/read")
  read(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
  ) {
    return this.notifications.markRead(context, params.id, false);
  }

  @Patch(":id/acknowledge")
  acknowledge(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
  ) {
    return this.notifications.acknowledge(context, params.id, false);
  }

  @Patch(":id/archive")
  archive(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
  ) {
    return this.notifications.archive(context, params.id, false);
  }

  @Patch(":id/sound-played")
  soundPlayed(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
  ) {
    return this.notifications.markSoundPlayed(context, params.id, false);
  }
}

@ApiTags("platform notifications")
@ApiBearerAuth()
@RequireAnyPlatformPermissions(
  "platform.tenants.read",
  "platform.users.read",
  "platform.audit.read",
  "platform.kyb.read",
)
@Controller("platform/notifications")
export class PlatformNotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentAuthorization() context: AuthorizationContext) {
    return this.notifications.platformNotifications(context);
  }

  @Get("preferences")
  preferences(@CurrentAuthorization() context: AuthorizationContext) {
    return this.notifications.preferences(context);
  }

  @Patch("preferences")
  updatePreferences(
    @CurrentAuthorization() context: AuthorizationContext,
    @Body() input: UpdateNotificationPreferencesDto,
  ) {
    return this.notifications.updatePreferences(context, input);
  }

  @Post("read-all")
  readAll(@CurrentAuthorization() context: AuthorizationContext) {
    return this.notifications.markAllRead(context, true);
  }

  @Patch(":id/read")
  read(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
  ) {
    return this.notifications.markRead(context, params.id, true);
  }

  @Patch(":id/acknowledge")
  acknowledge(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
  ) {
    return this.notifications.acknowledge(context, params.id, true);
  }

  @Patch(":id/archive")
  archive(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
  ) {
    return this.notifications.archive(context, params.id, true);
  }

  @Patch(":id/sound-played")
  soundPlayed(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
  ) {
    return this.notifications.markSoundPlayed(context, params.id, true);
  }
}
