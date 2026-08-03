import { Module } from "@nestjs/common";
import { DeviceAgentGatewayService } from "./device-agent-gateway.service.js";
import {
  DeviceAgentController,
  DeviceEnrollmentController,
} from "./device-enrollment.controller.js";
import { DeviceEnrollmentService } from "./device-enrollment.service.js";
import { DevicePolicySigner } from "./device-policy-signer.service.js";
import { DevicesController } from "./devices.controller.js";
import { DevicesService } from "./devices.service.js";

@Module({
  controllers: [DevicesController, DeviceEnrollmentController, DeviceAgentController],
  providers: [
    DevicesService,
    DeviceEnrollmentService,
    DeviceAgentGatewayService,
    DevicePolicySigner,
  ],
})
export class DevicesModule {}
