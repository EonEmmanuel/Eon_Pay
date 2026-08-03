import { apiRequest } from "./api";

export interface RetailerBranch {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type TenantOnboardingStatus =
  | "pending_owner"
  | "business_profile_required"
  | "kyb_required"
  | "kyb_in_review"
  | "branch_setup_required"
  | "configuration_required"
  | "pending_approval"
  | "active"
  | "rejected";

export type BusinessLegalForm =
  | "sole_proprietorship"
  | "limited_liability_company"
  | "public_limited_company"
  | "partnership"
  | "cooperative"
  | "other";

export interface RetailerBusinessProfileInput {
  legalName: string;
  tradingName?: string;
  legalForm: BusinessLegalForm;
  registrationNumber: string;
  taxIdentificationNumber: string;
  countryCode: string;
  registeredAddressLine1: string;
  registeredAddressLine2?: string;
  city: string;
  region?: string;
  postalCode?: string;
  contactEmail: string;
  contactPhone: string;
  websiteUrl?: string;
  incorporationDate?: string;
  baseCurrency: string;
}

export interface RetailerBusinessProfile extends RetailerBusinessProfileInput {
  tenantId: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface RetailerBusinessProfileResponse {
  tenantId: string;
  tenantName: string;
  onboardingStatus: TenantOnboardingStatus;
  profile: RetailerBusinessProfile | null;
}

export interface StaffRole {
  id: string;
  key: string;
  name: string;
  system: boolean;
  permissions: string[];
  accessPolicy: "tenant_wide" | "branch_required" | "flexible";
  requiresOwnerAuthority: boolean;
}

export interface StaffMembership {
  id: string;
  userId: string;
  email: string | null;
  displayName: string | null;
  status: "invited" | "active" | "suspended" | "revoked";
  allBranches: boolean;
  createdAt: string;
  isCurrentUser: boolean;
  roles: Array<{ id: string; key: string; name: string }>;
  branches: Array<Pick<RetailerBranch, "id" | "code" | "name" | "active">>;
}

export interface StaffInvitation {
  id: string;
  email: string;
  fullName: string;
  roleId: string;
  roleKey: string;
  roleName: string;
  allBranches: boolean;
  status: "pending" | "accepted" | "expired" | "revoked";
  deliveryStatus: "pending" | "sent" | "failed";
  deliveryError: string | null;
  requiresPasswordSetup: boolean;
  sentAt: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
  branches: Array<Pick<RetailerBranch, "id" | "code" | "name" | "active">>;
}

export interface StaffAccessInput {
  allBranches: boolean;
  branchIds: string[];
}

export interface InviteStaffInput extends StaffAccessInput {
  email: string;
  fullName: string;
  roleId: string;
}

export const branchQueryKey = (tenantId?: string) =>
  ["tenant", tenantId, "branches"] as const;
export const staffQueryKey = (tenantId?: string) =>
  ["tenant", tenantId, "staff"] as const;
export const staffInvitationQueryKey = (tenantId?: string) =>
  ["tenant", tenantId, "staff-invitations"] as const;
export const staffRoleQueryKey = (tenantId?: string) =>
  ["tenant", tenantId, "staff-roles"] as const;
export const businessProfileQueryKey = (tenantId?: string) =>
  ["tenant", tenantId, "business-profile"] as const;

export function getBusinessProfile(): Promise<RetailerBusinessProfileResponse> {
  return apiRequest<RetailerBusinessProfileResponse>("/business-profile");
}

export function updateBusinessProfile(
  input: RetailerBusinessProfileInput,
): Promise<RetailerBusinessProfileResponse> {
  return apiRequest<RetailerBusinessProfileResponse>("/business-profile", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function getBranches(): Promise<RetailerBranch[]> {
  return apiRequest<RetailerBranch[]>("/branches");
}

export function createBranch(input: {
  code: string;
  name: string;
}): Promise<RetailerBranch> {
  return apiRequest<RetailerBranch>("/branches", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateBranch(
  branchId: string,
  input: { name?: string; active?: boolean },
): Promise<RetailerBranch> {
  return apiRequest<RetailerBranch>(`/branches/${branchId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function getStaff(): Promise<StaffMembership[]> {
  return apiRequest<StaffMembership[]>("/memberships");
}

export function getStaffInvitations(): Promise<StaffInvitation[]> {
  return apiRequest<StaffInvitation[]>("/membership-invitations");
}

export function getStaffRoles(): Promise<StaffRole[]> {
  return apiRequest<StaffRole[]>("/roles");
}

export function inviteStaff(input: InviteStaffInput): Promise<StaffInvitation> {
  return apiRequest<StaffInvitation>("/membership-invitations", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function resendStaffInvitation(invitationId: string): Promise<StaffInvitation> {
  return apiRequest<StaffInvitation>(`/membership-invitations/${invitationId}/resend`, {
    method: "POST",
  });
}

export function revokeStaffInvitation(invitationId: string): Promise<StaffInvitation> {
  return apiRequest<StaffInvitation>(`/membership-invitations/${invitationId}/revoke`, {
    method: "POST",
  });
}

export function updateStaffStatus(
  membershipId: string,
  status: "active" | "suspended" | "revoked",
): Promise<StaffMembership> {
  return apiRequest<StaffMembership>(`/memberships/${membershipId}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function updateStaffAccess(
  membershipId: string,
  input: StaffAccessInput,
): Promise<StaffAccessInput> {
  return apiRequest<StaffAccessInput>(`/memberships/${membershipId}/access`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function assignStaffRole(
  membershipId: string,
  roleId: string,
): Promise<{ membershipId: string; roleId: string }> {
  return apiRequest(`/memberships/${membershipId}/roles`, {
    method: "POST",
    body: JSON.stringify({ roleId }),
  });
}

export function revokeStaffRole(
  membershipId: string,
  roleId: string,
): Promise<{ membershipId: string; roleId: string; revoked: boolean }> {
  return apiRequest(`/memberships/${membershipId}/roles/${roleId}`, {
    method: "DELETE",
  });
}
