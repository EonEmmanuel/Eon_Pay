import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiTags } from "@nestjs/swagger";
import { CurrentAuthorization, RequirePermissions } from "../common/decorators.js";
import type { AuthorizationContext } from "../common/request-context.js";
import { IdParamDto } from "../common/validation.js";
import { AssessFeeDto, WaiveFeeDto } from "./fees.dto.js";
import { FeesService } from "./fees.service.js";

@ApiTags("fees")
@ApiBearerAuth()
@ApiHeader({ name: "X-Tenant-Id", required: true })
@Controller("fees")
export class FeesController {
  constructor(private readonly fees: FeesService) {}

  @RequirePermissions("fees.read")
  @Get()
  list(@CurrentAuthorization() context: AuthorizationContext) {
    return this.fees.list(context);
  }

  @RequirePermissions("fees.assess")
  @Post()
  assess(
    @CurrentAuthorization() context: AuthorizationContext,
    @Headers("idempotency-key") idempotencyKey: string,
    @Body() input: AssessFeeDto,
  ) {
    return this.fees.assess(context, idempotencyKey, input);
  }

  @RequirePermissions("fees.waive")
  @Post(":id/waive")
  waive(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
    @Headers("idempotency-key") idempotencyKey: string,
    @Body() input: WaiveFeeDto,
  ) {
    return this.fees.waive(context, params.id, idempotencyKey, input);
  }
}
