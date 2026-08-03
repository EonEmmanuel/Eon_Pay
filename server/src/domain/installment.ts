import { assertMoney, assertSameCurrency, isZeroMoney, type Money } from "./money.js";
import type {
  ContractId,
  InstallmentId,
  IsoDate,
  IsoInstant,
  TenantId,
} from "./shared.js";

/**
 * An immutable row in the repayment schedule. Paid and outstanding amounts are
 * derived from allocations and ledger entries, not stored on this entity.
 */
export interface Installment {
  readonly id: InstallmentId;
  readonly tenantId: TenantId;
  readonly contractId: ContractId;
  readonly sequence: number;
  readonly dueDate: IsoDate;
  readonly principalDue: Money;
  readonly financeChargeDue: Money;
  readonly createdAt: IsoInstant;
}

export interface InstallmentBalance {
  readonly principalOutstanding: Money;
  readonly financeChargeOutstanding: Money;
  readonly feeAssessed: Money;
  readonly feeOutstanding: Money;
}

export type InstallmentState =
  "scheduled" | "due" | "partially_paid" | "paid" | "overdue";

export function assertInstallment(installment: Installment): void {
  if (!Number.isSafeInteger(installment.sequence) || installment.sequence < 1) {
    throw new Error("Installment sequence must be a positive integer.");
  }

  assertSameCurrency([installment.principalDue, installment.financeChargeDue]);

  if (
    isZeroMoney(installment.principalDue) &&
    isZeroMoney(installment.financeChargeDue)
  ) {
    throw new Error("An installment must schedule a positive amount.");
  }
}

export function deriveInstallmentState(
  installment: Installment,
  balance: InstallmentBalance,
  asOfDate: IsoDate,
): InstallmentState {
  assertInstallment(installment);
  assertSameCurrency([
    balance.principalOutstanding,
    balance.financeChargeOutstanding,
    balance.feeAssessed,
    balance.feeOutstanding,
  ]);

  const totalOutstanding =
    balance.principalOutstanding.minorUnits +
    balance.financeChargeOutstanding.minorUnits +
    balance.feeOutstanding.minorUnits;

  if (totalOutstanding === 0) {
    return "paid";
  }

  const originalDue =
    installment.principalDue.minorUnits +
    installment.financeChargeDue.minorUnits +
    balance.feeAssessed.minorUnits;

  if (totalOutstanding < originalDue) {
    return asOfDate > installment.dueDate ? "overdue" : "partially_paid";
  }

  if (asOfDate > installment.dueDate) {
    return "overdue";
  }

  if (asOfDate === installment.dueDate) {
    return "due";
  }

  assertMoney(balance.principalOutstanding);
  return "scheduled";
}
