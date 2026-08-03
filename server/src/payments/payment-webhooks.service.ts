import { createHash, randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Environment } from "../config/environment.js";
import { DatabaseService } from "../database/database.service.js";
import {
  auditEvents,
  journalEntries,
  journalLines,
  ledgerAccounts,
  paymentAllocations,
  paymentProviderEvents,
  payments,
} from "../database/schema.js";
import { verifyHmacSha256 } from "../providers/provider-security.js";

export type PaymentWebhookProvider = "mtn_momo" | "orange_money";

interface NormalizedPaymentWebhook {
  eventId: string;
  eventType: string;
  externalReference: string;
  status: "pending" | "settled" | "failed" | "cancelled";
  amountMinorUnits: number;
  currency: "XAF";
  failureCode?: string;
}

@Injectable()
export class PaymentWebhooksService {
  constructor(
    private readonly config: ConfigService<Environment, true>,
    private readonly database: DatabaseService,
  ) {}

  handle(
    provider: PaymentWebhookProvider,
    payload: Record<string, unknown>,
    rawBody: Buffer,
    signature: string | undefined,
  ) {
    const secret =
      provider === "mtn_momo"
        ? this.config.get("MTN_MOMO_WEBHOOK_SECRET", { infer: true })
        : this.config.get("ORANGE_MONEY_WEBHOOK_SECRET", { infer: true });
    verifyHmacSha256(rawBody, signature, secret);
    const event = this.normalize(provider, payload);
    const payloadHash = createHash("sha256").update(rawBody).digest("hex");
    return this.database.withProviderTransaction(
      "payment",
      provider,
      event.externalReference,
      async (transaction, tenantId) => {
        const inserted = await transaction
          .insert(paymentProviderEvents)
          .values({
            tenantId,
            provider,
            externalEventId: event.eventId,
            eventType: event.eventType,
            payloadHash,
            payload,
            signatureValid: true,
          })
          .onConflictDoNothing()
          .returning({ id: paymentProviderEvents.id });
        if (inserted[0] === undefined) {
          return { accepted: true, replay: true };
        }

        const [payment] = await transaction
          .select()
          .from(payments)
          .where(
            and(
              eq(payments.tenantId, tenantId),
              eq(payments.provider, provider),
              eq(payments.externalReference, event.externalReference),
            ),
          )
          .for("update")
          .limit(1);
        if (payment === undefined) {
          throw new ConflictException("Referenced payment no longer exists.");
        }

        let eventStatus: "processed" | "ignored" | "failed" = "processed";
        let eventError: string | undefined;
        if (
          payment.amount !== event.amountMinorUnits ||
          payment.currency !== event.currency
        ) {
          eventStatus = "failed";
          eventError = "amount_or_currency_mismatch";
        } else if (
          ["settled", "failed", "cancelled", "reversed"].includes(payment.status)
        ) {
          eventStatus = "ignored";
          eventError = `payment_already_${payment.status}`;
        } else if (event.status === "settled") {
          await this.settleToUnappliedCredit(transaction, tenantId, payment);
        } else {
          const now = new Date().toISOString();
          await transaction
            .update(payments)
            .set({
              status: event.status,
              failedAt: event.status === "failed" ? now : undefined,
              failureCode:
                event.status === "failed"
                  ? (event.failureCode ?? "provider_rejected")
                  : undefined,
              version: sql`${payments.version} + 1`,
            })
            .where(
              and(
                eq(payments.tenantId, tenantId),
                eq(payments.id, payment.id),
                eq(payments.version, payment.version),
              ),
            );
        }

        const now = new Date().toISOString();
        await transaction
          .update(paymentProviderEvents)
          .set({
            status: eventStatus,
            processingAttempts: 1,
            errorCode: eventError,
            processedAt: now,
          })
          .where(eq(paymentProviderEvents.id, inserted[0].id));
        await transaction.insert(auditEvents).values({
          tenantId,
          action: `payment.webhook_${eventStatus}`,
          resourceType: "payment",
          resourceId: payment.id,
          details: {
            provider,
            eventId: event.eventId,
            eventType: event.eventType,
            providerStatus: event.status,
            errorCode: eventError,
          },
        });
        return {
          accepted: true,
          replay: false,
          processed: eventStatus === "processed",
        };
      },
    );
  }

