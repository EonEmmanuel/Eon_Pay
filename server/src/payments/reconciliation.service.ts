import { createHash, randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, gte, lt } from "drizzle-orm";
import type { AuthorizationContext } from "../common/request-context.js";
import {
  claimIdempotencyKey,
  recordAudit,
  tenantIdFrom,
} from "../common/persistence.js";
import { DatabaseService } from "../database/database.service.js";
import {
  reconciliationItems,
  reconciliationRuns,
  payments,
} from "../database/schema.js";
import type {
  CreateReconciliationRunDto,
  ReconciliationStatementItemDto,
} from "./reconciliation.dto.js";

type ReconciliationStatus =
  | "matched"
  | "missing_internal"
  | "missing_provider"
  | "amount_mismatch"
  | "status_mismatch";

@Injectable()
export class ReconciliationService {
  constructor(private readonly database: DatabaseService) {}

  list(context: AuthorizationContext) {
    const tenantId = tenantIdFrom(context);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["payments.reconcile"],
      (transaction) =>
        transaction
          .select()
          .from(reconciliationRuns)
          .where(eq(reconciliationRuns.tenantId, tenantId))
          .orderBy(desc(reconciliationRuns.createdAt)),
    );
  }

  get(context: AuthorizationContext, runId: string) {
    const tenantId = tenantIdFrom(context);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["payments.reconcile"],
      async (transaction) => {
        const [run] = await transaction
          .select()
          .from(reconciliationRuns)
          .where(
            and(
              eq(reconciliationRuns.tenantId, tenantId),
              eq(reconciliationRuns.id, runId),
            ),
          )
          .limit(1);
        if (run === undefined) {
          throw new NotFoundException("Reconciliation run not found.");
        }
        const items = await transaction
          .select()
          .from(reconciliationItems)
          .where(
            and(
              eq(reconciliationItems.tenantId, tenantId),
              eq(reconciliationItems.runId, runId),
            ),
          );
        return { ...run, items };
      },
    );
  }

  create(
    context: AuthorizationContext,
    idempotencyKey: string,
    input: CreateReconciliationRunDto,
  ) {
    const tenantId = tenantIdFrom(context);
    const periodStart = new Date(input.periodStart);
    const periodEnd = new Date(input.periodEnd);
    if (periodEnd <= periodStart) {
      throw new BadRequestException("periodEnd must be after periodStart.");
    }
    const uniqueReferences = new Set(input.items.map((item) => item.externalReference));
    if (uniqueReferences.size !== input.items.length) {
      throw new BadRequestException(
        "Provider statement contains duplicate external references.",
      );
    }
    const sourceSha256 = this.sourceHash(input);
    const runId = randomUUID();
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["payments.reconcile"],
      async (transaction) => {
        const claim = await claimIdempotencyKey(
          transaction,
          tenantId,
          "payments.reconcile",
          idempotencyKey,
          input,
          "reconciliation_run",
          runId,
        );
        if (claim.replay) {
          const [existing] = await transaction
            .select()
            .from(reconciliationRuns)
            .where(
              and(
                eq(reconciliationRuns.tenantId, tenantId),
                eq(reconciliationRuns.id, claim.resourceId),
              ),
            )
            .limit(1);
          return existing;
        }
        const [duplicateSource] = await transaction
          .select({ id: reconciliationRuns.id })
          .from(reconciliationRuns)
          .where(
            and(
              eq(reconciliationRuns.tenantId, tenantId),
              eq(reconciliationRuns.provider, input.provider),
              eq(reconciliationRuns.sourceSha256, sourceSha256),
            ),
          )
          .limit(1);
        if (duplicateSource !== undefined) {
          throw new ConflictException(
            "This provider statement was already reconciled.",
          );
        }
        await transaction.insert(reconciliationRuns).values({
          id: runId,
          tenantId,
          provider: input.provider,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
          sourceSha256,
          status: "processing",
          startedBy: context.user.id,
        });
        const internal = await transaction
          .select()
          .from(payments)
          .where(
            and(
              eq(payments.tenantId, tenantId),
              eq(payments.provider, input.provider),
              gte(payments.initiatedAt, periodStart.toISOString()),
              lt(payments.initiatedAt, periodEnd.toISOString()),
            ),
          );
        const internalByReference = new Map(
          internal
            .filter(
              (payment): payment is typeof payment & { externalReference: string } =>
                payment.externalReference !== null,
            )
            .map((payment) => [payment.externalReference, payment]),
        );
        const statementByReference = new Map(
          input.items.map((item) => [item.externalReference, item]),
        );
        const values: (typeof reconciliationItems.$inferInsert)[] = input.items.map(
          (item) => {
            const payment = internalByReference.get(item.externalReference);
            return {
              tenantId,
              runId,
              paymentId: payment?.id,
              externalReference: item.externalReference,
              internalAmount: payment?.amount,
              providerAmount: item.amountMinorUnits,
              internalStatus: payment?.status,
              providerStatus: item.status,
              status: this.compare(payment, item),
            };
          },
        );
        for (const payment of internal) {
          if (
            payment.externalReference !== null &&
            !statementByReference.has(payment.externalReference)
          ) {
            values.push({
              tenantId,
              runId,
              paymentId: payment.id,
              externalReference: payment.externalReference,
              internalAmount: payment.amount,
              internalStatus: payment.status,
              providerStatus: "missing",
              status: "missing_provider",
            });
          }
        }
        if (values.length > 0) {
          await transaction.insert(reconciliationItems).values(values);
        }
        const matchedItems = values.filter((item) => item.status === "matched").length;
        const exceptionItems = values.length - matchedItems;
        const completedAt = new Date().toISOString();
        const [run] = await transaction
          .update(reconciliationRuns)
          .set({
            status: "completed",
            totalItems: values.length,
            matchedItems,
            exceptionItems,
            completedAt,
          })
          .where(
            and(
              eq(reconciliationRuns.tenantId, tenantId),
              eq(reconciliationRuns.id, runId),
            ),
          )
          .returning();
        await recordAudit(
          transaction,
          context,
          "payment.reconciliation_completed",
          "reconciliation_run",
          runId,
          {
            provider: input.provider,
            totalItems: values.length,
            matchedItems,
            exceptionItems,
            sourceSha256,
          },
        );
        return run;
      },
    );
  }

  private compare(
    payment: typeof payments.$inferSelect | undefined,
    item: ReconciliationStatementItemDto,
  ): ReconciliationStatus {
    if (payment === undefined) {
      return "missing_internal";
    }
    if (payment.amount !== item.amountMinorUnits) {
      return "amount_mismatch";
    }
    if (payment.status !== item.status) {
      return "status_mismatch";
    }
    return "matched";
  }

  private sourceHash(input: CreateReconciliationRunDto): string {
    const canonical = {
      provider: input.provider,
      periodStart: new Date(input.periodStart).toISOString(),
      periodEnd: new Date(input.periodEnd).toISOString(),
      items: [...input.items].sort((left, right) =>
        left.externalReference.localeCompare(right.externalReference),
      ),
    };
    return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
  }
}
