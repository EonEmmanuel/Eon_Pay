import { Module } from "@nestjs/common";
import {
  NotificationsController,
  PlatformNotificationsController,
} from "./notifications.controller.js";
import { NotificationsService } from "./notifications.service.js";

@Module({
  controllers: [NotificationsController, PlatformNotificationsController],
  providers: [NotificationsService],
})
export class NotificationsModule {}
