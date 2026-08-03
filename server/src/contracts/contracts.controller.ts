import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiTags } from "@nestjs/swagger";
import { CurrentAuthorization, RequirePermissions } from "../common/decorators.js";
import type { AuthorizationContext } from "../common/request-context.js";
import { IdParamDto } from "../common/validation.js";
import {
  ActivateContractDto,
  CreateContractDto,
  TransitionContractDto,
} from "./contracts.dto.js";
import { ContractsService } from "./contracts.service.js";

@ApiTags("contracts")
@ApiBearerAuth()
@ApiHeader({ name: "X-Tenant-Id", required: true })
@Controller("contracts")
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}

  @RequirePermissions("contracts.read")
  @Get()
  list(@CurrentAuthorization() context: AuthorizationContext) {
    return this.contracts.list(context);
  }

  @RequirePermissions("contracts.read")
  @Get(":id")
  get(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
  ) {
    return this.contracts.get(context, params.id);
  }

  @RequirePermissions("installments.read")
  @Get(":id/installments")
  schedule(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
  ) {
    return this.contracts.schedule(context, params.id);
  }

  @RequirePermissions("contracts.create")
  @Post("from-application")
  create(
    @CurrentAuthorization() context: AuthorizationContext,
    @Body() input: CreateContractDto,
  ) {
    return this.contracts.createFromApplication(context, input);
  }

  @RequirePermissions("contracts.activate", "devices.read", "inventory.stock.manage")
  @Post(":id/activate")
  activate(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
    @Body() input: ActivateContractDto,
  ) {
    return this.contracts.activate(context, params.id, input);
  }

  @RequirePermissions("contracts.transition")
  @Post(":id/transition")
  transition(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
    @Body() input: TransitionContractDto,
  ) {
    return this.contracts.transition(context, params.id, input);
  }
}
