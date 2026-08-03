import { Module } from "@nestjs/common";
import { LedgerController, PlatformAuditController } from "./ledger.controller.js";
import { LedgerService } from "./ledger.service.js";

@Module({
  controllers: [LedgerController, PlatformAuditController],
  providers: [LedgerService],
})
export class LedgerModule {}
