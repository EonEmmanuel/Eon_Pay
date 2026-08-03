import { apiRequest } from "./api";

export type NotificationSeverity = "info" | "success" | "warning" | "critical";

export interface StaffNotification {
  id: string;
  tenantId: string | null;
  branchId: string | null;
  userId: string;
  auditEventId: string;
  code: string;
  title: string;
  message: string;
  severity: NotificationSeverity;
  resourceType: string | null;
  resourceId: string | null;
  actionUrl: string | null;
  readAt: string | null;
  acknowledgedAt: string | null;
  archivedAt: string | null;
  soundPlayedAt: string | null;
  createdAt: string;
}

export interface NotificationPreferences {
  userId: string;
  soundEnabled: boolean;
  soundMinimumSeverity: NotificationSeverity;
  emailEnabled: boolean;
  emailMinimumSeverity: NotificationSeverity;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  updatedAt: string;
}

export interface NotificationResponse {
  items: StaffNotification[];
  unreadCount: number;
}

export const notificationQueryKey = (platform: boolean, tenantId?: string) =>
  ["notifications", platform ? "platform" : tenantId] as const;
export const notificationPreferencesQueryKey = ["notification-preferences"] as const;

function base(platform: boolean) {
  return platform ? "/platform/notifications" : "/notifications";
}

export function getNotifications(platform: boolean) {
  return apiRequest<NotificationResponse>(base(platform), { tenant: !platform });
}

export function getNotificationPreferences(platform: boolean) {
  return apiRequest<NotificationPreferences>(`${base(platform)}/preferences`, {
    tenant: !platform,
  });
}

export function updateNotificationPreferences(
  platform: boolean,
  input: Omit<NotificationPreferences, "userId" | "updatedAt">,
) {
  return apiRequest<NotificationPreferences>(`${base(platform)}/preferences`, {
    method: "PATCH",
    tenant: !platform,
    body: JSON.stringify(input),
  });
}

export function updateNotificationState(
  platform: boolean,
  id: string,
  action: "read" | "acknowledge" | "archive" | "sound-played",
) {
  return apiRequest<StaffNotification>(`${base(platform)}/${id}/${action}`, {
    method: "PATCH",
    tenant: !platform,
  });
}

export function markAllNotificationsRead(platform: boolean) {
  return apiRequest<{ updatedAt: string }>(`${base(platform)}/read-all`, {
    method: "POST",
    tenant: !platform,
  });
}
