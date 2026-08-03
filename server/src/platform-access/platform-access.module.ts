import { Module } from "@nestjs/common";
import { PlatformAccessController } from "./platform-access.controller.js";
import { PlatformAccessService } from "./platform-access.service.js";

@Module({
  controllers: [PlatformAccessController],
  providers: [PlatformAccessService],
})
export class PlatformAccessModule {}
