export type Brand<Value, Name extends string> = Value & {
  readonly __brand: Name;
};

export type TenantId = Brand<string, "TenantId">;
export type BranchId = Brand<string, "BranchId">;
export type UserId = Brand<string, "UserId">;
export type CustomerId = Brand<string, "CustomerId">;
export type DeviceId = Brand<string, "DeviceId">;
export type ApplicationId = Brand<string, "ApplicationId">;
export type ContractId = Brand<string, "ContractId">;
export type InstallmentId = Brand<string, "InstallmentId">;
export type PaymentId = Brand<string, "PaymentId">;
export type PaymentAllocationId = Brand<string, "PaymentAllocationId">;
export type FeeAssessmentId = Brand<string, "FeeAssessmentId">;
export type LedgerAccountId = Brand<string, "LedgerAccountId">;
export type JournalEntryId = Brand<string, "JournalEntryId">;
export type JournalLineId = Brand<string, "JournalLineId">;

export type IsoDate = Brand<string, "IsoDate">;
export type IsoInstant = Brand<string, "IsoInstant">;

export interface AggregateMetadata {
  readonly version: number;
  readonly createdAt: IsoInstant;
  readonly updatedAt: IsoInstant;
}

export function assertPositiveVersion(version: number): void {
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new Error("Aggregate version must be a positive safe integer.");
  }
}
