import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiTags } from "@nestjs/swagger";
import { CurrentAuthorization, RequirePermissions } from "../common/decorators.js";
import type { AuthorizationContext } from "../common/request-context.js";
import { IdParamDto } from "../common/validation.js";
import { EnrollManagedDeviceDto, IssueMdmCommandDto } from "./devices.dto.js";
import { DevicesService } from "./devices.service.js";

@ApiTags("managed devices")
@ApiBearerAuth()
@ApiHeader({ name: "X-Tenant-Id", required: true })
@Controller("devices")
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @RequirePermissions()
  @Get()
  list(@CurrentAuthorization() context: AuthorizationContext) {
    return this.devices.list(context);
  }

  @RequirePermissions()
  @Get(":id")
  get(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
  ) {
    return this.devices.get(context, params.id);
  }

  @RequirePermissions("devices.manage")
  @Post("enroll")
  enroll(
    @CurrentAuthorization() context: AuthorizationContext,
    @Body() input: EnrollManagedDeviceDto,
  ) {
    return this.devices.enroll(context, input);
  }

  @RequirePermissions("devices.manage")
  @Post(":id/commands")
  command(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
    @Headers("idempotency-key") idempotencyKey: string,
    @Body() input: IssueMdmCommandDto,
  ) {
    return this.devices.issueCommand(context, params.id, idempotencyKey, input);
  }
}
