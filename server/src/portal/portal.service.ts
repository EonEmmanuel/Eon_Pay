import { randomUUID } from "node:crypto";
import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { AuthorizationContext } from "../common/request-context.js";
import {
  claimIdempotencyKey,
  recordAudit,
  tenantIdFrom,
} from "../common/persistence.js";
import { DatabaseService } from "../database/database.service.js";
import { SupabaseStorageProvider } from "../providers/storage.provider.js";
import {
  customers,
  branches,
  catalogProducts,
  inventoryUnits,
  feeAssessments,
  financingContracts,
  installments,
  payments,
} from "../database/schema.js";
import type { CreateSelfPaymentDto } from "./portal.dto.js";
import type { CreateApplicationDto } from "../applications/applications.dto.js";
import {
  assertRequestedFinancingTerms,
  money,
  type DeviceSnapshot,
  type RequestedFinancingTerms,
} from "../domain/index.js";
import { financingApplications } from "../database/schema.js";

@Injectable()
export class PortalService {
  constructor(
    private readonly database: DatabaseService,
    private readonly storage: SupabaseStorageProvider,
  ) {}

  contracts(context: AuthorizationContext) {
    const tenantId = tenantIdFrom(context);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["self.contracts.read"],
      (transaction) =>
        transaction
          .select({ contract: financingContracts })
          .from(financingContracts)
          .innerJoin(
            customers,
            and(
              eq(customers.tenantId, financingContracts.tenantId),
              eq(customers.id, financingContracts.customerId),
            ),
          )
          .where(
            and(
              eq(financingContracts.tenantId, tenantId),
              eq(customers.userId, context.user.id),
            ),
          )
          .orderBy(desc(financingContracts.createdAt))
          .then((rows) => rows.map((row) => row.contract)),
    );
  }

  branches(context: AuthorizationContext) {
    const tenantId = tenantIdFrom(context);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["self.applications.create"],
      (transaction) =>
        transaction
          .select()
          .from(branches)
          .where(and(eq(branches.tenantId, tenantId), eq(branches.active, true)))
          .orderBy(asc(branches.name)),
    );
  }

  products(context: AuthorizationContext, branchId: string) {
    const tenantId = tenantIdFrom(context);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["self.applications.create"],
      (transaction) =>
        transaction
          .select({
            id: catalogProducts.id,
            sku: catalogProducts.sku,
            brand: catalogProducts.brand,
            model: catalogProducts.model,
            storage: catalogProducts.storage,
            color: catalogProducts.color,
            cashPrice: catalogProducts.cashPrice,
            imagePath: catalogProducts.imagePath,
            availableUnits: sql<number>`count(${inventoryUnits.id})::int`,
          })
          .from(catalogProducts)
          .innerJoin(
            inventoryUnits,
            and(
              eq(inventoryUnits.tenantId, catalogProducts.tenantId),
              eq(inventoryUnits.catalogProductId, catalogProducts.id),
              eq(inventoryUnits.branchId, branchId),
              eq(inventoryUnits.status, "available"),
            ),
          )
          .where(
            and(
              eq(catalogProducts.tenantId, tenantId),
              eq(catalogProducts.active, true),
            ),
          )
          .groupBy(catalogProducts.id)
          .orderBy(asc(catalogProducts.brand), asc(catalogProducts.model))
          .then((products) =>
            products.map((product) => ({
              ...product,
              imageUrl:
                product.imagePath === null
                  ? null
                  : this.storage.productImageUrl(product.imagePath),
            })),
          ),
    );
  }

  profile(context: AuthorizationContext) {
    const tenantId = tenantIdFrom(context);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["self.contracts.read"],
      async (transaction) => {
        const [profile] = await transaction
          .select()
          .from(customers)
          .where(
            and(
              eq(customers.tenantId, tenantId),
              eq(customers.userId, context.user.id),
            ),
          )
          .limit(1);
        if (profile === undefined) {
          throw new NotFoundException("Customer profile not found.");
        }
        return profile;
      },
    );
  }

  installments(context: AuthorizationContext, contractId: string) {
    const tenantId = tenantIdFrom(context);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["self.installments.read"],
      async (transaction) => {
        const rows = await transaction
          .select({ installment: installments })
          .from(installments)
          .innerJoin(
            financingContracts,
            and(
              eq(financingContracts.tenantId, installments.tenantId),
              eq(financingContracts.id, installments.contractId),
            ),
          )
          .innerJoin(
            customers,
            and(
              eq(customers.tenantId, financingContracts.tenantId),
              eq(customers.id, financingContracts.customerId),
            ),
          )
          .where(
            and(
              eq(installments.tenantId, tenantId),
              eq(installments.contractId, contractId),
              eq(customers.userId, context.user.id),
            ),
          )
          .orderBy(asc(installments.sequence));
        if (rows.length === 0) {
          throw new NotFoundException("Contract schedule not found for this customer.");
        }
        return rows.map((row) => row.installment);
      },
    );
  }

  payments(context: AuthorizationContext) {
    const tenantId = tenantIdFrom(context);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["self.payments.read"],
      (transaction) =>
        transaction
          .select({ payment: payments })
          .from(payments)
          .innerJoin(
            customers,
            and(
              eq(customers.tenantId, payments.tenantId),
              eq(customers.id, payments.customerId),
            ),
          )
          .where(
            and(eq(payments.tenantId, tenantId), eq(customers.userId, context.user.id)),
          )
          .orderBy(desc(payments.createdAt))
          .then((rows) => rows.map((row) => row.payment)),
    );
  }

  fees(context: AuthorizationContext) {
    const tenantId = tenantIdFrom(context);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["self.fees.read"],
      (transaction) =>
        transaction
          .select({ fee: feeAssessments })
          .from(feeAssessments)
          .innerJoin(
            financingContracts,
            and(
              eq(financingContracts.tenantId, feeAssessments.tenantId),
              eq(financingContracts.id, feeAssessments.contractId),
            ),
          )
          .innerJoin(
            customers,
            and(
              eq(customers.tenantId, financingContracts.tenantId),
              eq(customers.id, financingContracts.customerId),
            ),
          )
          .where(
            and(
              eq(feeAssessments.tenantId, tenantId),
              eq(customers.userId, context.user.id),
            ),
          )
          .orderBy(desc(feeAssessments.assessedAt))
          .then((rows) => rows.map((row) => row.fee)),
    );
  }

  createPayment(
    context: AuthorizationContext,
    idempotencyKey: string,
    input: CreateSelfPaymentDto,
  ) {
    const tenantId = tenantIdFrom(context);
    const paymentId = randomUUID();
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["self.payments.create"],
      async (transaction) => {
        const claim = await claimIdempotencyKey(
          transaction,
          tenantId,
          "self.payments.create",
          idempotencyKey,
          input,
          "payment",
          paymentId,
        );
        if (claim.replay) {
          const [existing] = await transaction
            .select()
            .from(payments)
            .where(
              and(eq(payments.tenantId, tenantId), eq(payments.id, claim.resourceId)),
            )
            .limit(1);
          return existing;
        }
        const [owner] = await transaction
          .select({
            customerId: customers.id,
            contractStatus: financingContracts.status,
          })
          .from(financingContracts)
          .innerJoin(
            customers,
            and(
              eq(customers.tenantId, financingContracts.tenantId),
              eq(customers.id, financingContracts.customerId),
            ),
          )
          .where(
            and(
              eq(financingContracts.tenantId, tenantId),
              eq(financingContracts.id, input.contractId),
              eq(customers.userId, context.user.id),
            ),
          )
          .limit(1);
        if (owner === undefined) {
          throw new NotFoundException("Customer contract not found.");
        }
        if (!["active", "past_due", "suspended"].includes(owner.contractStatus)) {
          throw new ConflictException("Contract is not accepting payments.");
        }
        const [payment] = await transaction
          .insert(payments)
          .values({
            id: paymentId,
            tenantId,
            customerId: owner.customerId,
            contractId: input.contractId,
            amount: input.amountMinorUnits,
            channel: input.channel,
            provider: input.channel,
            externalReference: randomUUID(),
            idempotencyKey,
            status: "pending",
          })
          .returning();
        await recordAudit(
          transaction,
          context,
          "payment.customer_initiated",
          "payment",
          paymentId,
          {
            channel: input.channel,
            amountMinorUnits: input.amountMinorUnits,
          },
        );
        return payment;
      },
    );
  }

  applications(context: AuthorizationContext) {
    const tenantId = tenantIdFrom(context);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["self.applications.read"],
      (transaction) =>
        transaction
          .select({ application: financingApplications })
          .from(financingApplications)
          .innerJoin(
            customers,
            and(
              eq(customers.tenantId, financingApplications.tenantId),
              eq(customers.id, financingApplications.customerId),
            ),
          )
          .where(
            and(
              eq(financingApplications.tenantId, tenantId),
              eq(customers.userId, context.user.id),
            ),
          )
          .orderBy(desc(financingApplications.createdAt))
          .then((rows) => rows.map((row) => row.application)),
    );
  }

  createApplication(context: AuthorizationContext, input: CreateApplicationDto) {
    const tenantId = tenantIdFrom(context);
    const requestedTerms: RequestedFinancingTerms = {
      currency: "XAF",
      deviceCashPrice: money(input.requestedTerms.deviceCashPriceMinorUnits),
      proposedDownPayment: money(input.requestedTerms.proposedDownPaymentMinorUnits),
      requestedInstallmentCount: input.requestedTerms.requestedInstallmentCount,
      requestedRepaymentFrequency: input.requestedTerms.requestedRepaymentFrequency,
    };
    assertRequestedFinancingTerms(requestedTerms);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["self.applications.create"],
      async (transaction) => {
        const [customer] = await transaction
          .select({ id: customers.id })
          .from(customers)
          .where(
            and(
              eq(customers.tenantId, tenantId),
              eq(customers.userId, context.user.id),
            ),
          )
          .limit(1);
        if (customer === undefined) {
          throw new NotFoundException("Customer profile not found.");
        }
        const [activeBranch] = await transaction
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
        if (activeBranch === undefined) {
          throw new NotFoundException("Active retailer branch not found.");
        }
        const [product] = await transaction
          .select()
          .from(catalogProducts)
          .where(
            and(
              eq(catalogProducts.tenantId, tenantId),
              eq(catalogProducts.id, input.catalogProductId),
              eq(catalogProducts.active, true),
            ),
          )
          .limit(1);
        if (product === undefined) {
          throw new NotFoundException("Available catalog product not found.");
        }
        if (requestedTerms.deviceCashPrice.minorUnits !== product.cashPrice) {
          throw new ConflictException(
            "The requested cash price must match the current catalog price.",
          );
        }
        const [availableUnit] = await transaction
          .select({ id: inventoryUnits.id })
          .from(inventoryUnits)
          .where(
            and(
              eq(inventoryUnits.tenantId, tenantId),
              eq(inventoryUnits.branchId, input.branchId),
              eq(inventoryUnits.catalogProductId, product.id),
              eq(inventoryUnits.status, "available"),
            ),
          )
          .limit(1);
        if (availableUnit === undefined) {
          throw new ConflictException(
            "This product is not available at the selected branch.",
          );
        }
        const device: DeviceSnapshot = {
          deviceId: product.id as DeviceSnapshot["deviceId"],
          sku: product.sku,
          brand: product.brand,
          model: product.model,
          storage: product.storage,
          color: product.color,
        };
        const [application] = await transaction
          .insert(financingApplications)
          .values({
            tenantId,
            branchId: input.branchId,
            customerId: customer.id,
            applicant: input.applicant,
            catalogProductId: product.id,
            device,
            requestedTerms,
            status: "submitted",
            submittedAt: new Date().toISOString(),
          })
          .returning();
        await recordAudit(
          transaction,
          context,
          "application.customer_submitted",
          "application",
          application?.id,
        );
        return application;
      },
    );
  }
}
