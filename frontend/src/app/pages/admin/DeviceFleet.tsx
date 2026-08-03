import { useQuery } from "@tanstack/react-query";
import { Building2, FileStack, Lock, ShieldCheck, Smartphone } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../components/common/AsyncState";
import { GlassCard } from "../../components/common/GlassCard";
import { SectionCard } from "../../components/common/SectionCard";
import { StatusBadge } from "../../components/common/StatusBadge";
import { PageHeader } from "../../components/layout/PageHeader";
import { getPlatformAnalytics, platformAnalyticsQueryKey } from "../../lib/analytics";

const tooltipStyle = {
  background: "oklch(0.2 0.03 264)",
  border: "1px solid oklch(1 0 0 / 8%)",
  borderRadius: 8,
  fontSize: 12,
};

export function DeviceFleet() {
  const query = useQuery({
    queryKey: platformAnalyticsQueryKey,
    queryFn: getPlatformAnalytics,
  });
  const data = query.data;
  const retailersWithDevices =
    data?.tenants.filter((tenant) => tenant.managedDevices > 0).length ?? 0;
  return (
    <>
      <PageHeader
        title="Device Fleet"
        subtitle="Provider-enrolled financing devices across tenant boundaries"
        breadcrumb={["Governance", "Device Fleet"]}
      />
      {query.isPending ? (
        <LoadingState label="Loading fleet analytics..." />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : data === undefined ? (
        <EmptyState label="Fleet analytics are unavailable." />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Metric
              icon={Smartphone}
              label="Enrolled devices"
              value={String(data.summary.managedDevices)}
            />
            <Metric
              icon={Lock}
              label="Restricted"
              value={String(data.summary.restrictedDevices)}
            />
            <Metric
              icon={Building2}
              label="Retailers with devices"
              value={String(retailersWithDevices)}
            />
            <Metric
              icon={FileStack}
              label="Financing contracts"
              value={String(data.summary.contracts)}
            />
          </div>
          <SectionCard
            title="Fleet by retailer"
            subtitle="Enrolled and currently restricted devices"
            className="mb-4"
          >
            {data.tenants.length === 0 ? (
              <EmptyState label="No retailer fleet records are available." />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={data.tenants.filter((tenant) => tenant.managedDevices > 0)}
                  margin={{ left: 8, right: 8, top: 8 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="oklch(1 0 0 / 6%)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="name"
                    stroke="var(--muted-foreground)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="var(--muted-foreground)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar
                    dataKey="managedDevices"
                    name="Enrolled"
                    fill="var(--chart-1)"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="restrictedDevices"
                    name="Restricted"
                    fill="var(--chart-4)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </SectionCard>
          <SectionCard title="Fleet register" bodyClassName="p-0">
            <div className="scroll-slim overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-white/8 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3">Retailer</th>
                    <th className="px-5 py-3 text-right">Enrolled</th>
                    <th className="px-5 py-3 text-right">Restricted</th>
                    <th className="px-5 py-3">Unrestricted share</th>
                    <th className="px-5 py-3">Tenant status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/6">
                  {data.tenants.map((tenant) => {
                    const healthy =
                      tenant.managedDevices === 0
                        ? 100
                        : ((tenant.managedDevices - tenant.restrictedDevices) /
                            tenant.managedDevices) *
                          100;
                    return (
                      <tr key={tenant.id}>
                        <td className="px-5 py-3">
                          <div className="font-medium">{tenant.name}</div>
                          <div className="font-mono text-xs text-muted-foreground">
                            {tenant.slug}
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right font-mono">
                          {tenant.managedDevices}
                        </td>
                        <td className="px-5 py-3 text-right font-mono text-destructive">
                          {tenant.restrictedDevices}
                        </td>
                        <td className="px-5 py-3">
                          <span className="inline-flex items-center gap-2">
                            <ShieldCheck className="size-4 text-muted-foreground" />
                            <StatusBadge
                              tone={
                                healthy >= 90
                                  ? "success"
                                  : healthy >= 75
                                    ? "warning"
                                    : "danger"
                              }
                              dot={false}
                            >
                              {healthy.toFixed(1)}%
                            </StatusBadge>
                          </span>
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
                    );
                  })}
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
  icon: typeof Smartphone;
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
