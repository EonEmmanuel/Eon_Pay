import { apiDownload, apiRequest } from "./api";
import type { RetailerBusinessProfile, TenantOnboardingStatus } from "./organization";

export type RetailerKybStatus =
  | "not_started"
  | "in_progress"
  | "in_review"
  | "resubmission_required"
  | "provider_approved"
  | "provider_declined"
  | "approved"
  | "rejected";

export interface RetailerKybCase {
  id: string;
  tenantId: string;
  provider: string;
  providerSessionId: string | null;
  verificationUrl: string | null;
  status: RetailerKybStatus;
  providerStatus: string | null;
  decision: Record<string, unknown> | null;
  decisionReason: string | null;
  riskScore: number | null;
  submittedAt: string | null;
  providerCompletedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TenantKybResponse {
  configured: boolean;
  pollingFallbackEnabled: boolean;
  onboardingStatus: TenantOnboardingStatus;
  case: RetailerKybCase | null;
}

export interface PlatformKybSummary {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  status: RetailerKybStatus;
  providerStatus: string | null;
  riskScore: number | null;
  decisionReason: string | null;
  submittedAt: string | null;
  updatedAt: string;
  legalName: string;
  countryCode: string;
  registrationNumber: string;
}

export interface PlatformKybDetail {
  case: RetailerKybCase;
  tenant: {
    id: string;
    name: string;
    slug: string;
    onboardingStatus: TenantOnboardingStatus;
  };
  profile: RetailerBusinessProfile;
  reviewerName: string | null;
  reviewerEmail: string | null;
  pollingFallbackEnabled: boolean;
}

export const tenantKybQueryKey = (tenantId?: string) =>
  ["tenant", tenantId, "kyb"] as const;
export const platformKybQueryKey = ["platform", "kyb"] as const;

export async function getTenantKyb() {
  const response = await apiRequest<TenantKybResponse>("/retailer/kyb");
  if (
    response.pollingFallbackEnabled &&
    isProviderDecisionPending(response.case?.status)
  ) {
    return apiRequest<TenantKybResponse>("/retailer/kyb/sync", {
      method: "POST",
    });
  }
  return response;
}

export function startTenantKyb(language: "en" | "fr") {
  return apiRequest<{ case: RetailerKybCase; verificationUrl: string }>(
    "/retailer/kyb/session",
    {
      method: "POST",
      body: JSON.stringify({
        language,
        consentAccepted: true,
        consentVersion: "retailer-kyb-v1",
      }),
    },
  );
}

export function listPlatformKyb() {
  return apiRequest<PlatformKybSummary[]>("/platform/kyb/cases", { tenant: false });
}

export async function getPlatformKyb(caseId: string, syncFallback = false) {
  const response = await apiRequest<PlatformKybDetail>(
    `/platform/kyb/cases/${caseId}`,
    {
      tenant: false,
    },
  );
  if (
    syncFallback &&
    response.pollingFallbackEnabled &&
    isProviderDecisionPending(response.case.status)
  ) {
    return apiRequest<PlatformKybDetail>(`/platform/kyb/cases/${caseId}/sync`, {
      method: "POST",
      tenant: false,
    });
  }
  return response;
}

export function isProviderDecisionPending(status?: RetailerKybStatus) {
  return (
    status !== undefined &&
    ["in_progress", "in_review", "resubmission_required"].includes(status)
  );
}

export function syncPlatformKyb(caseId: string) {
  return apiRequest<PlatformKybDetail>(`/platform/kyb/cases/${caseId}/sync`, {
    method: "POST",
    tenant: false,
  });
}

export function reviewPlatformKyb(
  caseId: string,
  input: { action: "approve" | "reject" | "request_resubmission"; notes: string },
) {
  return apiRequest<RetailerKybCase>(`/platform/kyb/cases/${caseId}/review`, {
    method: "PATCH",
    tenant: false,
    body: JSON.stringify(input),
  });
}

export function downloadKybReport(caseId: string) {
  return apiDownload(`/platform/kyb/cases/${caseId}/report`, `kyb-${caseId}.pdf`);
}
