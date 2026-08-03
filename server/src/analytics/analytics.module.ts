import { Module } from "@nestjs/common";
import {
  PlatformAnalyticsController,
  TenantAnalyticsController,
} from "./analytics.controller.js";
import { AnalyticsService } from "./analytics.service.js";

@Module({
  controllers: [TenantAnalyticsController, PlatformAnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
