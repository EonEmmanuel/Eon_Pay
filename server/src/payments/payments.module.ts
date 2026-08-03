import { Module } from "@nestjs/common";
import { PaymentWebhooksController } from "./payment-webhooks.controller.js";
import { PaymentWebhooksService } from "./payment-webhooks.service.js";
import { PaymentsController } from "./payments.controller.js";
import { PaymentsService } from "./payments.service.js";
import { ReconciliationController } from "./reconciliation.controller.js";
import { ReconciliationService } from "./reconciliation.service.js";

@Module({
  controllers: [
    PaymentsController,
    PaymentWebhooksController,
    ReconciliationController,
  ],
  providers: [PaymentsService, PaymentWebhooksService, ReconciliationService],
})
export class PaymentsModule {}
