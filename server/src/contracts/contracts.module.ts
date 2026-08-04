import { Module } from "@nestjs/common";
import { DevicesModule } from "../devices/devices.module.js";
import { ContractsController } from "./contracts.controller.js";
import { ContractsService } from "./contracts.service.js";

@Module({
  imports: [DevicesModule],
  controllers: [ContractsController],
  providers: [ContractsService],
})
export class ContractsModule {}
