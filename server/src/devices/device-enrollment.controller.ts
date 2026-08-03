import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiTags } from "@nestjs/swagger";
import {
  CurrentAuthorization,
  Public,
  RequirePermissions,
} from "../common/decorators.js";
import type { AuthorizationContext } from "../common/request-context.js";
import { IdParamDto } from "../common/validation.js";
import {
  AgentCheckInDto,
  AgentCommandAcknowledgementDto,
  AgentEnrollDto,
  CreateDeviceEnrollmentDto,
} from "./device-enrollment.dto.js";
import { DeviceAgentGatewayService } from "./device-agent-gateway.service.js";
import { DeviceEnrollmentService } from "./device-enrollment.service.js";

@ApiTags("device enrollment")
@ApiBearerAuth()
@ApiHeader({ name: "X-Tenant-Id", required: true })
@Controller("device-enrollments")
export class DeviceEnrollmentController {
  constructor(private readonly enrollment: DeviceEnrollmentService) {}

  @RequirePermissions("devices.manage", "inventory.stock.manage")
  @Post()
  create(
    @CurrentAuthorization() context: AuthorizationContext,
    @Body() input: CreateDeviceEnrollmentDto,
  ) {
    return this.enrollment.createIntent(context, input);
  }

  @RequirePermissions("devices.read")
  @Get("contracts/:id")
  status(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
  ) {
    return this.enrollment.status(context, params.id);
  }
}

@ApiTags("device agent")
@Controller("devices-mgmt")
export class DeviceAgentController {
  constructor(private readonly gateway: DeviceAgentGatewayService) {}

  @Public()
  @Post(":id/enroll")
  enroll(
    @Param() params: IdParamDto,
    @Headers("authorization") authorization: string | undefined,
    @Body() input: AgentEnrollDto,
  ) {
    return this.gateway.enroll(params.id, bearerCredential(authorization), input);
  }

  @Public()
  @Post(":id/checkin")
  checkIn(
    @Param() params: IdParamDto,
    @Headers("authorization") authorization: string | undefined,
    @Body() input: AgentCheckInDto,
  ) {
    return this.gateway.checkIn(params.id, bearerCredential(authorization), input);
  }

  @Public()
  @Post(":id/commands/:commandId/ack")
  acknowledge(
    @Param("id") deviceId: string,
    @Param("commandId") commandId: string,
    @Headers("authorization") authorization: string | undefined,
    @Body() input: AgentCommandAcknowledgementDto,
  ) {
    return this.gateway.acknowledge(
      deviceId,
      commandId,
      bearerCredential(authorization),
      input,
    );
  }
}

function bearerCredential(value: string | undefined): string {
  const [scheme, credential, extra] = value?.trim().split(/\s+/) ?? [];
  if (scheme?.toLowerCase() !== "bearer" || !credential || extra !== undefined) {
    return "";
  }
  return credential;
}
