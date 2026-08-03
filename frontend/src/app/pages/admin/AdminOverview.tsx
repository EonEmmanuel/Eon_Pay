import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Banknote,
  Building2,
  FileStack,
  ShieldAlert,
  Smartphone,
  Users,
} from "lucide-react";
import { useNavigate } from "react-router";
import {
  Area,
  AreaChart,
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
import { Button } from "../../components/ui/button";
import { getPlatformAnalytics, platformAnalyticsQueryKey } from "../../lib/analytics";
import { dateTime, money } from "../../lib/format";

const tooltipStyle = {
  background: "oklch(0.2 0.03 264)",
  border: "1px solid oklch(1 0 0 / 8%)",
  borderRadius: 8,
  fontSize: 12,
};

export function AdminOverview() {
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: platformAnalyticsQueryKey,
    queryFn: getPlatformAnalytics,
  });
  const data = query.data;
  return (
    <>
      <PageHeader
        title="Command Center"
        subtitle={
          data === undefined
            ? "Cross-retailer platform analytics"
            : `Updated ${dateTime(data.generatedAt)}`
        }
        breadcrumb={["Platform", "Command Center"]}
        actions={
          <>
            <Button variant="outline" onClick={() => navigate("/admin/health")}>
              <Activity className="size-4" /> System health
            </Button>
            <Button onClick={() => navigate("/admin/tenants")}>
              <Building2 className="size-4" /> Manage retailers
            </Button>
          </>
        }
      />
      {query.isPending ? (
        <LoadingState label="Loading platform analytics..." />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : data === undefined ? (
        <EmptyState label="Platform analytics are unavailable." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <Metric
              icon={Building2}
              label="Active retailers"
              value={String(data.summary.activeTenants)}
            />
            <Metric
              icon={Users}
              label="Customers"
              value={String(data.summary.customers)}
            />
            <Metric
              icon={FileStack}
              label="Active contracts"
              value={String(data.summary.activeContracts)}
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
            <Metric
              icon={ShieldAlert}
              label="Overdue contracts"
              value={String(data.summary.overdueContracts)}
            />
            <Metric
              icon={ShieldAlert}
              label="Written-off contracts"
              value={String(data.summary.writtenOffContracts)}
            />
            <Metric
              icon={Banknote}
              label="Written-off balance"
              value={money(data.summary.writtenOffBalance, true)}
            />
            <Metric
              icon={Smartphone}
              label="Managed devices"
              value={String(data.summary.managedDevices)}
            />
            <Metric
              icon={ShieldAlert}
              label="Restricted devices"
              value={String(data.summary.restrictedDevices)}
            />
          </div>
          <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
            <SectionCard
              className="xl:col-span-2"
              title="Network financing performance"
            >
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={data.monthly}>
                  <defs>
                    <linearGradient id="platformFinanced" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="oklch(1 0 0 / 6%)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="month"
                    stroke="var(--muted-foreground)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="var(--muted-foreground)"
                    fontSize={11}
                    tickFormatter={(value: number) => money(value, true)}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value) => money(Number(value), true)}
                  />
                  <Area
                    dataKey="financed"
                    stroke="var(--chart-1)"
                    fill="url(#platformFinanced)"
                    strokeWidth={2}
                  />
                  <Area
                    dataKey="collected"
                    stroke="var(--chart-2)"
                    fillOpacity={0}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </SectionCard>
            <SectionCard title="Tenant state">
              <div className="space-y-4">
                <State
                  label="Active"
                  value={data.summary.activeTenants}
                  tone="success"
                />
                <State
                  label="Archived"
                  value={data.summary.archivedTenants}
                  tone="neutral"
                />
                <State
                  label="Pending applications"
                  value={data.summary.pendingApplications}
                  tone="warning"
                />
              </div>
            </SectionCard>
          </div>
          <SectionCard
            className="mt-4"
            title="Retailer performance"
            bodyClassName="p-0"
          >
            {data.tenants.length === 0 ? (
              <EmptyState label="No retailers are registered." />
            ) : (
              <div className="scroll-slim overflow-x-auto">
                <table className="w-full min-w-[920px] text-sm">
                  <thead>
                    <tr className="border-b border-white/8 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-5 py-3">Retailer</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3 text-right">Customers</th>
                      <th className="px-5 py-3 text-right">Contracts</th>
                      <th className="px-5 py-3 text-right">Financed</th>
                      <th className="px-5 py-3 text-right">Collected</th>
                      <th className="px-5 py-3 text-right">Devices</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/6">
                    {[...data.tenants]
                      .sort((left, right) => right.financedVolume - left.financedVolume)
                      .map((tenant) => (
                        <tr
                          key={tenant.id}
                          onClick={() => navigate(`/admin/tenants/${tenant.id}`)}
                          className="cursor-pointer hover:bg-white/[0.03]"
                        >
                          <td className="px-5 py-3">
                            <div className="font-medium">{tenant.name}</div>
                            <div className="font-mono text-xs text-muted-foreground">
                              {tenant.slug}
                            </div>
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
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
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
function State({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "neutral" | "warning";
}) {
  return (
    <div className="flex items-center justify-between">
      <StatusBadge tone={tone}>{label}</StatusBadge>
      <span className="font-mono text-xl">{value}</span>
    </div>
  );
}
