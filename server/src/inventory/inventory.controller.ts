import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiTags } from "@nestjs/swagger";
import { CurrentAuthorization, RequirePermissions } from "../common/decorators.js";
import type { AuthorizationContext } from "../common/request-context.js";
import { IdParamDto } from "../common/validation.js";
import {
  ConfirmProductImageDto,
  CreateCatalogProductDto,
  CreateInventoryUnitDto,
  InventoryQueryDto,
  ProductImageUploadDto,
  UpdateCatalogProductDto,
  UpdateInventoryUnitDto,
} from "./inventory.dto.js";
import { InventoryService } from "./inventory.service.js";

@ApiTags("retail inventory")
@ApiBearerAuth()
@ApiHeader({ name: "X-Tenant-Id", required: true })
@Controller("inventory")
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @RequirePermissions("inventory.read")
  @Get("products")
  products(
    @CurrentAuthorization() context: AuthorizationContext,
    @Query() query: InventoryQueryDto,
  ) {
    return this.inventory.products(context, query);
  }

  @RequirePermissions("inventory.read")
  @Get("units")
  units(
    @CurrentAuthorization() context: AuthorizationContext,
    @Query() query: InventoryQueryDto,
  ) {
    return this.inventory.units(context, query);
  }

  @RequirePermissions("inventory.catalog.manage")
  @Post("products")
  createProduct(
    @CurrentAuthorization() context: AuthorizationContext,
    @Body() input: CreateCatalogProductDto,
  ) {
    return this.inventory.createProduct(context, input);
  }

  @RequirePermissions("inventory.catalog.manage")
  @Patch("products/:id")
  updateProduct(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
    @Body() input: UpdateCatalogProductDto,
  ) {
    return this.inventory.updateProduct(context, params.id, input);
  }

  @RequirePermissions("inventory.catalog.manage")
  @Post("products/:id/image-upload")
  requestProductImage(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
    @Body() input: ProductImageUploadDto,
  ) {
    return this.inventory.requestProductImage(context, params.id, input);
  }

  @RequirePermissions("inventory.catalog.manage")
  @Post("products/:id/image-confirm")
  confirmProductImage(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
    @Body() input: ConfirmProductImageDto,
  ) {
    return this.inventory.confirmProductImage(context, params.id, input);
  }

  @RequirePermissions("inventory.stock.manage")
  @Post("units")
  createUnit(
    @CurrentAuthorization() context: AuthorizationContext,
    @Body() input: CreateInventoryUnitDto,
  ) {
    return this.inventory.createUnit(context, input);
  }

  @RequirePermissions("inventory.stock.manage")
  @Patch("units/:id")
  updateUnit(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
    @Body() input: UpdateInventoryUnitDto,
  ) {
    return this.inventory.updateUnit(context, params.id, input);
  }
}
