import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Param,
  Post,
  RawBodyRequest,
  Req,
} from "@nestjs/common";
import { Public } from "../common/decorators.js";
import type { AuthenticatedRequest } from "../common/request-context.js";
import {
  PaymentWebhooksService,
  type PaymentWebhookProvider,
} from "./payment-webhooks.service.js";

@Controller("webhooks/payments")
export class PaymentWebhooksController {
  constructor(private readonly webhooks: PaymentWebhooksService) {}

  @Public()
  @Post(":provider")
  handle(
    @Param("provider") providerValue: string,
    @Body() payload: Record<string, unknown>,
    @Req() request: RawBodyRequest<AuthenticatedRequest>,
    @Headers("x-provider-signature") signature: string | undefined,
  ) {
    if (!["mtn_momo", "orange_money"].includes(providerValue)) {
      throw new BadRequestException("Unsupported payment provider.");
    }
    if (request.rawBody === undefined) {
      throw new BadRequestException("Raw webhook body is unavailable.");
    }
    return this.webhooks.handle(
      providerValue as PaymentWebhookProvider,
      payload,
      request.rawBody,
      signature,
    );
  }
}
