import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, sql } from "drizzle-orm";
import type { AuthorizationContext } from "../common/request-context.js";
import { recordAudit, tenantIdFrom } from "../common/persistence.js";
import { DatabaseService } from "../database/database.service.js";
import {
  branches,
  catalogProducts,
  customers,
  financingApplications,
  inventoryUnits,
} from "../database/schema.js";
import {
  assertFinancingTerms,
  assertRequestedFinancingTerms,
  money,
  type DeviceSnapshot,
  type FinancingTerms,
  type RequestedFinancingTerms,
} from "../domain/index.js";
import type {
  ApprovedTermsDto,
  CreateApplicationDto,
  DecideApplicationDto,
  ReviewKycDto,
} from "./applications.dto.js";

@Injectable()
export class ApplicationsService {
  constructor(private readonly database: DatabaseService) {}

  list(context: AuthorizationContext) {
    const tenantId = tenantIdFrom(context);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["applications.read"],
      (transaction) =>
        transaction
          .select()
          .from(financingApplications)
          .where(eq(financingApplications.tenantId, tenantId))
          .orderBy(desc(financingApplications.createdAt)),
    );
  }

  get(context: AuthorizationContext, applicationId: string) {
    const tenantId = tenantIdFrom(context);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["applications.read"],
      async (transaction) => {
        const [application] = await transaction
          .select()
          .from(financingApplications)
          .where(
            and(
              eq(financingApplications.tenantId, tenantId),
              eq(financingApplications.id, applicationId),
            ),
          )
          .limit(1);
        if (application === undefined) {
          throw new NotFoundException("Application not found.");
        }
        return application;
      },
    );
  }

  create(context: AuthorizationContext, input: CreateApplicationDto) {
    const tenantId = tenantIdFrom(context);
    const requestedTerms = this.requestedTerms(input);
    assertRequestedFinancingTerms(requestedTerms);

    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["applications.create", "customers.create", "customers.read"],
      async (transaction) => {
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
          throw new NotFoundException(
            "Active branch not found or is outside your access.",
          );
        }
        let customerId = input.customerId;
        if (customerId !== undefined) {
          const [customer] = await transaction
            .select({ id: customers.id, phone: customers.phone })
            .from(customers)
            .where(and(eq(customers.tenantId, tenantId), eq(customers.id, customerId)))
            .limit(1);
          if (customer === undefined) {
            throw new NotFoundException(
              "Customer not found or is outside your branch access.",
            );
          }
          if (customer.phone !== input.applicant.phone) {
            throw new ConflictException(
              "The applicant phone must match the selected customer.",
            );
          }
        } else {
          const [existingCustomer] = await transaction
            .select({ id: customers.id })
            .from(customers)
            .where(
              and(
                eq(customers.tenantId, tenantId),
                eq(customers.phone, input.applicant.phone),
              ),
            )
            .limit(1);
          if (existingCustomer !== undefined) {
            customerId = existingCustomer.id;
          } else {
            const [createdCustomer] = await transaction
              .insert(customers)
              .values({
                tenantId,
                branchId: input.branchId,
                fullName: input.applicant.fullName.trim(),
                phone: input.applicant.phone,
                email: input.applicant.email?.trim(),
                nationalIdReference: input.applicant.nationalIdReference?.trim(),
              })
              .returning({ id: customers.id });
            if (createdCustomer === undefined) {
              throw new ConflictException("Customer could not be created.");
            }
            customerId = createdCustomer.id;
            await recordAudit(
              transaction,
              context,
              "customer.created",
              "customer",
              createdCustomer.id,
              { branchId: input.branchId, source: "financing_application" },
            );
          }
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
          throw new NotFoundException("Active catalog product not found.");
        }
        if (requestedTerms.deviceCashPrice.minorUnits !== product.cashPrice) {
          throw new ConflictException(
            "The requested cash price must match the current catalog price.",
          );
        }
        const [available] = await transaction
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
        if (available === undefined) {
          throw new ConflictException(
            "This product is not currently available at the selected branch.",
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
            customerId,
            catalogProductId: product.id,
            applicant: input.applicant,
            device,
            requestedTerms,
          })
          .returning();
        await recordAudit(
          transaction,
          context,
          "application.created",
          "application",
          application?.id,
        );
        return application;
      },
    );
  }

  submit(context: AuthorizationContext, applicationId: string) {
    const tenantId = tenantIdFrom(context);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["applications.submit"],
      async (transaction) => {
        const [application] = await transaction
          .update(financingApplications)
          .set({
            status: "submitted",
            submittedAt: new Date().toISOString(),
            version: sql`${financingApplications.version} + 1`,
          })
          .where(
            and(
              eq(financingApplications.tenantId, tenantId),
              eq(financingApplications.id, applicationId),
              eq(financingApplications.status, "draft"),
            ),
          )
          .returning();
        if (application === undefined) {
          throw new ConflictException("Only a draft application can be submitted.");
        }
        await recordAudit(
          transaction,
          context,
          "application.submitted",
          "application",
          application.id,
        );
        return application;
      },
    );
  }

  reviewKyc(context: AuthorizationContext, applicationId: string, input: ReviewKycDto) {
    const tenantId = tenantIdFrom(context);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["applications.review"],
      async (transaction) => {
        const [current] = await transaction
          .select()
          .from(financingApplications)
          .where(
            and(
              eq(financingApplications.tenantId, tenantId),
              eq(financingApplications.id, applicationId),
            ),
          )
          .limit(1);
        if (current === undefined) {
          throw new NotFoundException("Application not found.");
        }
        if (!["submitted", "kyc_review"].includes(current.status)) {
          throw new ConflictException(
            "KYC can only be reviewed for a submitted application.",
          );
        }

        const nextStatus = input.status === "verified" ? "credit_review" : "kyc_review";
        const [application] = await transaction
          .update(financingApplications)
          .set({
            kycStatus: input.status,
            status: nextStatus,
            version: sql`${financingApplications.version} + 1`,
          })
          .where(
            and(
              eq(financingApplications.tenantId, tenantId),
              eq(financingApplications.id, applicationId),
              eq(financingApplications.version, current.version),
            ),
          )
          .returning();
        if (application === undefined) {
          throw new ConflictException("Application changed concurrently.");
        }
        await recordAudit(
          transaction,
          context,
          "application.kyc_reviewed",
          "application",
          application.id,
          { kycStatus: input.status },
        );
        return application;
      },
    );
  }

  decide(
    context: AuthorizationContext,
    applicationId: string,
    input: DecideApplicationDto,
  ) {
    const tenantId = tenantIdFrom(context);
    const approvedTerms =
      input.approvedTerms === undefined
        ? undefined
        : this.approvedTerms(input.approvedTerms);
    if (input.outcome === "approved" && approvedTerms === undefined) {
      throw new BadRequestException("Approved terms are required for an approval.");
    }
    if (input.outcome === "rejected" && approvedTerms !== undefined) {
      throw new BadRequestException("Approved terms must not accompany a rejection.");
    }
    if (approvedTerms !== undefined) {
      assertFinancingTerms(approvedTerms);
    }

    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["applications.review"],
      async (transaction) => {
        const [current] = await transaction
          .select()
          .from(financingApplications)
          .where(
            and(
              eq(financingApplications.tenantId, tenantId),
              eq(financingApplications.id, applicationId),
            ),
          )
          .limit(1);
        if (current === undefined) {
          throw new NotFoundException("Application not found.");
        }
        const canDecide =
          input.outcome === "approved"
            ? current.status === "credit_review" && current.kycStatus === "verified"
            : ["kyc_review", "credit_review"].includes(current.status);
        if (!canDecide) {
          throw new ConflictException(
            "Application is not in a state that permits this decision.",
          );
        }

        const now = new Date().toISOString();
        const [application] = await transaction
          .update(financingApplications)
          .set({
            status: input.outcome,
            approvedTerms,
            decisionOutcome: input.outcome,
            decisionReasonCode: input.reasonCode,
            decisionNotes: input.notes,
            decidedBy: context.user.id,
            decidedAt: now,
            version: sql`${financingApplications.version} + 1`,
          })
          .where(
            and(
              eq(financingApplications.tenantId, tenantId),
              eq(financingApplications.id, applicationId),
              eq(financingApplications.version, current.version),
            ),
          )
          .returning();
        if (application === undefined) {
          throw new ConflictException("Application changed concurrently.");
        }
        await recordAudit(
          transaction,
          context,
          `application.${input.outcome}`,
          "application",
          application.id,
          { reasonCode: input.reasonCode },
        );
        return application;
      },
    );
  }

  private requestedTerms(input: CreateApplicationDto): RequestedFinancingTerms {
    return {
      currency: "XAF",
      deviceCashPrice: money(input.requestedTerms.deviceCashPriceMinorUnits),
      proposedDownPayment: money(input.requestedTerms.proposedDownPaymentMinorUnits),
      requestedInstallmentCount: input.requestedTerms.requestedInstallmentCount,
      requestedRepaymentFrequency: input.requestedTerms.requestedRepaymentFrequency,
    };
  }

  private approvedTerms(input: ApprovedTermsDto): FinancingTerms {
    return {
      currency: "XAF",
      deviceCashPrice: money(input.deviceCashPriceMinorUnits),
      downPayment: money(input.downPaymentMinorUnits),
      financedPrincipal: money(input.financedPrincipalMinorUnits),
      financeCharge: money(input.financeChargeMinorUnits),
      installmentCount: input.installmentCount,
      repaymentFrequency: input.repaymentFrequency,
      firstDueDate: input.firstDueDate as FinancingTerms["firstDueDate"],
      gracePeriodDays: input.gracePeriodDays,
    };
  }
}
