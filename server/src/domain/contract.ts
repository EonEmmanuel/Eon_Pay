import type { DeviceSnapshot } from "./device.js";
import { assertFinancingTerms, type FinancingTerms } from "./terms.js";
import {
  assertPositiveVersion,
  type AggregateMetadata,
  type ApplicationId,
  type BranchId,
  type ContractId,
  type CustomerId,
  type IsoInstant,
  type TenantId,
} from "./shared.js";

export type ContractStatus =
  | "draft"
  | "pending_signature"
  | "cancelled"
  | "active"
  | "past_due"
  | "suspended"
  | "completed"
  | "terminated"
  | "written_off";

/**
 * The legally accepted agreement. Terms and the device snapshot become
 * immutable once the contract is active; amendments must create a new version
 * or a separate adjustment, never rewrite historical terms.
 */
export interface FinancingContract extends AggregateMetadata {
  readonly id: ContractId;
  readonly tenantId: TenantId;
  readonly branchId: BranchId;
  readonly customerId: CustomerId;
  readonly sourceApplicationId: ApplicationId;
  readonly device: DeviceSnapshot;
  readonly terms: FinancingTerms;
  readonly status: ContractStatus;
  readonly signedAt?: IsoInstant;
  readonly activatedAt?: IsoInstant;
  readonly completedAt?: IsoInstant;
  readonly terminatedAt?: IsoInstant;
}

const contractTransitions: Readonly<Record<ContractStatus, readonly ContractStatus[]>> =
  {
    draft: ["pending_signature", "cancelled"],
    pending_signature: ["active", "cancelled"],
    cancelled: [],
    active: ["past_due", "suspended", "completed", "terminated", "written_off"],
    past_due: ["active", "suspended", "completed", "terminated", "written_off"],
    suspended: ["active", "past_due", "terminated", "written_off"],
    completed: [],
    terminated: [],
    written_off: [],
  };

export function canTransitionContract(
  from: ContractStatus,
  to: ContractStatus,
): boolean {
  return contractTransitions[from].includes(to);
}

export function assertContract(contract: FinancingContract): void {
  assertPositiveVersion(contract.version);
  assertFinancingTerms(contract.terms);

  const signedStatuses: readonly ContractStatus[] = [
    "active",
    "past_due",
    "suspended",
    "completed",
    "terminated",
    "written_off",
  ];

  if (signedStatuses.includes(contract.status) && contract.signedAt === undefined) {
    throw new Error("A signed-or-later contract status requires signedAt.");
  }

  const activatedStatuses: readonly ContractStatus[] = [
    "active",
    "past_due",
    "suspended",
    "completed",
    "written_off",
  ];

  if (
    activatedStatuses.includes(contract.status) &&
    contract.activatedAt === undefined
  ) {
    throw new Error("An activated contract status requires activatedAt.");
  }

  if (
    activatedStatuses.includes(contract.status) &&
    !/^\d{15}$/.test(contract.device.imei ?? "")
  ) {
    throw new Error("An activated contract requires a 15-digit device IMEI.");
  }

  if (contract.status === "completed" && contract.completedAt === undefined) {
    throw new Error("A completed contract requires completedAt.");
  }

  if (contract.status === "terminated" && contract.terminatedAt === undefined) {
    throw new Error("A terminated contract requires terminatedAt.");
  }
}
