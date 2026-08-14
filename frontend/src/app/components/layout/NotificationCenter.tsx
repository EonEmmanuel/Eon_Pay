import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Archive,
  Bell,
  BellOff,
  BellRing,
  Check,
  CheckCheck,
  CircleAlert,
  Clock,
  ExternalLink,
  Filter,
  Inbox,
  Info,
  Mail,
  RotateCcw,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Trash2,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { cn } from "../ui/utils";

type FilterTab = "all" | "unread" | "critical";

export function NotificationCenter({
  platform = false,
  side = "top",
  align = "end",
  className,
}: {
  platform?: boolean;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  className?: string;
}) {
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");
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
    onSuccess: async () => {
      await invalidate();
      toast.success("All notifications marked as read.");
    },
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
    const uniqueId = Math.random().toString(36).slice(2, 9);
    const channel = client
      .channel(`notifications:${platform ? "platform" : (auth.tenantId ?? "tenant")}:${uniqueId}`)
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
  const items = notifications.data?.items ?? [];

  const filteredItems = useMemo(() => {
    if (activeFilter === "unread") return items.filter((item) => item.readAt === null);
    if (activeFilter === "critical")
      return items.filter((item) => ["warning", "critical"].includes(item.severity));
    return items;
  }, [items, activeFilter]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={
            className ??
            "group relative grid size-8.5 shrink-0 place-items-center rounded-xl text-muted-foreground transition-all hover:bg-sidebar-accent hover:text-foreground focus:outline-none"
          }
          aria-label={`Open notifications${unread > 0 ? `, ${unread} unread` : ""}`}
          title="Notifications"
        >
          {unread > 0 ? (
            <BellRing className="size-4.5 anim-bell text-primary" />
          ) : (
            <Bell className="size-4.5 anim-bell" />
          )}
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-primary font-mono text-[9px] font-bold text-primary-foreground shadow-2xs">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        side={side}
        align={align}
        sideOffset={12}
        className="w-[min(26rem,calc(100vw-1.5rem))] p-0 border border-border/90 bg-popover text-foreground shadow-2xl z-50 rounded-2xl overflow-hidden backdrop-blur-xl"
      >
        {/* Header Section */}
        <div className="flex items-center justify-between border-b border-border bg-card/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary">
              <Bell className="size-3.5" />
            </div>
            <div>
              <div className="font-semibold text-sm leading-tight">
                {platform ? "Platform Alerts" : "Notifications"}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {unread > 0 ? `${unread} unread updates` : "All caught up"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-8 rounded-lg text-muted-foreground hover:text-foreground"
              aria-label="Mark all notifications as read"
              disabled={unread === 0 || readAll.isPending}
              title="Mark all as read"
              onClick={() => readAll.mutate()}
            >
              <CheckCheck className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "size-8 rounded-lg text-muted-foreground hover:text-foreground transition-colors",
                settingsOpen && "bg-accent text-foreground",
              )}
              aria-label="Notification preferences"
              title="Notification settings"
              onClick={() => setSettingsOpen((current) => !current)}
            >
              <Settings2 className="size-4" />
            </Button>
          </div>
        </div>

        {/* Filter Pills Bar */}
        <div className="flex items-center gap-1.5 border-b border-border/80 bg-muted/20 px-3 py-1.5 text-xs">
          {[
            { key: "all", label: "All", count: items.length },
            { key: "unread", label: "Unread", count: unread },
            {
              key: "critical",
              label: "High Priority",
              count: items.filter((i) => ["warning", "critical"].includes(i.severity)).length,
            },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveFilter(tab.key as FilterTab)}
              className={cn(
                "rounded-lg px-2.5 py-1 text-[11px] font-medium transition-all",
                activeFilter === tab.key
                  ? "bg-card text-foreground font-semibold shadow-xs border border-border/80"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className="ml-1.5 font-mono text-[10px] opacity-70">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Preferences Drawer */}
        {settingsOpen && currentPreferences !== undefined && (
          <div className="space-y-3.5 border-b border-border bg-muted/40 p-4 text-xs animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="font-semibold text-foreground flex items-center justify-between">
              <span>Alert Preferences</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[11px] px-2 text-muted-foreground"
                onClick={() => setSettingsOpen(false)}
              >
                Done
              </Button>
            </div>

            <PreferenceRow
              icon={<Volume2 className="size-3.5 text-primary" />}
              label="Sound alerts"
              detail="Audio chime on critical events"
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
              icon={<Mail className="size-3.5 text-primary" />}
              label="Email digests"
              detail="Delivered to registered email"
            >
              <Switch
                aria-label="Enable notification email"
                checked={currentPreferences.emailEnabled}
                onCheckedChange={(checked) => savePreference({ emailEnabled: checked })}
              />
            </PreferenceRow>

            <PreferenceRow
              icon={<BellOff className="size-3.5 text-muted-foreground" />}
              label="Quiet hours (22:00 - 07:00)"
              detail="Mute chimes during nighttime"
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
          </div>
        )}

        {/* Notification Feed List */}
        <div className="no-scrollbar max-h-[26rem] overflow-y-auto" aria-live="polite">
          {notifications.isPending ? (
            <div className="flex flex-col items-center justify-center py-10 text-xs text-muted-foreground gap-2">
              <RotateCcw className="size-4 animate-spin text-primary" />
              <span>Loading notifications...</span>
            </div>
          ) : notifications.isError ? (
            <div className="py-8 text-center text-xs text-destructive">
              Notifications could not be loaded.
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <div className="grid size-12 place-items-center rounded-2xl bg-muted/60 text-muted-foreground mb-2.5">
                <Inbox className="size-6 stroke-[1.5]" />
              </div>
              <div className="font-semibold text-xs text-foreground">No notifications</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {activeFilter === "unread"
                  ? "You have reviewed all current notifications."
                  : "New ledger alerts, device Knox events, and customer payouts will appear here."}
              </div>
            </div>
          ) : (
            filteredItems.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "group relative border-b border-border/70 p-3.5 transition-colors hover:bg-accent/40 last:border-0",
                  item.readAt === null && "bg-primary/[0.04]",
                )}
              >
                <div className="flex items-start gap-3">
                  {/* Severity Icon Badge */}
                  <div
                    className={cn(
                      "grid size-8 shrink-0 place-items-center rounded-xl border mt-0.5 shadow-2xs",
                      severityBadgeStyle(item.severity),
                    )}
                  >
                    {item.severity === "critical" ? (
                      <ShieldAlert className="size-4" />
                    ) : item.severity === "warning" ? (
                      <AlertCircle className="size-4" />
                    ) : item.severity === "success" ? (
                      <ShieldCheck className="size-4" />
                    ) : (
                      <Info className="size-4" />
                    )}
                  </div>

                  {/* Body Content */}
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => void openNotification(item.id, item.actionUrl)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-xs text-foreground leading-tight">
                        {item.title}
                      </span>
                      {item.readAt === null && (
                        <span className="size-2 shrink-0 rounded-full bg-primary mt-1" />
                      )}
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground line-clamp-2">
                      {item.message}
                    </p>
                    <div className="mt-1.5 flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                      <Clock className="size-3" />
                      <span>{dateTime(item.createdAt)}</span>
                    </div>
                  </button>
                </div>

                {/* Inline Action Row */}
                <div className="mt-2 flex items-center justify-end gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                  {item.acknowledgedAt === null &&
                    ["warning", "critical"].includes(item.severity) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 rounded-md text-[10px] px-2"
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
                    className="size-6 rounded-md text-muted-foreground hover:text-foreground"
                    aria-label={`Archive ${item.title}`}
                    title="Archive notification"
                    onClick={() =>
                      stateMutation.mutate({ id: item.id, action: "archive" })
                    }
                  >
                    <Archive className="size-3" />
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
  icon,
  label,
  detail,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  detail: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="grid size-6 shrink-0 place-items-center rounded-lg bg-card border border-border">
          {icon}
        </div>
        <div>
          <div className="font-medium text-foreground">{label}</div>
          <div className="text-[10px] text-muted-foreground">{detail}</div>
        </div>
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

function severityBadgeStyle(value: NotificationSeverity) {
  if (value === "critical") return "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30";
  if (value === "warning") return "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30";
  if (value === "success") return "bg-emerald-500/15 text-emerald-600 dark:text-[#00DF81] border-emerald-500/30";
  return "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30";
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

