import type { DeviceSnapshot } from "./device.js";
import {
  assertRequestedFinancingTerms,
  assertFinancingTerms,
  type FinancingTerms,
  type RequestedFinancingTerms,
} from "./terms.js";
import {
  assertPositiveVersion,
  type AggregateMetadata,
  type ApplicationId,
  type BranchId,
  type ContractId,
  type CustomerId,
  type IsoInstant,
  type TenantId,
  type UserId,
} from "./shared.js";

export type ApplicationStatus =
  | "draft"
  | "submitted"
  | "kyc_review"
  | "credit_review"
  | "approved"
  | "rejected"
  | "cancelled"
  | "expired";

export type KycStatus =
  "not_started" | "pending" | "verified" | "needs_correction" | "failed";

export interface ApplicantSnapshot {
  readonly fullName: string;
  readonly phone: string;
  readonly email?: string;
  readonly nationalIdReference?: string;
}

export interface ApplicationDecision {
  readonly outcome: "approved" | "rejected";
  readonly reasonCode: string;
  readonly notes?: string;
  readonly decidedBy: UserId;
  readonly decidedAt: IsoInstant;
}

/**
 * Captures customer intent, underwriting inputs, and the approval decision.
 * It never carries an account balance; approval creates a separate Contract.
 */
export interface FinancingApplication extends AggregateMetadata {
  readonly id: ApplicationId;
  readonly tenantId: TenantId;
  readonly branchId: BranchId;
  readonly customerId?: CustomerId;
  readonly applicant: ApplicantSnapshot;
  readonly device: DeviceSnapshot;
  readonly requestedTerms: RequestedFinancingTerms;
  readonly approvedTerms?: FinancingTerms;
  readonly kycStatus: KycStatus;
  readonly status: ApplicationStatus;
  readonly submittedAt?: IsoInstant;
  readonly decision?: ApplicationDecision;
  readonly convertedContractId?: ContractId;
}

const applicationTransitions: Readonly<
  Record<ApplicationStatus, readonly ApplicationStatus[]>
> = {
  draft: ["submitted", "cancelled"],
  submitted: ["kyc_review", "cancelled", "expired"],
  kyc_review: ["credit_review", "rejected", "cancelled", "expired"],
  credit_review: ["approved", "rejected", "cancelled", "expired"],
  approved: [],
  rejected: [],
  cancelled: [],
  expired: [],
};

export function canTransitionApplication(
  from: ApplicationStatus,
  to: ApplicationStatus,
): boolean {
  return applicationTransitions[from].includes(to);
}

export function assertApplication(application: FinancingApplication): void {
  assertPositiveVersion(application.version);
  assertRequestedFinancingTerms(application.requestedTerms);

  const submittedStatuses: readonly ApplicationStatus[] = [
    "submitted",
    "kyc_review",
    "credit_review",
    "approved",
    "rejected",
    "expired",
  ];

  if (
    submittedStatuses.includes(application.status) &&
    application.submittedAt === undefined
  ) {
    throw new Error("A non-draft application must have a submission timestamp.");
  }

  if (application.approvedTerms !== undefined) {
    assertFinancingTerms(application.approvedTerms);
  }

  if (application.status === "approved") {
    if (
      application.approvedTerms === undefined ||
      application.decision?.outcome !== "approved"
    ) {
      throw new Error(
        "An approved application requires approved terms and an approval decision.",
      );
    }

    if (application.kycStatus !== "verified") {
      throw new Error("An approved application requires verified KYC.");
    }
  }

  if (
    application.status === "rejected" &&
    application.decision?.outcome !== "rejected"
  ) {
    throw new Error("A rejected application requires a rejection decision.");
  }

  if (
    application.convertedContractId !== undefined &&
    application.status !== "approved"
  ) {
    throw new Error("Only an approved application can be converted to a contract.");
  }
}
