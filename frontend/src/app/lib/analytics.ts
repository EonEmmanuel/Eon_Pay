import { apiRequest } from "./api";

export interface DeviceSnapshot {
  deviceId: string;
  sku: string;
  brand: string;
  model: string;
  storage: string;
  color: string;
  imei?: string;
}

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

export interface AnalyticsCustomer {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  nationalIdReference: string | null;
  branchName: string;
  kycStatus: string;
  status: "active" | "overdue" | "completed" | "prospect";
  outstanding: number;
  contractCount: number;
  createdAt: string;
}

export interface AnalyticsContract {
  id: string;
  branchId: string;
  customerId: string;
  customerName: string;
  branchName: string;
  device: DeviceSnapshot;
  financedPrincipal: number;
  financeCharge: number;
  deviceCashPrice: number;
  downPayment: number;
  installmentCount: number;
  repaymentFrequency: string;
  firstDueDate: string;
  status: ContractStatus;
  paidAmount: number;
  outstanding: number;
  paidInstallments: number;
  nextDueDate: string | null;
  overdueInstallments: number;
  createdAt: string;
  activatedAt: string | null;
}

export interface AnalyticsInstallment {
  id: string;
  contractId: string;
  sequence: number;
  dueDate: string;
  principalDue: number;
  financeChargeDue: number;
  paidAmount: number;
  outstanding: number;
  status: "paid" | "overdue" | "due" | "upcoming";
}

export interface CollectionItem extends AnalyticsInstallment {
  customerId: string | null;
  customerName: string;
  device: DeviceSnapshot | null;
  outstanding: number;
  daysOverdue: number;
}

export interface AnalyticsPayment {
  id: string;
  customerId: string;
  customerName: string;
  contractId: string | null;
  amount: number;
  channel: string;
  status: string;
  initiatedAt: string;
  settledAt: string | null;
}

export interface AnalyticsApplication {
  id: string;
  customerId: string | null;
  applicant: { fullName: string; phone: string; email?: string };
  device: DeviceSnapshot;
  requestedTerms: {
    deviceCashPrice: { minorUnits: number };
    proposedDownPayment: { minorUnits: number };
    requestedInstallmentCount: number;
    requestedRepaymentFrequency: string;
  };
  kycStatus: string;
  status: string;
  submittedAt: string | null;
  createdAt: string;
}

export interface AnalyticsDevice {
  id: string;
  contractId: string;
  provider: string;
  providerDeviceId: string;
  imei: string;
  status: string;
  lastSeenAt: string | null;
  enrolledAt: string | null;
  device: DeviceSnapshot | null;
  customerId: string | null;
  customerName: string;
}

export interface TenantAnalytics {
  generatedAt: string;
  summary: {
    customers: number;
    contracts: number;
    activeContracts: number;
    overdueContracts: number;
    pendingApplications: number;
    financedVolume: number;
    collectedVolume: number;
    outstandingPortfolio: number;
    collectionRate: number;
    managedDevices: number;
    restrictedDevices: number;
  };
  branches: Array<{
    id: string;
    name: string;
    code: string;
    active: boolean;
    contractCount: number;
    financed: number;
    collected: number;
    collectionRate: number;
  }>;
  customers: AnalyticsCustomer[];
  applications: AnalyticsApplication[];
  contracts: AnalyticsContract[];
  installments: AnalyticsInstallment[];
  collections: CollectionItem[];
  payments: AnalyticsPayment[];
  devices: AnalyticsDevice[];
  monthly: Array<{ month: string; financed: number; collected: number }>;
  modelPerformance: Array<{ model: string; units: number; financed: number }>;
  activity: Array<{
    id: string;
    actionCode: string;
    actionLabel: string;
    message: string;
    resourceType: string;
    resourceLabel: string;
    resourceId: string | null;
    occurredAt: string;
  }>;
}

export interface PlatformTenantMetrics {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  onboardingStatus: string;
  archivedAt: string | null;
  archiveReason: string | null;
  createdAt: string;
  branches: number;
  members: number;
  customers: number;
  contracts: number;
  activeContracts: number;
  overdueContracts: number;
  writtenOffContracts: number;
  writtenOffBalance: number;
  financedVolume: number;
  collectedVolume: number;
  pendingApplications: number;
  managedDevices: number;
  restrictedDevices: number;
}

export interface PlatformAnalytics {
  generatedAt: string;
  summary: {
    tenants: number;
    activeTenants: number;
    archivedTenants: number;
    customers: number;
    contracts: number;
    activeContracts: number;
    overdueContracts: number;
    writtenOffContracts: number;
    writtenOffBalance: number;
    financedVolume: number;
    collectedVolume: number;
    pendingApplications: number;
    managedDevices: number;
    restrictedDevices: number;
  };
  tenants: PlatformTenantMetrics[];
  monthly: Array<{ month: string; financed: number; collected: number }>;
}

