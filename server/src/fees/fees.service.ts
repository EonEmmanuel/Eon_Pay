import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { AuthorizationContext } from "../common/request-context.js";
import {
  claimIdempotencyKey,
  recordAudit,
  tenantIdFrom,
} from "../common/persistence.js";
import { DatabaseService } from "../database/database.service.js";
import {
  feeAssessments,
  journalEntries,
  journalLines,
  ledgerAccounts,
} from "../database/schema.js";
import type { AssessFeeDto, WaiveFeeDto } from "./fees.dto.js";

@Injectable()
export class FeesService {
  constructor(private readonly database: DatabaseService) {}

  list(context: AuthorizationContext) {
    const tenantId = tenantIdFrom(context);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["fees.read"],
      (transaction) =>
        transaction
          .select()
          .from(feeAssessments)
          .where(eq(feeAssessments.tenantId, tenantId))
          .orderBy(desc(feeAssessments.assessedAt)),
    );
  }

  assess(context: AuthorizationContext, idempotencyKey: string, input: AssessFeeDto) {
    this.validateSubject(input);
    this.validateCalculation(input);
    const tenantId = tenantIdFrom(context);
    const feeId = randomUUID();

    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["fees.assess"],
      async (transaction) => {
        const claim = await claimIdempotencyKey(
          transaction,
          tenantId,
          "fees.assess",
          idempotencyKey,
          input,
          "fee",
          feeId,
        );
        if (claim.replay) {
          const [existing] = await transaction
            .select()
            .from(feeAssessments)
            .where(
              and(
                eq(feeAssessments.tenantId, tenantId),
                eq(feeAssessments.id, claim.resourceId),
              ),
            )
            .limit(1);
          return existing;
        }

        const accounts = await transaction
          .select()
          .from(ledgerAccounts)
          .where(
            and(
              eq(ledgerAccounts.tenantId, tenantId),
              inArray(ledgerAccounts.code, ["FEE_RECEIVABLE", "FEE_INCOME"]),
              eq(ledgerAccounts.active, true),
            ),
          );
        const accountByCode = new Map(
          accounts.map((account) => [account.code, account]),
        );
        const receivable = accountByCode.get("FEE_RECEIVABLE");
        const income = accountByCode.get("FEE_INCOME");
        if (receivable === undefined || income === undefined) {
          throw new ConflictException("Required fee ledger accounts are missing.");
        }

        const journalEntryId = randomUUID();
        const now = new Date().toISOString();
        await transaction.insert(journalEntries).values({
          id: journalEntryId,
          tenantId,
          sourceType: "fee",
          sourceId: feeId,
          kind: "standard",
          effectiveAt: now,
          postedBy: context.user.id,
          description: `Assessment of ${input.kind} fee`,
        });
        const [fee] = await transaction
          .insert(feeAssessments)
          .values({
            id: feeId,
            tenantId,
            subjectType: input.subjectType,
            applicationId: input.applicationId,
            contractId: input.contractId,
            installmentId: input.installmentId,
            paymentId: input.paymentId,
            kind: input.kind,
            amount: input.amountMinorUnits,
            calculation: {
              method: input.calculation.method,
              ...(input.calculation.basisAmountMinorUnits === undefined
                ? {}
                : {
                    basisAmount: {
                      minorUnits: input.calculation.basisAmountMinorUnits,
                      currency: "XAF",
                    },
                  }),
              ...(input.calculation.rateBasisPoints === undefined
                ? {}
                : { rateBasisPoints: input.calculation.rateBasisPoints }),
              policyCode: input.calculation.policyCode,
              policyVersion: input.calculation.policyVersion,
            },
            dueDate: input.dueDate,
            ledgerEntryId: journalEntryId,
          })
          .returning();
        if (fee === undefined) {
          throw new ConflictException("Fee could not be assessed.");
        }
        await transaction.insert(journalLines).values([
          {
            tenantId,
            journalEntryId,
            accountId: receivable.id,
            side: "debit",
            amount: input.amountMinorUnits,
            memo: "Fee receivable",
            contractId: input.contractId,
            installmentId: input.installmentId,
            paymentId: input.paymentId,
            feeAssessmentId: fee.id,
          },
          {
            tenantId,
            journalEntryId,
            accountId: income.id,
            side: "credit",
            amount: input.amountMinorUnits,
            memo: "Fee income",
            contractId: input.contractId,
            installmentId: input.installmentId,
            paymentId: input.paymentId,
            feeAssessmentId: fee.id,
          },
        ]);
        await recordAudit(transaction, context, "fee.assessed", "fee", fee.id, {
          kind: input.kind,
          amountMinorUnits: input.amountMinorUnits,
        });
        return fee;
      },
    );
  }

  waive(
    context: AuthorizationContext,
    feeId: string,
    idempotencyKey: string,
    input: WaiveFeeDto,
  ) {
    const tenantId = tenantIdFrom(context);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["fees.waive"],
      async (transaction) => {
        const claim = await claimIdempotencyKey(
          transaction,
          tenantId,
          "fees.waive",
          idempotencyKey,
          { feeId, ...input },
          "fee",
          feeId,
        );
        const [fee] = await transaction
          .select()
          .from(feeAssessments)
          .where(
            and(eq(feeAssessments.tenantId, tenantId), eq(feeAssessments.id, feeId)),
          )
          .for("update")
          .limit(1);
        if (fee === undefined) {
          throw new NotFoundException("Fee not found.");
        }
        if (claim.replay && fee.status === "waived") {
          return fee;
        }
        if (fee.status !== "assessed") {
          throw new ConflictException("Only an assessed fee can be waived.");
        }
        const originalLines = await transaction
          .select()
          .from(journalLines)
          .where(
            and(
              eq(journalLines.tenantId, tenantId),
              eq(journalLines.journalEntryId, fee.ledgerEntryId),
            ),
          );
        if (originalLines.length < 2) {
          throw new ConflictException("Original fee journal is incomplete.");
        }

        const reversalEntryId = randomUUID();
        const now = new Date().toISOString();
        await transaction.insert(journalEntries).values({
          id: reversalEntryId,
          tenantId,
          sourceType: "fee",
          sourceId: fee.id,
          kind: "reversal",
          reversesEntryId: fee.ledgerEntryId,
          effectiveAt: now,
          postedBy: context.user.id,
          description: `Waiver of fee ${fee.id}: ${input.reason}`,
        });
        await transaction.insert(journalLines).values(
          originalLines.map((line) => ({
            tenantId,
            journalEntryId: reversalEntryId,
            accountId: line.accountId,
            side: line.side === "debit" ? ("credit" as const) : ("debit" as const),
            amount: line.amount,
            memo: `Waiver: ${line.memo ?? ""}`.trim(),
            customerId: line.customerId,
            contractId: line.contractId,
            installmentId: line.installmentId,
            paymentId: line.paymentId,
            feeAssessmentId: fee.id,
          })),
        );
        const [waived] = await transaction
          .update(feeAssessments)
          .set({
            status: "waived",
            waivedAt: now,
            waivedBy: context.user.id,
            waiverReason: input.reason,
            waiverEntryId: reversalEntryId,
          })
          .where(
            and(
              eq(feeAssessments.tenantId, tenantId),
              eq(feeAssessments.id, fee.id),
              eq(feeAssessments.status, "assessed"),
            ),
          )
          .returning();
        if (waived === undefined) {
          throw new ConflictException("Fee changed concurrently.");
        }
        await recordAudit(transaction, context, "fee.waived", "fee", fee.id, {
          reason: input.reason,
          reversalEntryId,
        });
        return waived;
      },
    );
  }

  private validateSubject(input: AssessFeeDto): void {
    const valid =
      (input.subjectType === "application" &&
        input.applicationId !== undefined &&
        input.contractId === undefined &&
        input.installmentId === undefined &&
        input.paymentId === undefined) ||
      (input.subjectType === "contract" &&
        input.applicationId === undefined &&
        input.contractId !== undefined &&
        input.installmentId === undefined &&
        input.paymentId === undefined) ||
      (input.subjectType === "installment" &&
        input.applicationId === undefined &&
        input.contractId !== undefined &&
        input.installmentId !== undefined &&
        input.paymentId === undefined) ||
      (input.subjectType === "payment" &&
        input.applicationId === undefined &&
        input.contractId !== undefined &&
        input.installmentId === undefined &&
        input.paymentId !== undefined);
    if (!valid) {
      throw new BadRequestException(
        "Fee references do not match the selected subject type.",
      );
    }
  }

  private validateCalculation(input: AssessFeeDto): void {
    const calculation = input.calculation;
    if (
      calculation.method === "percentage" &&
      (calculation.basisAmountMinorUnits === undefined ||
        calculation.rateBasisPoints === undefined)
    ) {
      throw new BadRequestException("Percentage fees require a basis amount and rate.");
    }
    if (
      calculation.method === "fixed" &&
      (calculation.basisAmountMinorUnits !== undefined ||
        calculation.rateBasisPoints !== undefined)
    ) {
      throw new BadRequestException(
        "Fixed fees must not include a percentage basis or rate.",
      );
    }
  }
}
