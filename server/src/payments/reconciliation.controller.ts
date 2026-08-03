import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiTags } from "@nestjs/swagger";
import { CurrentAuthorization, RequirePermissions } from "../common/decorators.js";
import type { AuthorizationContext } from "../common/request-context.js";
import { IdParamDto } from "../common/validation.js";
import { CreateReconciliationRunDto } from "./reconciliation.dto.js";
import { ReconciliationService } from "./reconciliation.service.js";

@ApiTags("payment reconciliation")
@ApiBearerAuth()
@ApiHeader({ name: "X-Tenant-Id", required: true })
@RequirePermissions("payments.reconcile")
@Controller("reconciliation/runs")
export class ReconciliationController {
  constructor(private readonly reconciliation: ReconciliationService) {}

  @Get()
  list(@CurrentAuthorization() context: AuthorizationContext) {
    return this.reconciliation.list(context);
  }

  @Get(":id")
  get(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
  ) {
    return this.reconciliation.get(context, params.id);
  }

  @Post()
  create(
    @CurrentAuthorization() context: AuthorizationContext,
    @Headers("idempotency-key") idempotencyKey: string,
    @Body() input: CreateReconciliationRunDto,
  ) {
    return this.reconciliation.create(context, idempotencyKey, input);
  }
}
