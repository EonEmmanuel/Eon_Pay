import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyState, ErrorState, LoadingState } from "../components/common/AsyncState";
import { GlassCard } from "../components/common/GlassCard";
import { SectionCard } from "../components/common/SectionCard";
import { PageHeader } from "../components/layout/PageHeader";
import { Button } from "../components/ui/button";
import { cn } from "../components/ui/utils";
import { getTenantAnalytics, tenantAnalyticsQueryKey } from "../lib/analytics";
import { money } from "../lib/format";

const tabs = ["Monthly", "Aging", "Models", "Branches"] as const;
const tooltipStyle = {
  background: "oklch(0.2 0.03 264)",
  border: "1px solid oklch(1 0 0 / 8%)",
  borderRadius: 8,
  fontSize: 12,
};

export function Reports() {
  const [tab, setTab] = useState<(typeof tabs)[number]>("Monthly");
  const query = useQuery({
    queryKey: tenantAnalyticsQueryKey,
    queryFn: getTenantAnalytics,
  });
  const data = query.data;
  const aging = useMemo(() => {
    const collections = data?.collections ?? [];
    return [
      {
        bucket: "1-7 days",
        value: collections
          .filter((item) => item.daysOverdue <= 7)
          .reduce((sum, item) => sum + item.outstanding, 0),
      },
      {
        bucket: "8-30 days",
        value: collections
          .filter((item) => item.daysOverdue >= 8 && item.daysOverdue <= 30)
          .reduce((sum, item) => sum + item.outstanding, 0),
      },
      {
        bucket: "31-60 days",
        value: collections
          .filter((item) => item.daysOverdue >= 31 && item.daysOverdue <= 60)
          .reduce((sum, item) => sum + item.outstanding, 0),
      },
      {
        bucket: "61+ days",
        value: collections
          .filter((item) => item.daysOverdue >= 61)
          .reduce((sum, item) => sum + item.outstanding, 0),
      },
    ];
  }, [data?.collections]);
  const averageContract =
    data === undefined || data.summary.contracts === 0
      ? 0
      : data.summary.financedVolume / data.summary.contracts;
  const atRisk = aging.reduce((sum, item) => sum + item.value, 0);

  function exportCurrent() {
    if (data === undefined) return;
    if (tab === "Monthly")
      downloadCsv("monthly-performance.csv", [
        ["month", "financed", "collected"],
        ...data.monthly.map((row) => [row.month, row.financed, row.collected]),
      ]);
    if (tab === "Aging")
      downloadCsv("portfolio-aging.csv", [
        ["bucket", "outstanding"],
        ...aging.map((row) => [row.bucket, row.value]),
      ]);
    if (tab === "Models")
      downloadCsv("device-model-performance.csv", [
        ["model", "units", "financed"],
        ...data.modelPerformance.map((row) => [row.model, row.units, row.financed]),
      ]);
    if (tab === "Branches")
      downloadCsv("branch-performance.csv", [
        ["branch", "contracts", "financed", "collected", "collection_rate"],
        ...data.branches.map((row) => [
          row.name,
          row.contractCount,
          row.financed,
          row.collected,
          row.collectionRate,
        ]),
      ]);
  }

  return (
    <>
      <PageHeader
        title="Reports & Analytics"
        subtitle="Live portfolio, collection, model, and branch performance"
        breadcrumb={["Insights", "Reports"]}
        actions={
          <Button onClick={exportCurrent} disabled={data === undefined}>
            <Download className="size-4" /> Export {tab} CSV
          </Button>
        }
      />
      {query.isPending ? (
        <LoadingState label="Loading reports..." />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : data === undefined ? (
        <EmptyState label="Report data are unavailable." />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Metric
              label="Collection rate"
              value={`${data.summary.collectionRate.toFixed(1)}%`}
            />
            <Metric label="Average contract" value={money(averageContract, true)} />
            <Metric label="Portfolio at risk" value={money(atRisk, true)} />
            <Metric
              label="Overdue contracts"
              value={String(data.summary.overdueContracts)}
            />
          </div>
          <div
            className="mb-4 flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-white/8 bg-white/[0.03] p-1"
            role="tablist"
          >
            {tabs.map((value) => (
              <button
                key={value}
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className={cn(
                  "rounded-md px-4 py-1.5 text-sm font-medium",
                  tab === value
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground",
                )}
              >
                {value}
              </button>
            ))}
          </div>
          <SectionCard
            title={`${tab} analytics`}
            subtitle="Values are calculated from tenant-isolated operational records"
          >
            {tab === "Monthly" ? (
              <ResponsiveContainer width="100%" height={340}>
                <AreaChart data={data.monthly}>
                  <defs>
                    <linearGradient id="reportFinanced" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <ChartAxes />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value) => money(Number(value), true)}
                  />
                  <Area
                    dataKey="financed"
                    stroke="var(--chart-1)"
                    fill="url(#reportFinanced)"
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
            ) : tab === "Aging" ? (
              <ResponsiveContainer width="100%" height={340}>
                <BarChart data={aging}>
                  <ChartAxes dataKey="bucket" />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value) => money(Number(value))}
                  />
                  <Bar
                    dataKey="value"
                    name="Outstanding"
                    fill="var(--chart-4)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : tab === "Models" ? (
              data.modelPerformance.length === 0 ? (
                <EmptyState label="No financed device models are available." />
              ) : (
                <ResponsiveContainer width="100%" height={340}>
                  <BarChart data={data.modelPerformance}>
                    <ChartAxes dataKey="model" />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value, name) =>
                        name === "financed" ? money(Number(value)) : String(value)
                      }
                    />
                    <Bar dataKey="units" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                    <Bar
                      dataKey="financed"
                      fill="var(--chart-2)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )
            ) : data.branches.length === 0 ? (
              <EmptyState label="No branch performance data are available." />
            ) : (
              <ResponsiveContainer width="100%" height={340}>
                <BarChart data={data.branches}>
                  <ChartAxes dataKey="name" />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value, name) =>
                      name === "contractCount" ? String(value) : money(Number(value))
                    }
                  />
                  <Bar dataKey="financed" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
                  <Bar
                    dataKey="collected"
                    fill="var(--chart-1)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </SectionCard>
        </>
      )}
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <GlassCard className="p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-mono text-2xl font-semibold">{value}</div>
    </GlassCard>
  );
}
function ChartAxes({ dataKey = "month" }: { dataKey?: string }) {
  return (
    <>
      <CartesianGrid
        strokeDasharray="3 3"
        stroke="oklch(1 0 0 / 6%)"
        vertical={false}
      />
      <XAxis
        dataKey={dataKey}
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
    </>
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
