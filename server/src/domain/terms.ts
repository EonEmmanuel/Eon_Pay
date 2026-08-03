import {
  assertMoney,
  assertSameCurrency,
  money,
  type CurrencyCode,
  type Money,
} from "./money.js";
import type { IsoDate } from "./shared.js";

export type RepaymentFrequency = "weekly" | "biweekly" | "monthly";

/**
 * Immutable pricing and repayment terms accepted by the customer.
 *
 * Fees are intentionally excluded. Every fee is represented by an explicit
 * FeeAssessment so fees cannot be hidden inside principal or finance charge.
 */
export interface FinancingTerms {
  readonly currency: CurrencyCode;
  readonly deviceCashPrice: Money;
  readonly downPayment: Money;
  readonly financedPrincipal: Money;
  readonly financeCharge: Money;
  readonly installmentCount: number;
  readonly repaymentFrequency: RepaymentFrequency;
  readonly firstDueDate: IsoDate;
  readonly gracePeriodDays: number;
}

export interface RequestedFinancingTerms {
  readonly currency: CurrencyCode;
  readonly deviceCashPrice: Money;
  readonly proposedDownPayment: Money;
  readonly requestedInstallmentCount: number;
  readonly requestedRepaymentFrequency: RepaymentFrequency;
}

export function assertRequestedFinancingTerms(terms: RequestedFinancingTerms): void {
  assertSameCurrency([terms.deviceCashPrice, terms.proposedDownPayment]);

  if (terms.currency !== terms.deviceCashPrice.currency) {
    throw new Error("Requested-term currency does not match its amounts.");
  }

  if (terms.proposedDownPayment.minorUnits > terms.deviceCashPrice.minorUnits) {
    throw new Error("Proposed down payment cannot exceed the device cash price.");
  }

  if (
    !Number.isSafeInteger(terms.requestedInstallmentCount) ||
    terms.requestedInstallmentCount < 1
  ) {
    throw new Error("Requested installment count must be a positive integer.");
  }
}

export function assertFinancingTerms(terms: FinancingTerms): void {
  assertSameCurrency([
    terms.deviceCashPrice,
    terms.downPayment,
    terms.financedPrincipal,
    terms.financeCharge,
  ]);

  if (terms.currency !== terms.deviceCashPrice.currency) {
    throw new Error("Financing-term currency does not match its amounts.");
  }

  const expectedCashPrice =
    terms.downPayment.minorUnits + terms.financedPrincipal.minorUnits;

  if (terms.deviceCashPrice.minorUnits !== expectedCashPrice) {
    throw new Error(
      "Device cash price must equal down payment plus financed principal.",
    );
  }

  if (!Number.isSafeInteger(terms.installmentCount) || terms.installmentCount < 1) {
    throw new Error("Installment count must be a positive integer.");
  }

  if (!Number.isSafeInteger(terms.gracePeriodDays) || terms.gracePeriodDays < 0) {
    throw new Error("Grace period must be a non-negative integer.");
  }

  assertMoney(terms.financeCharge);
}

export function scheduledRepaymentTotal(terms: FinancingTerms): Money {
  assertFinancingTerms(terms);
  return money(
    terms.financedPrincipal.minorUnits + terms.financeCharge.minorUnits,
    terms.currency,
  );
}
