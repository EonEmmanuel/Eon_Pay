import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { AuthorizationContext } from "../common/request-context.js";
import {
  claimIdempotencyKey,
  recordAudit,
  tenantIdFrom,
} from "../common/persistence.js";
import { DatabaseService } from "../database/database.service.js";
import {
  feeAssessments,
  financingContracts,
  installments,
  journalEntries,
  journalLines,
  ledgerAccounts,
  paymentAllocations,
  payments,
} from "../database/schema.js";
import type {
  CreatePaymentDto,
  PaymentAllocationDto,
  ReversePaymentDto,
  SettlePaymentDto,
} from "./payments.dto.js";

const channelAccount: Record<CreatePaymentDto["channel"], string> = {
  cash: "CASH",
  mtn_momo: "MOBILE_MONEY_CLEARING",
  orange_money: "MOBILE_MONEY_CLEARING",
  bank_transfer: "BANK_CLEARING",
  card: "CARD_CLEARING",
  ussd: "MOBILE_MONEY_CLEARING",
};
const targetAccount: Record<PaymentAllocationDto["targetType"], string> = {
  down_payment: "DOWN_PAYMENT_RECEIVABLE",
  installment_principal: "PRINCIPAL_RECEIVABLE",
  installment_finance_charge: "FINANCE_CHARGE_RECEIVABLE",
  fee: "FEE_RECEIVABLE",
  unapplied_credit: "UNAPPLIED_CREDIT",
};

@Injectable()
export class PaymentsService {
  constructor(private readonly database: DatabaseService) {}