export interface PlatformUser {
  id: string;
  email: string | null;
  displayName: string | null;
  disabled: boolean;
  createdAt: string;
  updatedAt: string;
  roles: Array<{ roleId: string; roleKey: string; roleName: string }>;
}

export interface PlatformRole {
  id: string;
  key: string;
  name: string;
  permissions: string[];
  assignable: boolean;
}

export interface PlatformInvitation {
  id: string;
  email: string;
  fullName: string;
  roleId: string;
  roleKey: string;
  roleName: string;
  status: "pending" | "accepted" | "expired" | "revoked";
  deliveryStatus: "pending" | "sent" | "failed";
  deliveryError: string | null;
  requiresPasswordSetup: boolean;
  sentAt: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
}
export interface PlatformSetting<Value = Record<string, unknown>> {
  key: "general" | "risk_rules";
  value: Value;
  version: number;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SystemHealth {
  checkedAt: string;
  services: Array<{
    name: string;
    status: "operational" | "down" | "not_configured";
    detail: string;
  }>;
}

export const tenantAnalyticsQueryKey = ["analytics", "tenant"] as const;
export const platformAnalyticsQueryKey = ["analytics", "platform"] as const;
export const platformUsersQueryKey = ["platform", "users"] as const;
export const platformRolesQueryKey = ["platform", "roles"] as const;
export const platformInvitationsQueryKey = ["platform", "invitations"] as const;
export const platformSettingsQueryKey = ["platform", "settings"] as const;

export function getTenantAnalytics(): Promise<TenantAnalytics> {
  return apiRequest<TenantAnalytics>("/analytics/tenant");
}

export function getPlatformAnalytics(): Promise<PlatformAnalytics> {
  return apiRequest<PlatformAnalytics>("/platform/analytics", { tenant: false });
}

export function getPlatformUsers(): Promise<PlatformUser[]> {
  return apiRequest<PlatformUser[]>("/platform/users", { tenant: false });
}

export function updatePlatformUser(
  userId: string,
  input: { displayName: string },
): Promise<PlatformUser> {
  return apiRequest<PlatformUser>(`/platform/users/${userId}`, {
    method: "PATCH",
    tenant: false,
    body: JSON.stringify(input),
  });
}

export function updatePlatformUserAccess(
  userId: string,
  disabled: boolean,
): Promise<PlatformUser> {
  return apiRequest<PlatformUser>(`/platform/users/${userId}/access`, {
    method: "PATCH",
    tenant: false,
    body: JSON.stringify({ disabled }),
  });
}

export function getPlatformRoles(): Promise<PlatformRole[]> {
  return apiRequest<PlatformRole[]>("/platform/roles", { tenant: false });
}

export function assignPlatformRole(userId: string, roleId: string) {
  return apiRequest<{ userId: string; roleId: string }>(
    `/platform/users/${userId}/roles`,
    {
      method: "POST",
      tenant: false,
      body: JSON.stringify({ roleId }),
    },
  );
}

export function revokePlatformRole(userId: string, roleId: string) {
  return apiRequest<{ userId: string; roleId: string }>(
    `/platform/users/${userId}/roles/${roleId}`,
    { method: "DELETE", tenant: false },
  );
}

export function getPlatformInvitations(): Promise<PlatformInvitation[]> {
  return apiRequest<PlatformInvitation[]>("/platform/invitations", {
    tenant: false,
  });
}

export function invitePlatformUser(input: {
  email: string;
  fullName: string;
  roleId: string;
}): Promise<PlatformInvitation> {
  return apiRequest<PlatformInvitation>("/platform/invitations", {
    method: "POST",
    tenant: false,
    body: JSON.stringify(input),
  });
}

export function resendPlatformInvitation(
  invitationId: string,
): Promise<PlatformInvitation> {
  return apiRequest<PlatformInvitation>(
    `/platform/invitations/${invitationId}/resend`,
    { method: "POST", tenant: false },
  );
}

export function revokePlatformInvitation(
  invitationId: string,
): Promise<PlatformInvitation> {
  return apiRequest<PlatformInvitation>(
    `/platform/invitations/${invitationId}/revoke`,
    { method: "POST", tenant: false },
  );
}

export function getPlatformSettings(): Promise<PlatformSetting[]> {
  return apiRequest<PlatformSetting[]>("/platform/settings", { tenant: false });
}

export function updatePlatformSetting(
  key: PlatformSetting["key"],
  value: Record<string, unknown>,
  version: number,
): Promise<PlatformSetting> {
  return apiRequest<PlatformSetting>(`/platform/settings/${key}`, {
    method: "PATCH",
    tenant: false,
    body: JSON.stringify({ value, version }),
  });
}

export function getSystemHealth(): Promise<SystemHealth> {
  return apiRequest<SystemHealth>("/platform/system-health", { tenant: false });
}
