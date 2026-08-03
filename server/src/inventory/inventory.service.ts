import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { AuthorizationContext } from "../common/request-context.js";
import { recordAudit, tenantIdFrom } from "../common/persistence.js";
import { DatabaseService } from "../database/database.service.js";
import { SupabaseStorageProvider } from "../providers/storage.provider.js";
import { branches, catalogProducts, inventoryUnits } from "../database/schema.js";
import type {
  CreateCatalogProductDto,
  ConfirmProductImageDto,
  CreateInventoryUnitDto,
  InventoryQueryDto,
  ProductImageUploadDto,
  UpdateCatalogProductDto,
  UpdateInventoryUnitDto,
} from "./inventory.dto.js";

@Injectable()
export class InventoryService {
  constructor(
    private readonly database: DatabaseService,
    private readonly storage: SupabaseStorageProvider,
  ) {}

  products(context: AuthorizationContext, query: InventoryQueryDto) {
    const tenantId = tenantIdFrom(context);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["inventory.read"],
      async (transaction) => {
        const products = await transaction
          .select()
          .from(catalogProducts)
          .where(eq(catalogProducts.tenantId, tenantId))
          .orderBy(asc(catalogProducts.brand), asc(catalogProducts.model));
        const unitConditions = [
          eq(inventoryUnits.tenantId, tenantId),
          eq(inventoryUnits.status, "available"),
        ];
        if (query.branchId !== undefined) {
          unitConditions.push(eq(inventoryUnits.branchId, query.branchId));
        }
        const available = await transaction
          .select({
            catalogProductId: inventoryUnits.catalogProductId,
            count: sql<number>`count(*)::int`,
          })
          .from(inventoryUnits)
          .where(and(...unitConditions))
          .groupBy(inventoryUnits.catalogProductId);
        const countByProduct = new Map(
          available.map((row) => [row.catalogProductId, row.count]),
        );
        return products.map((product) => ({
          ...this.presentProduct(product),
          availableUnits: countByProduct.get(product.id) ?? 0,
        }));
      },
    );
  }

  units(context: AuthorizationContext, query: InventoryQueryDto) {
    const tenantId = tenantIdFrom(context);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["inventory.read"],
      (transaction) =>
        transaction
          .select({
            unit: inventoryUnits,
            product: catalogProducts,
            branchName: branches.name,
          })
          .from(inventoryUnits)
          .innerJoin(
            catalogProducts,
            and(
              eq(catalogProducts.tenantId, inventoryUnits.tenantId),
              eq(catalogProducts.id, inventoryUnits.catalogProductId),
            ),
          )
          .innerJoin(
            branches,
            and(
              eq(branches.tenantId, inventoryUnits.tenantId),
              eq(branches.id, inventoryUnits.branchId),
            ),
          )
          .where(
            and(
              eq(inventoryUnits.tenantId, tenantId),
              ...(query.branchId === undefined
                ? []
                : [eq(inventoryUnits.branchId, query.branchId)]),
            ),
          )
          .orderBy(desc(inventoryUnits.createdAt))
          .then((rows) =>
            rows.map(({ unit, product, branchName }) => ({
              ...unit,
              product: { ...this.presentProduct(product), availableUnits: 0 },
              branch: { id: unit.branchId, name: branchName },
            })),
          ),
    );
  }

  createProduct(context: AuthorizationContext, input: CreateCatalogProductDto) {
    const tenantId = tenantIdFrom(context);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["inventory.catalog.manage"],
      async (transaction) => {
        const [product] = await transaction
          .insert(catalogProducts)
          .values({
            tenantId,
            sku: input.sku.trim().toUpperCase(),
            brand: input.brand.trim(),
            model: input.model.trim(),
            storage: input.storage.trim(),
            color: input.color.trim(),
            cashPrice: input.cashPriceMinorUnits,
          })
          .returning();
        await recordAudit(
          transaction,
          context,
          "inventory.product_created",
          "catalog_product",
          product?.id,
          {
            sku: product?.sku,
          },
        );
        return product === undefined ? product : this.presentProduct(product);
      },
    );
  }

  updateProduct(
    context: AuthorizationContext,
    productId: string,
    input: UpdateCatalogProductDto,
  ) {
    const tenantId = tenantIdFrom(context);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["inventory.catalog.manage"],
      async (transaction) => {
        const [product] = await transaction
          .update(catalogProducts)
          .set({
            sku: input.sku?.trim().toUpperCase(),
            brand: input.brand?.trim(),
            model: input.model?.trim(),
            storage: input.storage?.trim(),
            color: input.color?.trim(),
            cashPrice: input.cashPriceMinorUnits,
            active: input.active,
            version: sql`${catalogProducts.version} + 1`,
          })
          .where(
            and(
              eq(catalogProducts.tenantId, tenantId),
              eq(catalogProducts.id, productId),
              eq(catalogProducts.version, input.version),
            ),
          )
          .returning();
        if (product === undefined) {
          throw new ConflictException(
            "Product changed concurrently or is no longer available.",
          );
        }
        await recordAudit(
          transaction,
          context,
          "inventory.product_updated",
          "catalog_product",
          product.id,
          {
            sku: product.sku,
            active: product.active,
          },
        );
        return this.presentProduct(product);
      },
    );
  }

  async requestProductImage(
    context: AuthorizationContext,
    productId: string,
    input: ProductImageUploadDto,
  ) {
    const tenantId = tenantIdFrom(context);
    await this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["inventory.catalog.manage"],
      async (transaction) => {
        const [product] = await transaction
          .select({ id: catalogProducts.id })
          .from(catalogProducts)
          .where(
            and(
              eq(catalogProducts.tenantId, tenantId),
              eq(catalogProducts.id, productId),
            ),
          )
          .limit(1);
        if (product === undefined) throw new NotFoundException("Product not found.");
        await recordAudit(
          transaction,
          context,
          "inventory.product_image_upload_requested",
          "catalog_product",
          productId,
          { mimeType: input.mimeType, sizeBytes: input.sizeBytes },
        );
      },
    );
    const extension = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    }[input.mimeType];
    const objectKey = `${tenantId}/catalog/${productId}/${randomUUID()}.${extension}`;
    const upload = await this.storage.createProductImageUploadUrl({
      objectKey,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      sha256Hex: input.sha256,
    });
    return { objectKey, upload };
  }

  async confirmProductImage(
    context: AuthorizationContext,
    productId: string,
    input: ConfirmProductImageDto,
  ) {
    const tenantId = tenantIdFrom(context);
    const expectedPrefix = `${tenantId}/catalog/${productId}/`;
    if (!input.objectKey.startsWith(expectedPrefix)) {
      throw new ConflictException(
        "Product image path is outside the authorized scope.",
      );
    }
    const metadata = await this.storage.headProductImage(input.objectKey);
    const expectedChecksum = Buffer.from(input.sha256, "hex").toString("base64");
    if (
      metadata.contentLength !== input.sizeBytes ||
      metadata.contentType !== input.mimeType ||
      metadata.sha256Metadata !== input.sha256 ||
      (metadata.checksumSha256 !== undefined &&
        metadata.checksumSha256 !== expectedChecksum)
    ) {
      throw new ConflictException(
        "Uploaded image metadata does not match the authorized upload.",
      );
    }
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["inventory.catalog.manage"],
      async (transaction) => {
        const [product] = await transaction
          .update(catalogProducts)
          .set({
            imagePath: input.objectKey,
            version: sql`${catalogProducts.version} + 1`,
          })
          .where(
            and(
              eq(catalogProducts.tenantId, tenantId),
              eq(catalogProducts.id, productId),
            ),
          )
          .returning();
        if (product === undefined) throw new NotFoundException("Product not found.");
        await recordAudit(
          transaction,
          context,
          "inventory.product_image_updated",
          "catalog_product",
          productId,
          { objectKey: input.objectKey },
        );
        return this.presentProduct(product);
      },
    );
  }

  createUnit(context: AuthorizationContext, input: CreateInventoryUnitDto) {
    const tenantId = tenantIdFrom(context);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["inventory.stock.manage"],
      async (transaction) => {
        const [product] = await transaction
          .select({ id: catalogProducts.id })
          .from(catalogProducts)
          .where(
            and(
              eq(catalogProducts.tenantId, tenantId),
              eq(catalogProducts.id, input.catalogProductId),
              eq(catalogProducts.active, true),
            ),
          )
          .limit(1);
        const [branch] = await transaction
          .select({ id: branches.id })
          .from(branches)
          .where(
            and(
              eq(branches.tenantId, tenantId),
              eq(branches.id, input.branchId),
              eq(branches.active, true),
            ),
          )
          .limit(1);
        if (product === undefined || branch === undefined) {
          throw new NotFoundException("Active branch or catalog product not found.");
        }
        const [unit] = await transaction
          .insert(inventoryUnits)
          .values({
            tenantId,
            branchId: input.branchId,
            catalogProductId: input.catalogProductId,
            imei: input.imei,
            serialNumber: input.serialNumber?.trim() || undefined,
          })
          .returning();
        await recordAudit(
          transaction,
          context,
          "inventory.unit_received",
          "inventory_unit",
          unit?.id,
          {
            branchId: input.branchId,
            catalogProductId: input.catalogProductId,
            imei: input.imei,
          },
        );
        return unit;
      },
    );
  }

  updateUnit(
    context: AuthorizationContext,
    unitId: string,
    input: UpdateInventoryUnitDto,
  ) {
    const tenantId = tenantIdFrom(context);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["inventory.stock.manage"],
      async (transaction) => {
        const [current] = await transaction
          .select()
          .from(inventoryUnits)
          .where(
            and(eq(inventoryUnits.tenantId, tenantId), eq(inventoryUnits.id, unitId)),
          )
          .for("update")
          .limit(1);
        if (current === undefined)
          throw new NotFoundException("Inventory unit not found.");
        if (["reserved", "financed"].includes(current.status)) {
          throw new ConflictException(
            "Reserved or financed stock cannot be edited manually.",
          );
        }
        const [unit] = await transaction
          .update(inventoryUnits)
          .set({
            status: input.status ?? current.status,
            imei: input.imei ?? current.imei,
            serialNumber:
              input.serialNumber === undefined
                ? current.serialNumber
                : input.serialNumber.trim() || null,
            reservedApplicationId: null,
            contractId: null,
            version: sql`${inventoryUnits.version} + 1`,
          })
          .where(
            and(
              eq(inventoryUnits.tenantId, tenantId),
              eq(inventoryUnits.id, unitId),
              eq(inventoryUnits.version, input.version),
            ),
          )
          .returning();
        if (unit === undefined)
          throw new ConflictException("Inventory unit changed concurrently.");
        await recordAudit(
          transaction,
          context,
          "inventory.unit_updated",
          "inventory_unit",
          unit.id,
          {
            status: { from: current.status, to: unit.status },
            imeiChanged: current.imei !== unit.imei,
            serialNumberChanged: current.serialNumber !== unit.serialNumber,
          },
        );
        return unit;
      },
    );
  }
  private presentProduct(product: typeof catalogProducts.$inferSelect) {
    return {
      ...product,
      imageUrl:
        product.imagePath === null
          ? null
          : this.storage.productImageUrl(product.imagePath),
    };
  }
}
