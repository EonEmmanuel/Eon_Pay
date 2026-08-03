import { Module } from "@nestjs/common";
import { KycController } from "./kyc.controller.js";
import { KycService } from "./kyc.service.js";
import { RetailerKybService } from "./retailer-kyb.service.js";

@Module({
  controllers: [KycController],
  providers: [KycService, RetailerKybService],
})
export class KycModule {}