  private async settleToUnappliedCredit(
    transaction: Parameters<
      Parameters<DatabaseService["withProviderTransaction"]>[3]
    >[0],
    tenantId: string,
    payment: typeof payments.$inferSelect,
  ): Promise<void> {
    const accounts = await transaction
      .select()
      .from(ledgerAccounts)
      .where(
        and(
          eq(ledgerAccounts.tenantId, tenantId),
          inArray(ledgerAccounts.code, ["MOBILE_MONEY_CLEARING", "UNAPPLIED_CREDIT"]),
          eq(ledgerAccounts.active, true),
        ),
      );
    const byCode = new Map(accounts.map((account) => [account.code, account.id]));
    const clearingAccountId = byCode.get("MOBILE_MONEY_CLEARING");
    const unappliedAccountId = byCode.get("UNAPPLIED_CREDIT");
    if (clearingAccountId === undefined || unappliedAccountId === undefined) {
      throw new ConflictException("Payment clearing ledger accounts are missing.");
    }

    const journalEntryId = randomUUID();
    const now = new Date().toISOString();
    await transaction.insert(journalEntries).values({
      id: journalEntryId,
      tenantId,
      sourceType: "payment",
      sourceId: payment.id,
      effectiveAt: now,
      postedBy: `provider:${payment.provider ?? "unknown"}`,
      description: `Provider settlement of payment ${payment.id}`,
    });
    await transaction.insert(journalLines).values([
      {
        tenantId,
        journalEntryId,
        accountId: clearingAccountId,
        side: "debit",
        amount: payment.amount,
        memo: "Provider payment receipt",
        customerId: payment.customerId,
        contractId: payment.contractId,
        paymentId: payment.id,
      },
      {
        tenantId,
        journalEntryId,
        accountId: unappliedAccountId,
        side: "credit",
        amount: payment.amount,
        memo: "Awaiting servicing allocation",
        customerId: payment.customerId,
        contractId: payment.contractId,
        paymentId: payment.id,
      },
    ]);
    await transaction.insert(paymentAllocations).values({
      tenantId,
      paymentId: payment.id,
      targetType: "unapplied_credit",
      contractId: payment.contractId,
      amount: payment.amount,
    });
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
  }

  private normalize(
    provider: PaymentWebhookProvider,
    payload: Record<string, unknown>,
  ): NormalizedPaymentWebhook {
    if (
      typeof payload["eventId"] === "string" &&
      typeof payload["externalReference"] === "string" &&
      typeof payload["status"] === "string" &&
      typeof payload["amountMinorUnits"] === "number"
    ) {
      return this.validateNormalized({
        eventId: payload["eventId"],
        eventType:
          typeof payload["eventType"] === "string"
            ? payload["eventType"]
            : "payment.status_changed",
        externalReference: payload["externalReference"],
        status: payload["status"],
        amountMinorUnits: payload["amountMinorUnits"],
        currency: payload["currency"],
        failureCode: payload["failureCode"],
      });
    }
    if (
      provider === "mtn_momo" &&
      typeof payload["externalId"] === "string" &&
      typeof payload["status"] === "string" &&
      (typeof payload["amount"] === "string" || typeof payload["amount"] === "number")
    ) {
      const providerStatus = payload["status"].toUpperCase();
      return this.validateNormalized({
        eventId:
          typeof payload["financialTransactionId"] === "string"
            ? payload["financialTransactionId"]
            : `${payload["externalId"]}:${providerStatus}`,
        eventType: "mtn.request_to_pay.status",
        externalReference: payload["externalId"],
        status:
          providerStatus === "SUCCESSFUL"
            ? "settled"
            : providerStatus === "FAILED"
              ? "failed"
              : "pending",
        amountMinorUnits: Number(payload["amount"]),
        currency: payload["currency"],
        failureCode:
          typeof payload["reason"] === "string" ? payload["reason"] : undefined,
      });
    }
    throw new BadRequestException("Unsupported payment webhook payload.");
  }

  private validateNormalized(value: {
    eventId: string;
    eventType: string;
    externalReference: string;
    status: unknown;
    amountMinorUnits: number;
    currency: unknown;
    failureCode: unknown;
  }): NormalizedPaymentWebhook {
    if (
      !["pending", "settled", "failed", "cancelled"].includes(String(value.status)) ||
      value.currency !== "XAF" ||
      !Number.isSafeInteger(value.amountMinorUnits) ||
      value.amountMinorUnits <= 0 ||
      value.eventId.length > 200 ||
      value.externalReference.length > 160
    ) {
      throw new BadRequestException("Payment webhook values are invalid.");
    }
    return {
      eventId: value.eventId,
      eventType: value.eventType,
      externalReference: value.externalReference,
      status: value.status as NormalizedPaymentWebhook["status"],
      amountMinorUnits: value.amountMinorUnits,
      currency: "XAF",
      ...(typeof value.failureCode === "string"
        ? { failureCode: value.failureCode.slice(0, 160) }
        : {}),
    };
  }
}
