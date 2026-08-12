import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Bell,
  BellRing,
  CheckCheck,
  CircleAlert,
  Settings2,
  ShieldCheck,
  Volume2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { dateTime } from "../../lib/format";
import {
  getNotificationPreferences,
  getNotifications,
  markAllNotificationsRead,
  notificationPreferencesQueryKey,
  notificationQueryKey,
  type NotificationPreferences,
  type NotificationSeverity,
  updateNotificationPreferences,
  updateNotificationState,
} from "../../lib/notifications";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { Button } from "../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Switch } from "../ui/switch";

export function NotificationCenter({ platform = false }: { platform?: boolean }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const playedThisSession = useRef(new Set<string>());
  const queryKey = notificationQueryKey(platform, auth.tenantId);
  const notifications = useQuery({
    queryKey,
    queryFn: () => getNotifications(platform),
    refetchInterval: 15_000,
  });
  const preferences = useQuery({
    queryKey: notificationPreferencesQueryKey,
    queryFn: () => getNotificationPreferences(platform),
  });
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey });
  };
  const stateMutation = useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      id: string;
      action: Parameters<typeof updateNotificationState>[2];
    }) => updateNotificationState(platform, id, action),
    onSuccess: invalidate,
    onError: (error) => toast.error(error.message),
  });
  const readAll = useMutation({
    mutationFn: () => markAllNotificationsRead(platform),
    onSuccess: invalidate,
    onError: (error) => toast.error(error.message),
  });
  const preferenceMutation = useMutation({
    mutationFn: (input: Omit<NotificationPreferences, "userId" | "updatedAt">) =>
      updateNotificationPreferences(platform, input),
    onSuccess: async (value) => {
      queryClient.setQueryData(notificationPreferencesQueryKey, value);
      if (value.soundEnabled) {
        await enableNotificationAudio();
        toast.success("Notification sound enabled.");
      }
    },
    onError: (error) => toast.error(error.message),
  });

  useEffect(() => {
    const userId = auth.session?.user.id;
    const client = supabase;
    if (client === undefined || userId === undefined) return;
    const channel = client
      .channel(`notifications:${platform ? "platform" : (auth.tenantId ?? "tenant")}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => void invalidate(),
      )
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [auth.session?.user.id, auth.tenantId, platform]);

  useEffect(() => {
    const preference = preferences.data;
    if (preference?.soundEnabled !== true || isQuietHours(preference)) return;
    const item = notifications.data?.items.find(
      (candidate) =>
        candidate.soundPlayedAt === null &&
        !playedThisSession.current.has(candidate.id) &&
        severityRank(candidate.severity) >=
          severityRank(preference.soundMinimumSeverity) &&
        Date.now() - new Date(candidate.createdAt).getTime() < 2 * 60_000,
    );
    if (item === undefined) return;
    playedThisSession.current.add(item.id);
    void playNotificationChime(item.severity);
    if (
      document.hidden &&
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      new Notification(item.title, { body: item.message, tag: item.id });
    }
    stateMutation.mutate({ id: item.id, action: "sound-played" });
  }, [notifications.data?.items, preferences.data]);

  const currentPreferences = preferences.data;
  function savePreference(patch: Partial<NotificationPreferences>) {
    const current = currentPreferences;
    if (current === undefined) return;
    preferenceMutation.mutate({
      soundEnabled: patch.soundEnabled ?? current.soundEnabled,
      soundMinimumSeverity: patch.soundMinimumSeverity ?? current.soundMinimumSeverity,
      emailEnabled: patch.emailEnabled ?? current.emailEnabled,
      emailMinimumSeverity: patch.emailMinimumSeverity ?? current.emailMinimumSeverity,
      quietHoursStart: patch.quietHoursStart ?? current.quietHoursStart,
      quietHoursEnd: patch.quietHoursEnd ?? current.quietHoursEnd,
    });
  }
  async function openNotification(id: string, actionUrl: string | null) {
    stateMutation.mutate({ id, action: "read" });
    if (actionUrl !== null) navigate(actionUrl);
  }

  const unread = notifications.data?.unreadCount ?? 0;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={`Open notifications${unread > 0 ? `, ${unread} unread` : ""}`}
        >
          {unread > 0 ? <BellRing className="size-5" /> : <Bell className="size-5" />}
          {unread > 0 && (
            <span className="absolute right-0.5 top-0.5 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[9px] font-bold text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-1rem))] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <div className="font-semibold">
              {platform ? "Platform alerts" : "Notifications"}
            </div>
            <div className="text-xs text-muted-foreground">{unread} unread</div>
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Mark all notifications as read"
              disabled={unread === 0 || readAll.isPending}
              busy={readAll.isPending}
              onClick={() => readAll.mutate()}
            >
              <CheckCheck className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Notification preferences"
              onClick={() => setSettingsOpen((current) => !current)}
            >
              <Settings2 className="size-4" />
            </Button>
          </div>
        </div>
        {settingsOpen && currentPreferences !== undefined && (
          <div className="space-y-4 border-b border-border bg-muted/50 p-4 text-sm">
            <PreferenceRow
              label="Sound alerts"
              detail="Warning and critical alerts by default"
            >
              <Switch
                aria-label="Enable notification sound"
                checked={currentPreferences.soundEnabled}
                onCheckedChange={(checked) => {
                  if (
                    checked &&
                    "Notification" in window &&
                    Notification.permission === "default"
                  ) {
                    void Notification.requestPermission();
                  }
                  savePreference({ soundEnabled: checked });
                }}
              />
            </PreferenceRow>
            <PreferenceRow
              label="Email alerts"
              detail="Delivered through the configured provider"
            >
              <Switch
                aria-label="Enable notification email"
                checked={currentPreferences.emailEnabled}
                onCheckedChange={(checked) => savePreference({ emailEnabled: checked })}
              />
            </PreferenceRow>
            <label className="block text-xs text-muted-foreground">
              Minimum sound severity
              <select
                className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground"
                value={currentPreferences.soundMinimumSeverity}
                onChange={(event) =>
                  savePreference({
                    soundMinimumSeverity: event.target.value as NotificationSeverity,
                  })
                }
              >
                <option value="info">Information</option>
                <option value="success">Success</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical only</option>
              </select>
            </label>
            <label className="block text-xs text-muted-foreground">
              Minimum email severity
              <select
                className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground"
                value={currentPreferences.emailMinimumSeverity}
                onChange={(event) =>
                  savePreference({
                    emailMinimumSeverity: event.target.value as NotificationSeverity,
                  })
                }
              >
                <option value="info">Information</option>
                <option value="success">Success</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical only</option>
              </select>
            </label>
            <PreferenceRow
              label="Quiet hours"
              detail="Suppress sounds during the selected period"
            >
              <Switch
                aria-label="Enable quiet hours"
                checked={currentPreferences.quietHoursStart !== null}
                onCheckedChange={(checked) =>
                  savePreference({
                    quietHoursStart: checked ? "22:00" : null,
                    quietHoursEnd: checked ? "07:00" : null,
                  })
                }
              />
            </PreferenceRow>
            {currentPreferences.quietHoursStart !== null &&
              currentPreferences.quietHoursEnd !== null && (
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs text-muted-foreground">
                    Starts
                    <input
                      type="time"
                      className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-foreground"
                      value={currentPreferences.quietHoursStart}
                      onChange={(event) =>
                        savePreference({ quietHoursStart: event.target.value })
                      }
                    />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Ends
                    <input
                      type="time"
                      className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-foreground"
                      value={currentPreferences.quietHoursEnd}
                      onChange={(event) =>
                        savePreference({ quietHoursEnd: event.target.value })
                      }
                    />
                  </label>
                </div>
              )}
          </div>
        )}
        <div className="scroll-slim max-h-[28rem] overflow-y-auto" aria-live="polite">
          {notifications.isPending ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Loading notifications…
            </div>
          ) : notifications.isError ? (
            <div className="px-4 py-6 text-center text-sm text-destructive">
              Notifications could not be loaded.
            </div>
          ) : notifications.data?.items.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              You are all caught up.
            </div>
          ) : (
            notifications.data?.items.map((item) => (
              <div
                key={item.id}
                className={`border-b border-border p-3 last:border-0 ${item.readAt === null ? "bg-primary/[0.045]" : ""}`}
              >
                <div className="flex gap-3">
                  <span
                    className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl ${severityClass(item.severity)}`}
                  >
                    {item.severity === "critical" ? (
                      <CircleAlert className="size-4" />
                    ) : (
                      <ShieldCheck className="size-4" />
                    )}
                  </span>
                  <button
                    className="min-w-0 flex-1 text-left"
                    onClick={() => void openNotification(item.id, item.actionUrl)}
                  >
                    <div className="flex items-start gap-2">
                      <span className="flex-1 text-sm font-medium">{item.title}</span>
                      {item.readAt === null && (
                        <span
                          className="mt-1.5 size-2 rounded-full bg-primary"
                          aria-label="Unread"
                        />
                      )}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {item.message}
                    </p>
                    <div className="mt-1 text-[10px] text-muted-foreground">
                      {dateTime(item.createdAt)}
                    </div>
                  </button>
                </div>
                <div className="mt-2 flex justify-end gap-1">
                  {item.acknowledgedAt === null &&
                    ["warning", "critical"].includes(item.severity) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          stateMutation.mutate({ id: item.id, action: "acknowledge" })
                        }
                      >
                        Acknowledge
                      </Button>
                    )}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Archive ${item.title}`}
                    onClick={() =>
                      stateMutation.mutate({ id: item.id, action: "archive" })
                    }
                  >
                    <Archive className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PreferenceRow({
  label,
  detail,
  children,
}: {
  label: string;
  detail: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div>{label}</div>
        <div className="text-xs text-muted-foreground">{detail}</div>
      </div>
      {children}
    </div>
  );
}

let audioContext: AudioContext | undefined;
async function enableNotificationAudio() {
  audioContext ??= new AudioContext();
  if (audioContext.state === "suspended") await audioContext.resume();
  await playNotificationChime("success");
}
async function playNotificationChime(severity: NotificationSeverity) {
  audioContext ??= new AudioContext();
  if (audioContext.state === "suspended") return;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = severity === "critical" ? 740 : 560;
  gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.12, audioContext.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.32);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.34);
}
function severityRank(value: NotificationSeverity) {
  return { info: 1, success: 2, warning: 3, critical: 4 }[value];
}
function severityClass(value: NotificationSeverity) {
  if (value === "critical") return "bg-destructive/15 text-destructive";
  if (value === "warning") return "bg-amber-400/15 text-amber-300";
  if (value === "success") return "bg-primary/15 text-primary";
  return "bg-sky-400/15 text-sky-300";
}
function isQuietHours(preference: NotificationPreferences) {
  if (preference.quietHoursStart === null || preference.quietHoursEnd === null)
    return false;
  const current = new Date();
  const now = current.getHours() * 60 + current.getMinutes();
  const minutes = (value: string) =>
    Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  const start = minutes(preference.quietHoursStart);
  const end = minutes(preference.quietHoursEnd);
  return start <= end ? now >= start && now < end : now >= start || now < end;
}
