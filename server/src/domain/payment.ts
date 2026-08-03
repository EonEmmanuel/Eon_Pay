import { assertMoney, assertSameCurrency, sumMoney, type Money } from "./money.js";
import {
  assertPositiveVersion,
  type AggregateMetadata,
  type ContractId,
  type CustomerId,
  type FeeAssessmentId,
  type InstallmentId,
  type IsoInstant,
  type JournalEntryId,
  type PaymentAllocationId,
  type PaymentId,
  type TenantId,
} from "./shared.js";

export type PaymentStatus =
  "initiated" | "pending" | "settled" | "failed" | "cancelled" | "reversed";

export type PaymentChannel =
  "cash" | "mtn_momo" | "orange_money" | "bank_transfer" | "card" | "ussd";

/**
 * A payment-provider or cashier transaction. Only settled payments may be
 * allocated and posted to the ledger.
 */
export interface Payment extends AggregateMetadata {
  readonly id: PaymentId;
  readonly tenantId: TenantId;
  readonly customerId: CustomerId;
  readonly contractId?: ContractId;
  readonly amount: Money;
  readonly channel: PaymentChannel;
  readonly status: PaymentStatus;
  readonly idempotencyKey: string;
  readonly provider?: string;
  readonly externalReference?: string;
  readonly initiatedAt: IsoInstant;
  readonly settledAt?: IsoInstant;
  readonly failedAt?: IsoInstant;
  readonly failureCode?: string;
  readonly reversedAt?: IsoInstant;
  readonly ledgerEntryId?: JournalEntryId;
  readonly reversalEntryId?: JournalEntryId;
}

export type PaymentAllocationTarget =
  | {
      readonly type: "down_payment";
      readonly contractId: ContractId;
    }
  | {
      readonly type: "installment_principal";
      readonly contractId: ContractId;
      readonly installmentId: InstallmentId;
    }
  | {
      readonly type: "installment_finance_charge";
      readonly contractId: ContractId;
      readonly installmentId: InstallmentId;
    }
  | {
      readonly type: "fee";
      readonly contractId: ContractId;
      readonly feeAssessmentId: FeeAssessmentId;
    }
  | {
      readonly type: "unapplied_credit";
      readonly contractId?: ContractId;
    };

export interface PaymentAllocation {
  readonly id: PaymentAllocationId;
  readonly tenantId: TenantId;
  readonly paymentId: PaymentId;
  readonly target: PaymentAllocationTarget;
  readonly amount: Money;
  readonly allocatedAt: IsoInstant;
}

const paymentTransitions: Readonly<Record<PaymentStatus, readonly PaymentStatus[]>> = {
  initiated: ["pending", "settled", "failed", "cancelled"],
  pending: ["settled", "failed", "cancelled"],
  settled: ["reversed"],
  failed: [],
  cancelled: [],
  reversed: [],
};

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
  return paymentTransitions[from].includes(to);
}

export function assertPayment(payment: Payment): void {
  assertPositiveVersion(payment.version);
  assertMoney(payment.amount);

  if (payment.amount.minorUnits === 0) {
    throw new Error("A payment must have a positive amount.");
  }

  if (payment.idempotencyKey.trim().length === 0) {
    throw new Error("A payment requires a non-empty idempotency key.");
  }

  if (
    payment.status === "settled" &&
    (payment.settledAt === undefined || payment.ledgerEntryId === undefined)
  ) {
    throw new Error("A settled payment requires settlement and ledger metadata.");
  }

  if (
    payment.status === "failed" &&
    (payment.failedAt === undefined || payment.failureCode === undefined)
  ) {
    throw new Error("A failed payment requires failure metadata.");
  }

  if (
    payment.status === "reversed" &&
    (payment.reversedAt === undefined ||
      payment.ledgerEntryId === undefined ||
      payment.reversalEntryId === undefined)
  ) {
    throw new Error("A reversed payment requires original and reversal entries.");
  }
}

export function assertPaymentAllocations(
  payment: Payment,
  allocations: readonly PaymentAllocation[],
): void {
  assertPayment(payment);

  if (payment.status !== "settled" && payment.status !== "reversed") {
    throw new Error("Only a settled or reversed payment can have allocations.");
  }

  const ids = new Set<string>();

  for (const allocation of allocations) {
    if (allocation.paymentId !== payment.id) {
      throw new Error("Allocation references a different payment.");
    }

    if (allocation.tenantId !== payment.tenantId) {
      throw new Error("Allocation crosses a tenant boundary.");
    }

    if (allocation.amount.minorUnits === 0) {
      throw new Error("Payment allocations must be positive.");
    }

    const targetContractId = allocation.target.contractId;

    if (payment.contractId !== undefined && targetContractId !== payment.contractId) {
      throw new Error("Allocation targets a different contract than the payment.");
    }

    if (ids.has(allocation.id)) {
      throw new Error("Payment allocation IDs must be unique.");
    }

    ids.add(allocation.id);
  }

  assertSameCurrency([payment.amount, ...allocations.map((item) => item.amount)]);
  const allocated = sumMoney(allocations.map((item) => item.amount));

  if (allocated.minorUnits !== payment.amount.minorUnits) {
    throw new Error(
      "Payment allocations must equal the full payment; use unapplied_credit for any remainder.",
    );
  }
}
