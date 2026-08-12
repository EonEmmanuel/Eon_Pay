import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Phone, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { EmptyState, ErrorState, LoadingState } from "../components/common/AsyncState";
import { GlassCard } from "../components/common/GlassCard";
import { SectionCard } from "../components/common/SectionCard";
import { StatusBadge } from "../components/common/StatusBadge";
import { PageHeader } from "../components/layout/PageHeader";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { getTenantAnalytics, tenantAnalyticsQueryKey } from "../lib/analytics";
import { money } from "../lib/format";

const buckets = ["all", "1-7 days", "8-30 days", "31+ days"] as const;

export function Collections() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [bucket, setBucket] = useState<(typeof buckets)[number]>("all");
  const query = useQuery({
    queryKey: tenantAnalyticsQueryKey,
    queryFn: getTenantAnalytics,
  });
  const rows = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return (query.data?.collections ?? []).filter((item) => {
      const matchesSearch =
        normalized === "" ||
        `${item.customerName} ${item.contractId}`.toLowerCase().includes(normalized);
      const matchesBucket =
        bucket === "all" ||
        (bucket === "1-7 days" && item.daysOverdue <= 7) ||
        (bucket === "8-30 days" && item.daysOverdue >= 8 && item.daysOverdue <= 30) ||
        (bucket === "31+ days" && item.daysOverdue >= 31);
      return matchesSearch && matchesBucket;
    });
  }, [bucket, query.data?.collections, search]);
  const overdueAmount = (query.data?.collections ?? []).reduce(
    (total, item) => total + item.outstanding,
    0,
  );
  const customersAtRisk = new Set(
    (query.data?.collections ?? []).map((item) => item.customerId).filter(Boolean),
  ).size;
  const dueToday = (query.data?.installments ?? []).filter(
    (item) => item.status === "due",
  );
  const dueTodayAmount = dueToday.reduce((total, item) => total + item.outstanding, 0);

  return (
    <>
      <PageHeader
        title="Collections"
        subtitle="Outstanding installments calculated from posted payment allocations"
        breadcrumb={["Finance", "Collections"]}
      />
      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Metric label="Overdue" value={money(overdueAmount, true)} danger />
        <Metric
          label="Overdue installments"
          value={String(query.data?.collections.length ?? 0)}
        />
        <Metric label="Customers at risk" value={String(customersAtRisk)} />
        <Metric label="Due today" value={money(dueTodayAmount, true)} highlight />
      </div>
      <GlassCard className="mb-4 flex flex-col gap-3 p-3 lg:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search customer or contract..."
            className="pl-9"
            aria-label="Search collections"
          />
        </div>
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Days overdue">
          {buckets.map((value) => (
            <button
              key={value}
              role="tab"
              aria-selected={bucket === value}
              onClick={() => setBucket(value)}
              className={`rounded-md px-3 py-2 text-xs ${bucket === value ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}
            >
              {value}
            </button>
          ))}
        </div>
      </GlassCard>
      <SectionCard title="Overdue queue" bodyClassName="p-0">
        {query.isPending ? (
          <LoadingState label="Loading collection queue..." />
        ) : query.isError ? (
          <div className="p-5">
            <ErrorState error={query.error} retry={() => void query.refetch()} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState label="No overdue installments match these filters." />
        ) : (
          <div className="scroll-slim overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Contract</th>
                  <th className="px-5 py-3">Due date</th>
                  <th className="px-5 py-3">Age</th>
                  <th className="px-5 py-3 text-right">Outstanding</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((item) => {
                  const customer = query.data?.customers.find(
                    (row) => row.id === item.customerId,
                  );
                  return (
                    <tr key={item.id}>
                      <td className="px-5 py-3">
                        <div className="font-medium">{item.customerName}</div>
                        <div className="text-xs text-muted-foreground">
                          {item.device === null
                            ? "Device unavailable"
                            : `${item.device.brand} ${item.device.model}`}
                        </div>
                      </td>
                      <td className="px-5 py-3 font-mono text-xs">{item.contractId}</td>
                      <td className="px-5 py-3">{formatDate(item.dueDate)}</td>
                      <td className="px-5 py-3">
                        <StatusBadge
                          tone={item.daysOverdue > 30 ? "danger" : "warning"}
                        >
                          {item.daysOverdue} days
                        </StatusBadge>
                      </td>
                      <td className="px-5 py-3 text-right font-mono">
                        {money(item.outstanding)}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-2">
                          {customer?.phone !== undefined && (
                            <Button asChild size="sm" variant="outline">
                              <a
                                href={`tel:${customer.phone}`}
                                aria-label={`Call ${item.customerName}`}
                              >
                                <Phone className="size-4" />
                              </a>
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => navigate(`/contracts/${item.contractId}`)}
                          >
                            Contract <ArrowRight className="size-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </>
  );
}

function Metric({
  label,
  value,
  highlight = false,
  danger = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  danger?: boolean;
}) {
  return (
    <GlassCard className="p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={`mt-1 font-mono text-2xl font-semibold ${highlight ? "text-primary" : ""} ${danger ? "text-destructive" : ""}`}
      >
        {value}
      </div>
    </GlassCard>
  );
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-CM", { dateStyle: "medium" }).format(
    new Date(`${value}T00:00:00Z`),
  );
}
