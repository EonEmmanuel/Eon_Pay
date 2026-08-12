import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Banknote, Building2, Download, FileStack } from "lucide-react";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../components/common/AsyncState";
import { GlassCard } from "../../components/common/GlassCard";
import { SectionCard } from "../../components/common/SectionCard";
import { StatusBadge } from "../../components/common/StatusBadge";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/ui/button";
import { getPlatformAnalytics, platformAnalyticsQueryKey } from "../../lib/analytics";
import { money } from "../../lib/format";

export function Billing() {
  const query = useQuery({
    queryKey: platformAnalyticsQueryKey,
    queryFn: getPlatformAnalytics,
  });
  const data = query.data;
  function exportActivity() {
    if (data === undefined) return;
    downloadCsv("retailer-activity.csv", [
      [
        "retailer",
        "slug",
        "customers",
        "contracts",
        "financed_volume",
        "collected_volume",
        "managed_devices",
      ],
      ...data.tenants.map((tenant) => [
        tenant.name,
        tenant.slug,
        tenant.customers,
        tenant.contracts,
        tenant.financedVolume,
        tenant.collectedVolume,
        tenant.managedDevices,
      ]),
    ]);
  }
  return (
    <>
      <PageHeader
        title="Billing Readiness"
        subtitle="Authoritative usage volumes available for a future billing provider"
        breadcrumb={["Platform", "Billing"]}
        actions={
          <Button
            variant="outline"
            onClick={exportActivity}
            disabled={data === undefined}
          >
            <Download className="size-4" /> Export activity
          </Button>
        }
      />
      <GlassCard className="mb-4 border-warning/25 bg-warning/5 p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 size-5 text-gold" />
          <div>
            <div className="font-medium">Subscription billing is not configured</div>
            <p className="mt-1 text-sm text-muted-foreground">
              There is no invoice, plan, price, or subscription domain in the backend
              yet. This screen deliberately exposes only real platform usage; no revenue
              or invoice figures are invented.
            </p>
          </div>
        </div>
      </GlassCard>
      {query.isPending ? (
        <LoadingState label="Loading platform activity..." />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : data === undefined ? (
        <EmptyState label="Platform activity is unavailable." />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Metric
              icon={Building2}
              label="Active retailers"
              value={String(data.summary.activeTenants)}
            />
            <Metric
              icon={FileStack}
              label="Contracts"
              value={String(data.summary.contracts)}
            />
            <Metric
              icon={Banknote}
              label="Financed volume"
              value={money(data.summary.financedVolume, true)}
            />
            <Metric
              icon={Banknote}
              label="Collected volume"
              value={money(data.summary.collectedVolume, true)}
            />
          </div>
          <SectionCard
            title="Billable activity candidates"
            subtitle="Use these auditable volumes after pricing and invoicing are modeled"
            bodyClassName="p-0"
          >
            <div className="scroll-slim overflow-x-auto">
              <table className="w-full min-w-[880px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3">Retailer</th>
                    <th className="px-5 py-3 text-right">Customers</th>
                    <th className="px-5 py-3 text-right">Contracts</th>
                    <th className="px-5 py-3 text-right">Financed</th>
                    <th className="px-5 py-3 text-right">Collected</th>
                    <th className="px-5 py-3 text-right">Devices</th>
                    <th className="px-5 py-3">State</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.tenants.map((tenant) => (
                    <tr key={tenant.id}>
                      <td className="px-5 py-3">
                        <div className="font-medium">{tenant.name}</div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {tenant.slug}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right font-mono">
                        {tenant.customers}
                      </td>
                      <td className="px-5 py-3 text-right font-mono">
                        {tenant.contracts}
                      </td>
                      <td className="px-5 py-3 text-right font-mono">
                        {money(tenant.financedVolume)}
                      </td>
                      <td className="px-5 py-3 text-right font-mono">
                        {money(tenant.collectedVolume)}
                      </td>
                      <td className="px-5 py-3 text-right font-mono">
                        {tenant.managedDevices}
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge
                          tone={
                            tenant.archivedAt !== null
                              ? "neutral"
                              : tenant.active
                                ? "success"
                                : "warning"
                          }
                        >
                          {tenant.archivedAt !== null
                            ? "archived"
                            : tenant.onboardingStatus.replaceAll("_", " ")}
                        </StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </>
      )}
    </>
  );
}
function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
}) {
  return (
    <GlassCard className="p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <Icon className="size-4 text-primary" />
        {label}
      </div>
      <div className="mt-2 font-mono text-2xl font-semibold">{value}</div>
    </GlassCard>
  );
}
function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
  const content = rows
    .map((row) =>
      row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","),
    )
    .join("\n");
  const url = URL.createObjectURL(
    new Blob([content], { type: "text/csv;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
