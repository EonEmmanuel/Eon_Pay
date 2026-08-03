import { assertApplication, type FinancingApplication } from "./application.js";
import { assertContract, type FinancingContract } from "./contract.js";
import { assertFeeAssessment, type FeeAssessment } from "./fee.js";
import { assertInstallment, type Installment } from "./installment.js";
import { assertBalancedJournalEntry, type JournalEntry } from "./ledger.js";
import {
  assertPaymentAllocations,
  type Payment,
  type PaymentAllocation,
} from "./payment.js";

export function assertApplicationConvertedToContract(
  application: FinancingApplication,
  contract: FinancingContract,
): void {
  assertApplication(application);
  assertContract(contract);

  if (application.status !== "approved") {
    throw new Error("A contract can only originate from an approved application.");
  }

  if (application.convertedContractId !== contract.id) {
    throw new Error("Application does not reference the generated contract.");
  }

  if (contract.sourceApplicationId !== application.id) {
    throw new Error("Contract does not reference its source application.");
  }

  if (
    contract.tenantId !== application.tenantId ||
    contract.branchId !== application.branchId
  ) {
    throw new Error(
      "Application-to-contract conversion crosses an ownership boundary.",
    );
  }

  if (
    application.customerId !== undefined &&
    application.customerId !== contract.customerId
  ) {
    throw new Error("Application and contract reference different customers.");
  }

  if (application.approvedTerms === undefined) {
    throw new Error("Approved application terms are missing.");
  }

  const applicationTerms = application.approvedTerms;
  const contractTerms = contract.terms;
  const termsMatch =
    applicationTerms.currency === contractTerms.currency &&
    applicationTerms.deviceCashPrice.minorUnits ===
      contractTerms.deviceCashPrice.minorUnits &&
    applicationTerms.downPayment.minorUnits === contractTerms.downPayment.minorUnits &&
    applicationTerms.financedPrincipal.minorUnits ===
      contractTerms.financedPrincipal.minorUnits &&
    applicationTerms.financeCharge.minorUnits ===
      contractTerms.financeCharge.minorUnits &&
    applicationTerms.installmentCount === contractTerms.installmentCount &&
    applicationTerms.repaymentFrequency === contractTerms.repaymentFrequency &&
    applicationTerms.firstDueDate === contractTerms.firstDueDate &&
    applicationTerms.gracePeriodDays === contractTerms.gracePeriodDays;

  if (!termsMatch) {
    throw new Error("Contract terms differ from the approved application snapshot.");
  }

  if (application.device.deviceId !== contract.device.deviceId) {
    throw new Error("Contract device differs from the approved application.");
  }
}

export function assertInstallmentSchedule(
  contract: FinancingContract,
  installments: readonly Installment[],
): void {
  assertContract(contract);

  if (installments.length !== contract.terms.installmentCount) {
    throw new Error("Installment row count does not match the contract terms.");
  }

  const sorted = [...installments].sort(
    (left, right) => left.sequence - right.sequence,
  );
  const installmentIds = new Set<string>();
  let previousDueDate: string | undefined;
  let principalTotal = 0;
  let financeChargeTotal = 0;

  for (const [index, installment] of sorted.entries()) {
    assertInstallment(installment);

    if (
      installment.contractId !== contract.id ||
      installment.tenantId !== contract.tenantId
    ) {
      throw new Error("Installment schedule crosses a contract or tenant boundary.");
    }

    if (installment.sequence !== index + 1) {
      throw new Error("Installment sequence must be contiguous and start at one.");
    }

    if (installmentIds.has(installment.id)) {
      throw new Error("Installment IDs must be unique.");
    }

    if (previousDueDate !== undefined && installment.dueDate <= previousDueDate) {
      throw new Error("Installment due dates must be strictly increasing.");
    }

    installmentIds.add(installment.id);
    previousDueDate = installment.dueDate;
    principalTotal += installment.principalDue.minorUnits;
    financeChargeTotal += installment.financeChargeDue.minorUnits;
  }

  if (
    !Number.isSafeInteger(principalTotal) ||
    !Number.isSafeInteger(financeChargeTotal)
  ) {
    throw new Error("Installment schedule totals exceed the safe integer range.");
  }

  if (sorted[0]?.dueDate !== contract.terms.firstDueDate) {
    throw new Error("First installment date does not match the contract terms.");
  }

  if (principalTotal !== contract.terms.financedPrincipal.minorUnits) {
    throw new Error("Scheduled principal does not equal financed principal.");
  }

  if (financeChargeTotal !== contract.terms.financeCharge.minorUnits) {
    throw new Error("Scheduled finance charge does not equal contract finance charge.");
  }
}

export function assertPaymentAccounting(
  payment: Payment,
  allocations: readonly PaymentAllocation[],
  journalEntry: JournalEntry,
): void {
  assertPaymentAllocations(payment, allocations);
  assertBalancedJournalEntry(journalEntry);

  if (journalEntry.source.type !== "payment" || journalEntry.source.id !== payment.id) {
    throw new Error("Payment journal entry has the wrong source.");
  }

  if (
    journalEntry.tenantId !== payment.tenantId ||
    journalEntry.id !== payment.ledgerEntryId
  ) {
    throw new Error("Payment and journal entry are not correctly linked.");
  }

  const debitTotal = journalEntry.lines
    .filter((line) => line.side === "debit")
    .reduce((total, line) => total + line.amount.minorUnits, 0);

  if (debitTotal !== payment.amount.minorUnits) {
    throw new Error("Payment journal amount does not equal the settled payment.");
  }
}

export function assertFeeAccounting(
  fee: FeeAssessment,
  journalEntry: JournalEntry,
): void {
  assertFeeAssessment(fee);
  assertBalancedJournalEntry(journalEntry);

  if (journalEntry.source.type !== "fee" || journalEntry.source.id !== fee.id) {
    throw new Error("Fee journal entry has the wrong source.");
  }

  if (journalEntry.tenantId !== fee.tenantId || journalEntry.id !== fee.ledgerEntryId) {
    throw new Error("Fee assessment and journal entry are not correctly linked.");
  }

  const debitTotal = journalEntry.lines
    .filter((line) => line.side === "debit")
    .reduce((total, line) => total + line.amount.minorUnits, 0);

  if (debitTotal !== fee.amount.minorUnits) {
    throw new Error("Fee journal amount does not equal the assessed fee.");
  }
}
