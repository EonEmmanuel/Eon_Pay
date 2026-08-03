import {
  assertMoney,
  assertSameCurrency,
  type CurrencyCode,
  type Money,
} from "./money.js";
import type {
  ApplicationId,
  ContractId,
  CustomerId,
  FeeAssessmentId,
  InstallmentId,
  IsoInstant,
  JournalEntryId,
  JournalLineId,
  LedgerAccountId,
  PaymentId,
  TenantId,
  UserId,
} from "./shared.js";

export type LedgerAccountType =
  "asset" | "liability" | "equity" | "income" | "expense" | "contra_asset";

export interface LedgerAccount {
  readonly id: LedgerAccountId;
  readonly tenantId: TenantId;
  readonly code: string;
  readonly name: string;
  readonly type: LedgerAccountType;
  readonly currency: CurrencyCode;
  readonly active: boolean;
}

export type JournalSource =
  | { readonly type: "application"; readonly id: ApplicationId }
  | { readonly type: "contract"; readonly id: ContractId }
  | { readonly type: "installment"; readonly id: InstallmentId }
  | { readonly type: "payment"; readonly id: PaymentId }
  | { readonly type: "fee"; readonly id: FeeAssessmentId }
  | { readonly type: "manual"; readonly id: string };

export interface LedgerDimensions {
  readonly customerId?: CustomerId;
  readonly contractId?: ContractId;
  readonly installmentId?: InstallmentId;
  readonly paymentId?: PaymentId;
  readonly feeAssessmentId?: FeeAssessmentId;
}

export interface JournalLine {
  readonly id: JournalLineId;
  readonly accountId: LedgerAccountId;
  readonly side: "debit" | "credit";
  readonly amount: Money;
  readonly memo?: string;
  readonly dimensions: LedgerDimensions;
}

/**
 * A posted, immutable double-entry journal entry. Corrections are new reversal
 * entries; posted entries and lines are never edited or deleted.
 */
export interface JournalEntry {
  readonly id: JournalEntryId;
  readonly tenantId: TenantId;
  readonly source: JournalSource;
  readonly kind: "standard" | "reversal";
  readonly reversesEntryId?: JournalEntryId;
  readonly effectiveAt: IsoInstant;
  readonly postedAt: IsoInstant;
  readonly postedBy: UserId | "system";
  readonly description: string;
  readonly lines: readonly JournalLine[];
}

export function assertBalancedJournalEntry(entry: JournalEntry): void {
  if (entry.lines.length < 2) {
    throw new Error("A journal entry requires at least two lines.");
  }

  if (entry.kind === "reversal" && entry.reversesEntryId === undefined) {
    throw new Error("A reversal journal entry must reference the original entry.");
  }

  if (entry.kind === "standard" && entry.reversesEntryId !== undefined) {
    throw new Error("Only a reversal entry can reference an original entry.");
  }

  const lineIds = new Set<string>();

  for (const line of entry.lines) {
    assertMoney(line.amount);

    if (line.amount.minorUnits === 0) {
      throw new Error("Journal lines must have positive amounts.");
    }

    if (lineIds.has(line.id)) {
      throw new Error("Journal line IDs must be unique.");
    }

    lineIds.add(line.id);
  }

  assertSameCurrency(entry.lines.map((line) => line.amount));

  const debitTotal = entry.lines
    .filter((line) => line.side === "debit")
    .reduce((total, line) => total + line.amount.minorUnits, 0);
  const creditTotal = entry.lines
    .filter((line) => line.side === "credit")
    .reduce((total, line) => total + line.amount.minorUnits, 0);

  if (debitTotal !== creditTotal) {
    throw new Error(
      `Journal entry is unbalanced: debits=${debitTotal}, credits=${creditTotal}.`,
    );
  }
}

export function assertJournalAccountReferences(
  entry: JournalEntry,
  accounts: readonly LedgerAccount[],
): void {
  assertBalancedJournalEntry(entry);
  const accountsById = new Map(
    accounts.map((account) => [account.id, account] as const),
  );

  for (const line of entry.lines) {
    const account = accountsById.get(line.accountId);

    if (account === undefined) {
      throw new Error(`Journal line references an unknown account: ${line.accountId}.`);
    }

    if (account.tenantId !== entry.tenantId) {
      throw new Error("Journal line crosses a tenant boundary.");
    }

    if (!account.active) {
      throw new Error(`Journal line references an inactive account: ${account.code}.`);
    }

    if (account.currency !== line.amount.currency) {
      throw new Error("Journal line currency does not match its account.");
    }
  }
}
