import { assertMoney, type Money } from "./money.js";
import type {
  ApplicationId,
  ContractId,
  FeeAssessmentId,
  InstallmentId,
  IsoDate,
  IsoInstant,
  JournalEntryId,
  PaymentId,
  TenantId,
  UserId,
} from "./shared.js";

export type FeeKind =
  | "origination"
  | "late_payment"
  | "collection"
  | "device_restriction"
  | "restructuring"
  | "other";

export type FeeSubject =
  | {
      readonly type: "application";
      readonly applicationId: ApplicationId;
    }
  | {
      readonly type: "contract";
      readonly contractId: ContractId;
    }
  | {
      readonly type: "installment";
      readonly contractId: ContractId;
      readonly installmentId: InstallmentId;
    }
  | {
      readonly type: "payment";
      readonly contractId: ContractId;
      readonly paymentId: PaymentId;
    };

export type FeeLifecycleStatus = "assessed" | "waived" | "reversed";

export interface FeeCalculationSnapshot {
  readonly method: "fixed" | "percentage";
  readonly basisAmount?: Money;
  readonly rateBasisPoints?: number;
  readonly policyCode: string;
  readonly policyVersion: number;
}

/**
 * An explicit charge assessed under a versioned fee policy. Whether the fee is
 * paid is derived from payment allocations and the ledger.
 */
export interface FeeAssessment {
  readonly id: FeeAssessmentId;
  readonly tenantId: TenantId;
  readonly subject: FeeSubject;
  readonly kind: FeeKind;
  readonly amount: Money;
  readonly calculation: FeeCalculationSnapshot;
  readonly status: FeeLifecycleStatus;
  readonly assessedAt: IsoInstant;
  readonly dueDate?: IsoDate;
  readonly ledgerEntryId: JournalEntryId;
  readonly waivedAt?: IsoInstant;
  readonly waivedBy?: UserId;
  readonly waiverReason?: string;
  readonly waiverEntryId?: JournalEntryId;
  readonly reversedAt?: IsoInstant;
  readonly reversalEntryId?: JournalEntryId;
}

export function assertFeeAssessment(fee: FeeAssessment): void {
  assertMoney(fee.amount);

  if (fee.amount.minorUnits === 0) {
    throw new Error("A fee assessment must have a positive amount.");
  }

  if (
    !Number.isSafeInteger(fee.calculation.policyVersion) ||
    fee.calculation.policyVersion < 1
  ) {
    throw new Error("Fee policy version must be a positive integer.");
  }

  if (fee.calculation.method === "percentage") {
    if (
      fee.calculation.basisAmount === undefined ||
      fee.calculation.rateBasisPoints === undefined
    ) {
      throw new Error(
        "A percentage fee requires a basis amount and rate in basis points.",
      );
    }

    assertMoney(fee.calculation.basisAmount);

    if (
      !Number.isSafeInteger(fee.calculation.rateBasisPoints) ||
      fee.calculation.rateBasisPoints < 0
    ) {
      throw new Error("Fee rate basis points must be a non-negative integer.");
    }
  }

  if (
    fee.status === "waived" &&
    (fee.waivedAt === undefined ||
      fee.waivedBy === undefined ||
      fee.waiverReason === undefined ||
      fee.waiverEntryId === undefined)
  ) {
    throw new Error("A waived fee requires complete waiver metadata.");
  }

  if (
    fee.status === "reversed" &&
    (fee.reversedAt === undefined || fee.reversalEntryId === undefined)
  ) {
    throw new Error("A reversed fee requires reversal metadata.");
  }
}

const feeTransitions: Readonly<
  Record<FeeLifecycleStatus, readonly FeeLifecycleStatus[]>
> = {
  assessed: ["waived", "reversed"],
  waived: [],
  reversed: [],
};

export function canTransitionFee(
  from: FeeLifecycleStatus,
  to: FeeLifecycleStatus,
): boolean {
  return feeTransitions[from].includes(to);
}