  list(context: AuthorizationContext) {
    const tenantId = tenantIdFrom(context);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["payments.read"],
      (transaction) =>
        transaction
          .select()
          .from(payments)
          .where(eq(payments.tenantId, tenantId))
          .orderBy(desc(payments.createdAt)),
    );
  }

  get(context: AuthorizationContext, paymentId: string) {
    const tenantId = tenantIdFrom(context);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["payments.read"],
      async (transaction) => {
        const [payment] = await transaction
          .select()
          .from(payments)
          .where(and(eq(payments.tenantId, tenantId), eq(payments.id, paymentId)))
          .limit(1);
        if (payment === undefined) {
          throw new NotFoundException("Payment not found.");
        }
        const allocations = await transaction
          .select()
          .from(paymentAllocations)
          .where(
            and(
              eq(paymentAllocations.tenantId, tenantId),
              eq(paymentAllocations.paymentId, paymentId),
            ),
          );
        return { ...payment, allocations };
      },
    );
  }

  create(
    context: AuthorizationContext,
    idempotencyKey: string,
    input: CreatePaymentDto,
  ) {
    const tenantId = tenantIdFrom(context);
    const paymentId = randomUUID();
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["payments.record"],
      async (transaction) => {
        const claim = await claimIdempotencyKey(
          transaction,
          tenantId,
          "payments.create",
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

        if (input.channel !== "cash") {
          if (input.provider === undefined || input.externalReference === undefined) {
            throw new BadRequestException(
              "Provider and externalReference are required for non-cash payments.",
            );
          }
          if (
            ["mtn_momo", "orange_money"].includes(input.channel) &&
            input.provider !== input.channel
          ) {
            throw new BadRequestException(
              "Mobile-money provider must match the payment channel.",
            );
          }
        }
        if (input.contractId !== undefined) {
          const [contract] = await transaction
            .select({
              customerId: financingContracts.customerId,
              status: financingContracts.status,
            })
            .from(financingContracts)
            .where(
              and(
                eq(financingContracts.tenantId, tenantId),
                eq(financingContracts.id, input.contractId),
              ),
            )
            .limit(1);
          if (contract === undefined || contract.customerId !== input.customerId) {
            throw new BadRequestException(
              "Payment contract must belong to the payment customer.",
            );
          }
          if (!["active", "past_due", "suspended"].includes(contract.status)) {
            throw new ConflictException(
              "Payments can only target an active servicing contract.",
            );
          }
        }

        const [payment] = await transaction
          .insert(payments)
          .values({
            id: paymentId,
            tenantId,
            customerId: input.customerId,
            contractId: input.contractId,
            amount: input.amountMinorUnits,
            channel: input.channel,
            idempotencyKey,
            provider: input.provider,
            externalReference: input.externalReference,
          })
          .returning();
        await recordAudit(
          transaction,
          context,
          "payment.recorded",
          "payment",
          payment?.id,
          { amountMinorUnits: input.amountMinorUnits, channel: input.channel },
        );
        return payment;
      },
    );
  }

  settle(
    context: AuthorizationContext,
    paymentId: string,
    idempotencyKey: string,
    input: SettlePaymentDto,
  ) {
    const tenantId = tenantIdFrom(context);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["payments.settle"],
      async (transaction) => {
        const claim = await claimIdempotencyKey(
          transaction,
          tenantId,
          "payments.settle",
          idempotencyKey,
          { paymentId, ...input },
          "payment",
          paymentId,
        );
        const [payment] = await transaction
          .select()
          .from(payments)
          .where(and(eq(payments.tenantId, tenantId), eq(payments.id, paymentId)))
          .for("update")
          .limit(1);
        if (payment === undefined) {
          throw new NotFoundException("Payment not found.");
        }
        if (claim.replay && payment.status === "settled") {
          return payment;
        }
        if (!["initiated", "pending"].includes(payment.status)) {
          throw new ConflictException(
            "Only an initiated or pending payment can be settled.",
          );
        }

        this.validateAllocationShape(input.allocations);
        const allocationTotal = input.allocations.reduce(
          (sum, allocation) => sum + allocation.amountMinorUnits,
          0,
        );
        if (
          !Number.isSafeInteger(allocationTotal) ||
          allocationTotal !== payment.amount
        ) {
          throw new BadRequestException(
            "Payment allocations must equal the full payment amount.",
          );
        }
        await this.validateAllocationOwnership(
          transaction,
          tenantId,
          payment.customerId,
          payment.contractId,
          input.allocations,
        );
        await this.validateOutstandingBalances(
          transaction,
          tenantId,
          input.allocations,
        );

        const neededCodes = [
          channelAccount[payment.channel],
          ...input.allocations.map(
            (allocation) => targetAccount[allocation.targetType],
          ),
        ];
        const accounts = await transaction
          .select()
          .from(ledgerAccounts)
          .where(
            and(
              eq(ledgerAccounts.tenantId, tenantId),
              inArray(ledgerAccounts.code, [...new Set(neededCodes)]),
              eq(ledgerAccounts.active, true),
            ),
          );
        const accountsByCode = new Map(
          accounts.map((account) => [account.code, account]),
        );
        for (const code of neededCodes) {
          if (!accountsByCode.has(code)) {
            throw new ConflictException(`Required ledger account ${code} is missing.`);
          }
        }

        const journalEntryId = randomUUID();
        const now = new Date().toISOString();
        await transaction.insert(journalEntries).values({
          id: journalEntryId,
          tenantId,
          sourceType: "payment",
          sourceId: payment.id,
          kind: "standard",
          effectiveAt: now,
          postedBy: context.user.id,
          description: `Settlement of payment ${payment.id}`,
        });
        await transaction.insert(journalLines).values([
          {
            tenantId,
            journalEntryId,
            accountId: accountsByCode.get(channelAccount[payment.channel])!.id,
            side: "debit",
            amount: payment.amount,
            memo: "Payment receipt",
            customerId: payment.customerId,
            contractId: payment.contractId,
            paymentId: payment.id,
          },
          ...input.allocations.map((allocation) => ({
            tenantId,
            journalEntryId,
            accountId: accountsByCode.get(targetAccount[allocation.targetType])!.id,
            side: "credit" as const,
            amount: allocation.amountMinorUnits,
            memo: `Payment allocation: ${allocation.targetType}`,
            customerId: payment.customerId,
            contractId: allocation.contractId,
            installmentId: allocation.installmentId,
            paymentId: payment.id,
            feeAssessmentId: allocation.feeAssessmentId,
          })),
        ]);
        await transaction.insert(paymentAllocations).values(
          input.allocations.map((allocation) => ({
            tenantId,
            paymentId: payment.id,
            targetType: allocation.targetType,
            contractId: allocation.contractId,
            installmentId: allocation.installmentId,
            feeAssessmentId: allocation.feeAssessmentId,
            amount: allocation.amountMinorUnits,
          })),
        );
        const [settled] = await transaction
          .update(payments)
          .set({
            status: "settled",
            settledAt: now,
            ledgerEntryId: journalEntryId,
            version: sql`${payments.version} + 1`,
          })
          .where(
            and(
              eq(payments.tenantId, tenantId),
              eq(payments.id, payment.id),
              eq(payments.version, payment.version),
            ),
          )
          .returning();
        if (settled === undefined) {
          throw new ConflictException("Payment changed concurrently.");
        }
        await recordAudit(
          transaction,
          context,
          "payment.settled",
          "payment",
          payment.id,
          { journalEntryId, allocationCount: input.allocations.length },
        );
        return settled;
      },
    );
  }

  reverse(
    context: AuthorizationContext,
    paymentId: string,
    idempotencyKey: string,
    input: ReversePaymentDto,
  ) {
    const tenantId = tenantIdFrom(context);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["payments.reverse"],
      async (transaction) => {
        const claim = await claimIdempotencyKey(
          transaction,
          tenantId,
          "payments.reverse",
          idempotencyKey,
          { paymentId, ...input },
          "payment",
          paymentId,
        );
        const [payment] = await transaction
          .select()
          .from(payments)
          .where(and(eq(payments.tenantId, tenantId), eq(payments.id, paymentId)))
          .for("update")
          .limit(1);
        if (payment === undefined) {
          throw new NotFoundException("Payment not found.");
        }
        if (claim.replay && payment.status === "reversed") {
          return payment;
        }
        if (payment.status !== "settled" || payment.ledgerEntryId === null) {
          throw new ConflictException("Only a settled payment can be reversed.");
        }
        const originalLines = await transaction
          .select()
          .from(journalLines)
          .where(
            and(
              eq(journalLines.tenantId, tenantId),
              eq(journalLines.journalEntryId, payment.ledgerEntryId),
            ),
          );
        if (originalLines.length < 2) {
          throw new ConflictException("Original payment journal is incomplete.");
        }

        const reversalEntryId = randomUUID();
        const now = new Date().toISOString();
        await transaction.insert(journalEntries).values({
          id: reversalEntryId,
          tenantId,
          sourceType: "payment",
          sourceId: payment.id,
          kind: "reversal",
          reversesEntryId: payment.ledgerEntryId,
          effectiveAt: now,
          postedBy: context.user.id,
          description: `Reversal of payment ${payment.id}: ${input.reason}`,
        });
        await transaction.insert(journalLines).values(
          originalLines.map((line) => ({
            tenantId,
            journalEntryId: reversalEntryId,
            accountId: line.accountId,
            side: line.side === "debit" ? ("credit" as const) : ("debit" as const),
            amount: line.amount,
            memo: `Reversal: ${line.memo ?? ""}`.trim(),
            customerId: line.customerId,
            contractId: line.contractId,
            installmentId: line.installmentId,
            paymentId: line.paymentId,
            feeAssessmentId: line.feeAssessmentId,
          })),
        );
        const [reversed] = await transaction
          .update(payments)
          .set({
            status: "reversed",
            reversedAt: now,
            reversalEntryId,
            version: sql`${payments.version} + 1`,
          })
          .where(
            and(
              eq(payments.tenantId, tenantId),
              eq(payments.id, payment.id),
              eq(payments.version, payment.version),
            ),
          )
          .returning();
        if (reversed === undefined) {
          throw new ConflictException("Payment changed concurrently.");
        }
        await recordAudit(
          transaction,
          context,
          "payment.reversed",
          "payment",
          payment.id,
          { reversalEntryId, reason: input.reason },
        );
        return reversed;
      },
    );
  }

  private validateAllocationShape(allocations: readonly PaymentAllocationDto[]): void {
    for (const allocation of allocations) {
      const hasContract = allocation.contractId !== undefined;
      const hasInstallment = allocation.installmentId !== undefined;
      const hasFee = allocation.feeAssessmentId !== undefined;
      const valid =
        (allocation.targetType === "down_payment" &&
          hasContract &&
          !hasInstallment &&
          !hasFee) ||
        (["installment_principal", "installment_finance_charge"].includes(
          allocation.targetType,
        ) &&
          hasContract &&
          hasInstallment &&
          !hasFee) ||
        (allocation.targetType === "fee" && hasContract && !hasInstallment && hasFee) ||
        (allocation.targetType === "unapplied_credit" && !hasInstallment && !hasFee);
      if (!valid) {
        throw new BadRequestException(
          `Allocation references do not match target ${allocation.targetType}.`,
        );
      }
    }
  }

  private async validateAllocationOwnership(
    transaction: Parameters<Parameters<DatabaseService["withTenantTransaction"]>[3]>[0],
    tenantId: string,
    customerId: string,
    paymentContractId: string | null,
    allocations: readonly PaymentAllocationDto[],
  ): Promise<void> {
    const contractIds = [
      ...new Set(
        allocations
          .map((allocation) => allocation.contractId)
          .filter((id): id is string => id !== undefined),
      ),
    ];
    if (
      paymentContractId !== null &&
      contractIds.some((id) => id !== paymentContractId)
    ) {
      throw new BadRequestException(
        "Allocation targets a different contract than the payment.",
      );
    }
    if (contractIds.length > 0) {
      const contractRows = await transaction
        .select({
          id: financingContracts.id,
          customerId: financingContracts.customerId,
        })
        .from(financingContracts)
        .where(
          and(
            eq(financingContracts.tenantId, tenantId),
            inArray(financingContracts.id, contractIds),
          ),
        );
      if (
        contractRows.length !== contractIds.length ||
        contractRows.some((contract) => contract.customerId !== customerId)
      ) {
        throw new BadRequestException(
          "Every allocation contract must belong to the payment customer.",
        );
      }
    }

    for (const allocation of allocations) {
      if (allocation.installmentId !== undefined) {
        const [installment] = await transaction
          .select({ contractId: installments.contractId })
          .from(installments)
          .where(
            and(
              eq(installments.tenantId, tenantId),
              eq(installments.id, allocation.installmentId),
            ),
          )
          .limit(1);
        if (installment?.contractId !== allocation.contractId) {
          throw new BadRequestException(
            "Allocation installment does not belong to its contract.",
          );
        }
      }
      if (allocation.feeAssessmentId !== undefined) {
        const [fee] = await transaction
          .select({ contractId: feeAssessments.contractId })
          .from(feeAssessments)
          .where(
            and(
              eq(feeAssessments.tenantId, tenantId),
              eq(feeAssessments.id, allocation.feeAssessmentId),
            ),
          )
          .limit(1);
        if (fee?.contractId !== allocation.contractId) {
          throw new BadRequestException(
            "Allocation fee does not belong to its contract.",
          );
        }
      }
    }
  }

  private async validateOutstandingBalances(
    transaction: Parameters<Parameters<DatabaseService["withTenantTransaction"]>[3]>[0],
    tenantId: string,
    allocations: readonly PaymentAllocationDto[],
  ): Promise<void> {
    const requested = new Map<
      string,
      { allocation: PaymentAllocationDto; amount: number }
    >();
    for (const allocation of allocations) {
      if (allocation.targetType === "unapplied_credit") {
        continue;
      }
      const targetId =
        allocation.installmentId ?? allocation.feeAssessmentId ?? allocation.contractId;
      const key = `${allocation.targetType}:${targetId}`;
      const current = requested.get(key);
      requested.set(key, {
        allocation,
        amount: (current?.amount ?? 0) + allocation.amountMinorUnits,
      });
    }

    for (const [key, value] of [...requested.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      await transaction.execute(sql`
        select pg_advisory_xact_lock(hashtextextended(${`${tenantId}:${key}`}, 0))
      `);
      const allocation = value.allocation;
      let allowed = 0;
      if (allocation.targetType === "down_payment") {
        const [contract] = await transaction
          .select({ amount: financingContracts.downPayment })
          .from(financingContracts)
          .where(
            and(
              eq(financingContracts.tenantId, tenantId),
              eq(financingContracts.id, allocation.contractId!),
            ),
          )
          .limit(1);
        allowed = contract?.amount ?? 0;
      } else if (
        allocation.targetType === "installment_principal" ||
        allocation.targetType === "installment_finance_charge"
      ) {
        const [installment] = await transaction
          .select({
            principal: installments.principalDue,
            financeCharge: installments.financeChargeDue,
          })
          .from(installments)
          .where(
            and(
              eq(installments.tenantId, tenantId),
              eq(installments.id, allocation.installmentId!),
            ),
          )
          .limit(1);
        allowed =
          allocation.targetType === "installment_principal"
            ? (installment?.principal ?? 0)
            : (installment?.financeCharge ?? 0);
      } else {
        const [fee] = await transaction
          .select({ amount: feeAssessments.amount, status: feeAssessments.status })
          .from(feeAssessments)
          .where(
            and(
              eq(feeAssessments.tenantId, tenantId),
              eq(feeAssessments.id, allocation.feeAssessmentId!),
            ),
          )
          .limit(1);
        if (fee?.status !== "assessed") {
          throw new BadRequestException("Only an assessed fee can receive payment.");
        }
        allowed = fee.amount;
      }

      const targetCondition =
        allocation.targetType === "down_payment"
          ? and(
              eq(paymentAllocations.targetType, "down_payment"),
              eq(paymentAllocations.contractId, allocation.contractId!),
            )
          : allocation.targetType === "fee"
            ? and(
                eq(paymentAllocations.targetType, "fee"),
                eq(paymentAllocations.feeAssessmentId, allocation.feeAssessmentId!),
              )
            : and(
                eq(paymentAllocations.targetType, allocation.targetType),
                eq(paymentAllocations.installmentId, allocation.installmentId!),
              );
      const result = await transaction
        .select({
          amount: sql<number>`coalesce(sum(${paymentAllocations.amount}), 0)::float8`,
        })
        .from(paymentAllocations)
        .innerJoin(
          payments,
          and(
            eq(payments.tenantId, paymentAllocations.tenantId),
            eq(payments.id, paymentAllocations.paymentId),
          ),
        )
        .where(
          and(
            eq(paymentAllocations.tenantId, tenantId),
            eq(payments.status, "settled"),
            targetCondition,
          ),
        );
      const alreadyAllocated = result[0]?.amount ?? 0;
      if (alreadyAllocated + value.amount > allowed) {
        throw new BadRequestException(
          `Allocation exceeds the outstanding balance for ${allocation.targetType}.`,
        );
      }
    }
  }
}
