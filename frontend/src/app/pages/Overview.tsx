import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Download,
  FileClock,
  Plus,
  ScrollText,
  ShieldAlert,
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
import { EmptyState, ErrorState, LoadingState } from "../components/common/AsyncState";
import { GlassCard } from "../components/common/GlassCard";
import { SectionCard } from "../components/common/SectionCard";
import { StatusBadge } from "../components/common/StatusBadge";
import { PageHeader } from "../components/layout/PageHeader";
import { Button } from "../components/ui/button";
import { getTenantAnalytics, tenantAnalyticsQueryKey } from "../lib/analytics";
import { dateTime, money } from "../lib/format";

const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)", color: "var(--popover-foreground)",
  borderRadius: 8,
  fontSize: 12,
};

export function Overview() {
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: tenantAnalyticsQueryKey,
    queryFn: getTenantAnalytics,
  });
  const data = query.data;

  function exportSummary() {
    if (data === undefined) return;
    const rows = [["metric", "value"], ...Object.entries(data.summary)];
    downloadCsv("portfolio-summary.csv", rows);
  }

  return (
    <>
      <PageHeader
        title="Portfolio Overview"
        subtitle={
          data === undefined
            ? "Live tenant portfolio"
            : `Updated ${dateTime(data.generatedAt)}`
        }
        actions={
          <>
            <Button
              variant="outline"
              onClick={exportSummary}
              disabled={data === undefined}
            >
              <Download className="size-4" /> Export summary
            </Button>
            <Button onClick={() => navigate("/applications/new")}>
              <Plus className="size-4" /> New application
            </Button>
          </>
        }
      />
      {query.isPending ? (
        <LoadingState label="Loading portfolio analytics..." />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : data === undefined ? (
        <EmptyState label="Portfolio analytics are unavailable." />
      ) : (
        <>
          {data.summary.overdueContracts > 0 && (
            <GlassCard className="mb-6 flex flex-col gap-3 border-destructive/25 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="grid size-9 place-items-center rounded-lg bg-destructive/15 text-destructive">
                  <AlertTriangle className="size-5" />
                </span>
                <div>
                  <div className="font-semibold">Portfolio attention required</div>
                  <p className="text-sm text-muted-foreground">
                    {data.summary.overdueContracts} contracts have overdue installments
                    totaling{" "}
                    {money(
                      data.collections.reduce(
                        (total, item) => total + item.outstanding,
                        0,
                      ),
                    )}
                    .
                  </p>
                </div>
              </div>
              <Button variant="outline" onClick={() => navigate("/collections")}>
                Review collections <ArrowRight className="size-4" />
              </Button>
            </GlassCard>
          )}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Metric
              icon={Banknote}
              label="Financed volume"
              value={money(data.summary.financedVolume, true)}
            />
            <Metric
              icon={ScrollText}
              label="Active contracts"
              value={String(data.summary.activeContracts)}
            />
            <Metric
              icon={FileClock}
              label="Pending applications"
              value={String(data.summary.pendingApplications)}
            />
            <Metric
              icon={Users}
              label="Customers"
              value={String(data.summary.customers)}
            />
            <Metric
              icon={Banknote}
              label="Collected"
              value={money(data.summary.collectedVolume, true)}
            />
            <Metric
              icon={Banknote}
              label="Outstanding"
              value={money(data.summary.outstandingPortfolio, true)}
            />
            <Metric
              icon={ShieldAlert}
              label="Restricted devices"
              value={String(data.summary.restrictedDevices)}
            />
            <Metric
              icon={ScrollText}
              label="Collection rate"
              value={`${data.summary.collectionRate.toFixed(1)}%`}
            />
          </div>
          <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
            <SectionCard
              className="xl:col-span-2"
              title="Financed versus collected"
              subtitle="Authoritative monthly cash movement"
            >
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={data.monthly} margin={{ left: 4, right: 8, top: 8 }}>
                  <defs>
                    <linearGradient id="tenantFinanced" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--border)"
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
                    type="monotone"
                    dataKey="financed"
                    stroke="var(--chart-1)"
                    fill="url(#tenantFinanced)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="collected"
                    stroke="var(--chart-2)"
                    fillOpacity={0}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </SectionCard>
            <SectionCard title="Branch performance" bodyClassName="p-0">
              {data.branches.length === 0 ? (
                <EmptyState label="No branches are registered." />
              ) : (
                <div className="divide-y divide-border">
                  {data.branches.slice(0, 6).map((branch) => (
                    <div key={branch.id} className="px-5 py-3">
                      <div className="flex justify-between gap-3">
                        <div>
                          <div className="font-medium">{branch.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {branch.contractCount} contracts
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono">
                            {money(branch.financed, true)}
                          </div>
                          <div className="text-xs text-primary">
                            {branch.collectionRate.toFixed(1)}% collected
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
            <SectionCard
              title="Recent payments"
              bodyClassName="p-0"
              action={
                <Button variant="ghost" size="sm" onClick={() => navigate("/payments")}>
                  View all <ArrowRight className="size-4" />
                </Button>
              }
            >
              {data.payments.length === 0 ? (
                <EmptyState label="No payments have been recorded." />
              ) : (
                <div className="divide-y divide-border">
                  {data.payments.slice(0, 6).map((payment) => (
                    <div
                      key={payment.id}
                      className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
                    >
                      <div>
                        <div className="font-medium">{payment.customerName}</div>
                        <div className="text-xs text-muted-foreground">
                          {dateTime(payment.settledAt ?? payment.initiatedAt)} ·{" "}
                          {payment.channel}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono">{money(payment.amount)}</div>
                        <StatusBadge
                          tone={
                            payment.status === "settled"
                              ? "success"
                              : payment.status === "failed"
                                ? "danger"
                                : "warning"
                          }
                        >
                          {payment.status}
                        </StatusBadge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
            <SectionCard title="Recent audit activity" bodyClassName="p-0">
              {data.activity.length === 0 ? (
                <EmptyState label="No audit events are available." />
              ) : (
                <div className="divide-y divide-border">
                  {data.activity.slice(0, 6).map((event) => (
                    <div key={event.id} className="px-5 py-3 text-sm">
                      <div className="font-medium">{event.message}</div>
                      <div className="text-xs text-muted-foreground">
                        {event.resourceLabel} · {dateTime(event.occurredAt)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>
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
  icon: typeof Banknote;
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
