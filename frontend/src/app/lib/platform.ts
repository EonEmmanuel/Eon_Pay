import { apiRequest } from "./api";
import type { TenantOnboardingStatus } from "./organization";

export interface PlatformInvitation {
  id: string;
  email: string;
  fullName: string;
  status: "pending" | "accepted" | "expired" | "revoked";
  deliveryStatus: "pending" | "sent" | "failed";
  deliveryError: "not_configured" | "provider_rejected" | "unexpected_error" | null;
  requiresPasswordSetup: boolean;
  sentAt: string | null;
  expiresAt: string;
}

export interface PlatformTenant {
  id: string;
  slug: string;
  name: string;
  active: boolean;
  createdAt: string;
  onboardingStatus: TenantOnboardingStatus;
  archivedAt: string | null;
  archivedBy: string | null;
  archiveReason: string | null;
  ownerInvitation?: PlatformInvitation;
  updatedAt: string;
}

export interface CreatePlatformTenant {
  slug: string;
  name: string;
  ownerName: string;
  ownerEmail: string;
  branchCode: string;
  branchName: string;
}

export const platformTenantsQueryKey = ["platform", "tenants"] as const;

export function listPlatformTenants(): Promise<PlatformTenant[]> {
  return apiRequest<PlatformTenant[]>("/platform/tenants", { tenant: false });
}

export function createPlatformTenant(
  input: CreatePlatformTenant,
): Promise<PlatformTenant> {
  return apiRequest<PlatformTenant>("/platform/tenants", {
    method: "POST",
    tenant: false,
    body: JSON.stringify(input),
  });
}

export function resendPlatformOwnerInvitation(
  tenantId: string,
): Promise<PlatformInvitation> {
  return apiRequest<PlatformInvitation>(
    `/platform/tenants/${tenantId}/owner-invitation/resend`,
    {
      method: "POST",
      tenant: false,
    },
  );
}
export function archivePlatformTenant(
  tenantId: string,
  reason: string,
): Promise<PlatformTenant> {
  return apiRequest<PlatformTenant>(`/platform/tenants/${tenantId}`, {
    method: "DELETE",
    tenant: false,
    body: JSON.stringify({ reason }),
  });
}
