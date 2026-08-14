import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  CreditCard,
  FileCheck2,
  Filter,
  Phone,
  Plus,
  Search,
  ShieldAlert,
  ShieldCheck,
  Store,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { EmptyState, ErrorState, LoadingState } from "../components/common/AsyncState";
import { GlassCard } from "../components/common/GlassCard";
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

  const customers = query.data?.customers ?? [];
  const verifiedCount = customers.filter((c) => c.kycStatus === "verified").length;
  const overdueCount = customers.filter((c) => c.status === "overdue").length;
  const totalOutstanding = customers.reduce((acc, c) => acc + (c.outstanding || 0), 0);

  const rows = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return customers.filter(
      (customer) =>
        (filter === "all" || customer.status === filter) &&
        (normalized === "" ||
          customer.fullName.toLowerCase().includes(normalized) ||
          customer.id.toLowerCase().includes(normalized) ||
          customer.phone.includes(normalized) ||
          customer.branchName.toLowerCase().includes(normalized)),
    );
  }, [customers, filter, search]);

  return (
    <div className="space-y-6 pb-16 pt-2">
      <PageHeader
        title="Customer Directory"
        subtitle={`${query.data?.summary.customers ?? 0} customers enrolled across all retail branches`}
        breadcrumb={["Operations", "Customers"]}
        actions={
          <Button
            onClick={() => navigate("/applications/new")}
            className="rounded-xl bg-[#00DF81] text-black font-bold hover:bg-[#00DF81]/90 shadow-md shadow-emerald-500/20 text-xs h-10 gap-1.5"
          >
            <Plus className="size-4" /> New application
          </Button>
        }
      />

      {/* KPI Metrics Summary Ribbon */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <GlassCard className="p-4.5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Customers</span>
            <Users className="size-4.5 text-primary" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-foreground">
            {customers.length}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Enrolled borrower accounts
          </div>
        </GlassCard>

        <GlassCard className="p-4.5" glow="emerald">
          <div className="flex items-center justify-between text-emerald-600 dark:text-[#00DF81]">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              KYC Verified
            </span>
            <ShieldCheck className="size-4.5" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-emerald-600 dark:text-[#00DF81]">
            {verifiedCount}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Didit biometric clearance
          </div>
        </GlassCard>

        <GlassCard className="p-4.5">
          <div className="flex items-center justify-between text-rose-500">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Delinquent Accounts
            </span>
            <ShieldAlert className="size-4.5" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-rose-500">
            {overdueCount}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Past due installment notices
          </div>
        </GlassCard>

        <GlassCard className="p-4.5" glow="gold">
          <div className="flex items-center justify-between text-amber-500">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Total Receivables
            </span>
            <Wallet className="size-4.5" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-foreground">
            {money(totalOutstanding, true)}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Total active ledger balance
          </div>
        </GlassCard>
      </div>

      {/* Main Customers Table Card */}
      <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-xs">
        {/* Controls Bar: Search & Status Filters */}
        <div className="flex flex-col gap-4 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between bg-muted/20">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, phone, branch or ID..."
              className="h-9 rounded-xl pl-9 text-xs"
            />
          </div>

          <div className="flex items-center gap-1 rounded-xl border border-border bg-muted/40 p-1 overflow-x-auto no-scrollbar max-w-full">
            {filters.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={cn(
                  "rounded-lg px-3 py-1 text-xs font-medium capitalize transition-all",
                  filter === value
                    ? "bg-card text-foreground font-semibold shadow-xs border border-border/80"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {value}
                {value === "overdue" && overdueCount > 0 && (
                  <span className="ml-1.5 rounded-full bg-rose-500/20 px-1.5 py-0.2 font-mono text-[10px] text-rose-600 dark:text-rose-400 font-bold">
                    {overdueCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Content Table */}
        {query.isPending ? (
          <div className="p-8">
            <LoadingState label="Loading customers…" />
          </div>
        ) : query.isError ? (
          <div className="p-6">
            <ErrorState error={query.error} retry={() => void query.refetch()} />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8">
            <EmptyState label="No customers match these filters." />
          </div>
        ) : (
          <div className="no-scrollbar overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm text-left">
              <thead>
                <tr className="border-b border-border bg-muted/20 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-3.5">Customer</th>
                  <th className="px-5 py-3.5">Phone & Contact</th>
                  <th className="px-5 py-3.5">KYC Status</th>
                  <th className="px-5 py-3.5">Account Status</th>
                  <th className="px-5 py-3.5">Branch</th>
                  <th className="px-5 py-3.5 text-right">Contracts</th>
                  <th className="px-5 py-3.5 text-right">Outstanding</th>
                  <th className="px-5 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {rows.map((customer) => (
                  <tr
                    key={customer.id}
                    onClick={() => navigate(`/customers/${customer.id}`)}
                    className="group cursor-pointer transition-colors hover:bg-accent/40"
                  >
                    {/* Name & Avatar */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary font-bold text-xs">
                          {customer.fullName.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-xs text-foreground group-hover:text-primary transition-colors">
                            {customer.fullName}
                          </div>
                          <div className="font-mono text-[11px] text-muted-foreground">
                            {customer.id.slice(0, 12)}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Phone */}
                    <td className="px-5 py-3.5 text-xs text-muted-foreground font-mono">
                      <span className="flex items-center gap-1.5">
                        <Phone className="size-3 text-primary" /> {customer.phone}
                      </span>
                    </td>

                    {/* KYC */}
                    <td className="px-5 py-3.5">
                      <StatusBadge tone={kycTone(customer.kycStatus)}>
                        {customer.kycStatus.replaceAll("_", " ")}
                      </StatusBadge>
                    </td>

                    {/* Status */}
                    <td className="px-5 py-3.5">
                      <StatusBadge tone={statusTone(customer.status)}>
                        {customer.status}
                      </StatusBadge>
                    </td>

                    {/* Branch */}
                    <td className="px-5 py-3.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Store className="size-3 text-muted-foreground" /> {customer.branchName}
                      </span>
                    </td>

                    {/* Contract Count */}
                    <td className="px-5 py-3.5 text-right font-mono font-bold text-xs text-foreground">
                      {customer.contractCount}
                    </td>

                    {/* Outstanding */}
                    <td className="px-5 py-3.5 text-right font-mono font-bold text-xs text-foreground">
                      {money(customer.outstanding)}
                    </td>

                    {/* Action Arrow */}
                    <td className="px-5 py-3.5 text-right">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                        Profile <ArrowRight className="size-3.5" />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
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

