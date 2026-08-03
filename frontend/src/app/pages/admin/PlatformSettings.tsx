import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../components/common/AsyncState";
import { SectionCard } from "../../components/common/SectionCard";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { cn } from "../../components/ui/utils";
import {
  getPlatformSettings,
  platformSettingsQueryKey,
  updatePlatformSetting,
  type PlatformSetting,
} from "../../lib/analytics";
import { useAuth } from "../../lib/auth";
import { dateTime } from "../../lib/format";

type GeneralSettings = {
  platformName: string;
  baseDomain: string;
  accentColor: string;
  notificationsEmail: string;
  toggles: Record<string, boolean>;
};
const toggleLabels: Record<string, { label: string; description: string }> = {
  whiteLabelBranding: {
    label: "White-label branding",
    description: "Allow retailer-specific visual identity.",
  },
  customDomains: {
    label: "Custom domains",
    description: "Allow verified retailer domain mappings.",
  },
  requireStaffMfa: {
    label: "Require platform staff MFA",
    description: "Require a Supabase authenticator factor for every platform role.",
  },
  weeklyDigestEmails: {
    label: "Weekly digest emails",
    description: "Send weekly network summaries.",
  },
};

export function PlatformSettings() {
  const auth = useAuth();
  const canManage = auth.platformPermissions.includes("platform.settings.manage");
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: platformSettingsQueryKey,
    queryFn: getPlatformSettings,
  });
  const setting = query.data?.find((row) => row.key === "general") as
    PlatformSetting<GeneralSettings> | undefined;
  const [form, setForm] = useState<GeneralSettings>();
  useEffect(() => {
    if (setting !== undefined) setForm(structuredClone(setting.value));
  }, [setting]);
  const mutation = useMutation({
    mutationFn: () => {
      if (setting === undefined || form === undefined)
        throw new Error("Settings have not loaded.");
      return updatePlatformSetting("general", form, setting.version);
    },
    onSuccess: async () => {
      toast.success("Platform settings saved.");
      await queryClient.invalidateQueries({ queryKey: platformSettingsQueryKey });
    },
    onError: (error) => toast.error(error.message),
  });

  if (query.isPending || form === undefined)
    return <LoadingState label="Loading platform settings..." />;
  if (query.isError)
    return <ErrorState error={query.error} retry={() => void query.refetch()} />;
  if (setting === undefined)
    return <EmptyState label="General settings are not initialized." />;

  function update<Key extends keyof GeneralSettings>(
    key: Key,
    value: GeneralSettings[Key],
  ) {
    setForm((current) =>
      current === undefined ? current : { ...current, [key]: value },
    );
  }
  function toggle(key: string) {
    setForm((current) =>
      current === undefined
        ? current
        : { ...current, toggles: { ...current.toggles, [key]: !current.toggles[key] } },
    );
  }

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle={`Platform-wide configuration · version ${setting.version} · updated ${dateTime(setting.updatedAt)}`}
        breadcrumb={["Operations", "Settings"]}
        actions={
          canManage ? (
            <Button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              busy={mutation.isPending}
            >
              <Save className="size-4" />{" "}
              {mutation.isPending ? "Saving..." : "Save changes"}
            </Button>
          ) : undefined
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Brand and routing">
          <div className="space-y-4">
            <Field label="Platform name" id="platform-name">
              <Input
                id="platform-name"
                value={form.platformName}
                onChange={(event) => update("platformName", event.target.value)}
                minLength={2}
                maxLength={120}
                disabled={!canManage}
              />
            </Field>
            <Field label="Base domain" id="base-domain">
              <div className="relative">
                <Globe className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="base-domain"
                  value={form.baseDomain}
                  onChange={(event) => update("baseDomain", event.target.value)}
                  className="pl-9 font-mono"
                  maxLength={253}
                  disabled={!canManage}
                />
              </div>
            </Field>
            <Field label="Accent color" id="accent-color">
              <Input
                id="accent-color"
                value={form.accentColor}
                onChange={(event) => update("accentColor", event.target.value)}
                maxLength={80}
                disabled={!canManage}
              />
            </Field>
            <Field label="Operations notification email" id="notifications-email">
              <Input
                id="notifications-email"
                type="email"
                value={form.notificationsEmail}
                onChange={(event) => update("notificationsEmail", event.target.value)}
                maxLength={254}
                disabled={!canManage}
              />
            </Field>
          </div>
        </SectionCard>
        <SectionCard title="Platform controls" bodyClassName="p-0">
          <div className="divide-y divide-white/6">
            {Object.entries(form.toggles).map(([key, enabled]) => {
              const metadata = toggleLabels[key] ?? {
                label: key,
                description: "Platform feature control.",
              };
              return (
                <div key={key} className="flex items-center gap-4 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{metadata.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {metadata.description}
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    onClick={() => toggle(key)}
                    disabled={!canManage}
                    className={cn(
                      "relative h-6 w-11 shrink-0 rounded-full",
                      enabled ? "bg-primary" : "bg-white/12",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 size-5 rounded-full bg-white transition-all",
                        enabled ? "left-[22px]" : "left-0.5",
                      )}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        </SectionCard>
      </div>
    </>
  );
}

function Field({
  label,
  id,
  children,
}: {
  label: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
