import { Module } from "@nestjs/common";
import {
  PlatformTenantsController,
  TenantAdministrationController,
} from "./tenants.controller.js";
import { TenantsService } from "./tenants.service.js";

@Module({
  controllers: [PlatformTenantsController, TenantAdministrationController],
  providers: [TenantsService],
})
export class TenantsModule {}
