import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiTags } from "@nestjs/swagger";
import { CurrentAuthorization, RequirePermissions } from "../common/decorators.js";
import type { AuthorizationContext } from "../common/request-context.js";
import { IdParamDto } from "../common/validation.js";
import {
  CreatePaymentDto,
  ReversePaymentDto,
  SettlePaymentDto,
} from "./payments.dto.js";
import { PaymentsService } from "./payments.service.js";

@ApiTags("payments")
@ApiBearerAuth()
@ApiHeader({ name: "X-Tenant-Id", required: true })
@Controller("payments")
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @RequirePermissions("payments.read")
  @Get()
  list(@CurrentAuthorization() context: AuthorizationContext) {
    return this.payments.list(context);
  }

  @RequirePermissions("payments.read")
  @Get(":id")
  get(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
  ) {
    return this.payments.get(context, params.id);
  }

  @RequirePermissions("payments.record")
  @Post()
  create(
    @CurrentAuthorization() context: AuthorizationContext,
    @Headers("idempotency-key") idempotencyKey: string,
    @Body() input: CreatePaymentDto,
  ) {
    return this.payments.create(context, idempotencyKey, input);
  }

  @RequirePermissions("payments.settle")
  @Post(":id/settle")
  settle(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
    @Headers("idempotency-key") idempotencyKey: string,
    @Body() input: SettlePaymentDto,
  ) {
    return this.payments.settle(context, params.id, idempotencyKey, input);
  }

  @RequirePermissions("payments.reverse")
  @Post(":id/reverse")
  reverse(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
    @Headers("idempotency-key") idempotencyKey: string,
    @Body() input: ReversePaymentDto,
  ) {
    return this.payments.reverse(context, params.id, idempotencyKey, input);
  }
}
