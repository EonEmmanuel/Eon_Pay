import assert from "node:assert/strict";
import test from "node:test";
import {
  assertBalancedJournalEntry,
  assertPaymentAllocations,
  money,
  type JournalEntry,
  type Payment,
  type PaymentAllocation,
} from "../src/domain/index.js";

const now = "2026-07-27T12:00:00.000Z";

test("unbalanced journal entries are rejected", () => {
  const entry = {
    id: "entry",
    tenantId: "tenant",
    source: { type: "manual", id: "test" },
    kind: "standard",
    effectiveAt: now,
    postedAt: now,
    postedBy: "system",
    description: "Unbalanced test",
    lines: [
      {
        id: "line-1",
        accountId: "cash",
        side: "debit",
        amount: money(100),
        dimensions: {},
      },
      {
        id: "line-2",
        accountId: "receivable",
        side: "credit",
        amount: money(99),
        dimensions: {},
      },
    ],
  } as unknown as JournalEntry;
  assert.throws(() => assertBalancedJournalEntry(entry), /unbalanced/);
});

test("payment allocations must consume the full settled amount", () => {
  const payment = {
    id: "payment",
    tenantId: "tenant",
    customerId: "customer",
    contractId: "contract",
    amount: money(100),
    channel: "cash",
    status: "settled",
    idempotencyKey: "example-key",
    initiatedAt: now,
    settledAt: now,
    ledgerEntryId: "entry",
    version: 1,
    createdAt: now,
    updatedAt: now,
  } as unknown as Payment;
  const allocations = [
    {
      id: "allocation",
      tenantId: "tenant",
      paymentId: "payment",
      target: {
        type: "installment_principal",
        contractId: "contract",
        installmentId: "installment",
      },
      amount: money(99),
      allocatedAt: now,
    },
  ] as unknown as PaymentAllocation[];

  assert.throws(
    () => assertPaymentAllocations(payment, allocations),
    /must equal the full payment/,
  );
});
