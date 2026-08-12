import { useQuery } from "@tanstack/react-query";
import { Plus, Search, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { EmptyState, ErrorState, LoadingState } from "../components/common/AsyncState";
import { SectionCard } from "../components/common/SectionCard";
import { StatusBadge } from "../components/common/StatusBadge";
import { PageHeader } from "../components/layout/PageHeader";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { cn } from "../components/ui/utils";
import {
  getTenantAnalytics,
  tenantAnalyticsQueryKey,
  type AnalyticsCustomer,
} from "../lib/analytics";
import { money } from "../lib/format";

const filters = ["all", "active", "overdue", "completed", "prospect"] as const;

export function Customers() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<(typeof filters)[number]>("all");
  const query = useQuery({
    queryKey: tenantAnalyticsQueryKey,
    queryFn: getTenantAnalytics,
  });
  const rows = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return (query.data?.customers ?? []).filter(
      (customer) =>
        (filter === "all" || customer.status === filter) &&
        (normalized === "" ||
          customer.fullName.toLowerCase().includes(normalized) ||
          customer.id.toLowerCase().includes(normalized) ||
          customer.phone.includes(normalized)),
    );
  }, [filter, query.data?.customers, search]);

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle={`${query.data?.summary.customers ?? 0} customers from the live tenant ledger`}
        breadcrumb={["Operations", "Customers"]}
        actions={
          <Button onClick={() => navigate("/applications/new")}>
            <Plus className="size-4" aria-hidden="true" /> New application
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-border bg-muted/50 p-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, UUID, or phone…"
            className="pl-9"
            aria-label="Search customers"
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
          {filters.map((value) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium capitalize",
                filter === value
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground",
              )}
            >
              {value}
            </button>
          ))}
        </div>
      </div>
      <SectionCard bodyClassName="p-0">
        {query.isPending ? (
          <LoadingState label="Loading customers…" />
        ) : query.isError ? (
          <div className="p-5">
            <ErrorState error={query.error} retry={() => void query.refetch()} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState label="No customers match these filters." />
        ) : (
          <div className="scroll-slim overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">KYC</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Branch</th>
                  <th className="px-5 py-3 text-right">Contracts</th>
                  <th className="px-5 py-3 text-right">Outstanding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((customer) => (
                  <tr
                    key={customer.id}
                    onClick={() => navigate(`/customers/${customer.id}`)}
                    className="cursor-pointer hover:bg-accent/60"
                  >
                    <td className="px-5 py-3">
                      <div className="font-medium">{customer.fullName}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {customer.id}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {customer.phone}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge tone={kycTone(customer.kycStatus)}>
                        {customer.kycStatus.replaceAll("_", " ")}
                      </StatusBadge>
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge tone={statusTone(customer.status)}>
                        {customer.status}
                      </StatusBadge>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {customer.branchName}
                    </td>
                    <td className="px-5 py-3 text-right font-mono">
                      {customer.contractCount}
                    </td>
                    <td className="px-5 py-3 text-right font-mono">
                      {money(customer.outstanding)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </>
  );
}

function kycTone(status: string) {
  if (status === "verified") return "success" as const;
  if (status === "failed") return "danger" as const;
  return "warning" as const;
}

function statusTone(status: AnalyticsCustomer["status"]) {
  if (status === "active") return "info" as const;
  if (status === "overdue") return "danger" as const;
  if (status === "completed") return "success" as const;
  return "neutral" as const;
}
