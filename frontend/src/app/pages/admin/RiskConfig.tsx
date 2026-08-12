import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../components/common/AsyncState";
import { SectionCard } from "../../components/common/SectionCard";
import { StatusBadge } from "../../components/common/StatusBadge";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { cn } from "../../components/ui/utils";
import {
  getPlatformSettings,
  platformSettingsQueryKey,
  updatePlatformSetting,
  type PlatformSetting,
} from "../../lib/analytics";
import { useAuth } from "../../lib/auth";
import { dateTime } from "../../lib/format";

type RiskRule = {
  id: string;
  name: string;
  value: string;
  scope: string;
  enabled: boolean;
};
type RiskSettings = { version: number; rules: RiskRule[] };

export function RiskConfig() {
  const auth = useAuth();
  const canManage = auth.platformPermissions.includes("platform.risk.manage");
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: platformSettingsQueryKey,
    queryFn: getPlatformSettings,
  });
  const setting = query.data?.find((row) => row.key === "risk_rules") as
    PlatformSetting<RiskSettings> | undefined;
  const [form, setForm] = useState<RiskSettings>();
  useEffect(() => {
    if (setting !== undefined) setForm(structuredClone(setting.value));
  }, [setting]);
  const mutation = useMutation({
    mutationFn: () => {
      if (setting === undefined || form === undefined)
        throw new Error("Risk settings have not loaded.");
      return updatePlatformSetting(
        "risk_rules",
        { ...form, version: form.version + 1 },
        setting.version,
      );
    },
    onSuccess: async () => {
      toast.success("Risk rules published.");
      await queryClient.invalidateQueries({ queryKey: platformSettingsQueryKey });
    },
    onError: (error) => toast.error(error.message),
  });

  if (query.isPending || form === undefined)
    return <LoadingState label="Loading risk policies..." />;
  if (query.isError)
    return <ErrorState error={query.error} retry={() => void query.refetch()} />;
  if (setting === undefined)
    return <EmptyState label="Risk policy settings are not initialized." />;

  function updateRule(id: string, patch: Partial<RiskRule>) {
    setForm((current) =>
      current === undefined
        ? current
        : {
            ...current,
            rules: current.rules.map((rule) =>
              rule.id === id ? { ...rule, ...patch } : rule,
            ),
          },
    );
  }

  return (
    <>
      <PageHeader
        title="Risk & Policies"
        subtitle={`Global financing rules · ruleset v${form.version} · updated ${dateTime(setting.updatedAt)}`}
        breadcrumb={["Governance", "Risk & Policies"]}
        actions={
          canManage ? (
            <Button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              busy={mutation.isPending}
            >
              <Save className="size-4" />{" "}
              {mutation.isPending ? "Publishing..." : "Publish changes"}
            </Button>
          ) : undefined
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard title="Ruleset status">
          <div className="flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-2xl bg-primary/12 text-primary">
              <ShieldCheck className="size-6" />
            </span>
            <div>
              <div className="font-semibold">Ruleset v{form.version}</div>
              <div className="text-xs text-muted-foreground">
                DB record version {setting.version}
              </div>
            </div>
          </div>
          <div className="mt-4 flex justify-between border-t border-border pt-4 text-sm">
            <span className="text-muted-foreground">Active rules</span>
            <span className="font-mono">
              {form.rules.filter((rule) => rule.enabled).length} / {form.rules.length}
            </span>
          </div>
        </SectionCard>
        <SectionCard
          className="lg:col-span-2"
          title="Configured rules"
          bodyClassName="p-0"
        >
          {form.rules.length === 0 ? (
            <EmptyState label="No risk rules are configured." />
          ) : (
            <div className="divide-y divide-border">
              {form.rules.map((rule) => (
                <div
                  key={rule.id}
                  className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-muted/50 text-muted-foreground">
                    <SlidersHorizontal className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{rule.name}</span>
                      <StatusBadge tone="info" dot={false}>
                        {rule.scope}
                      </StatusBadge>
                    </div>
                    <Input
                      value={rule.value}
                      onChange={(event) =>
                        updateRule(rule.id, { value: event.target.value })
                      }
                      disabled={!canManage}
                      className="mt-2 max-w-sm font-mono"
                      maxLength={160}
                      aria-label={`${rule.name} value`}
                    />
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-label={`Enable ${rule.name}`}
                    aria-checked={rule.enabled}
                    onClick={() => updateRule(rule.id, { enabled: !rule.enabled })}
                    disabled={!canManage}
                    className={cn(
                      "relative h-6 w-11 shrink-0 rounded-full",
                      rule.enabled ? "bg-primary" : "bg-muted",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 size-5 rounded-full bg-white transition-all",
                        rule.enabled ? "left-[22px]" : "left-0.5",
                      )}
                    />
                  </button>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </>
  );
}
