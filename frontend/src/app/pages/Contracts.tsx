import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Download,
  FileCheck2,
  FileSignature,
  FileText,
  Filter,
  Layers,
  Search,
  ShieldAlert,
  Smartphone,
  TrendingUp,
  User,
  Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { EmptyState, ErrorState, LoadingState } from "../components/common/AsyncState";
import { GlassCard } from "../components/common/GlassCard";
import { ProgressMeter } from "../components/common/ProgressMeter";
import { StatusBadge, type StatusTone } from "../components/common/StatusBadge";
import { PageHeader } from "../components/layout/PageHeader";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { cn } from "../components/ui/utils";
import {
  getTenantAnalytics,
  tenantAnalyticsQueryKey,
  type AnalyticsContract,
} from "../lib/analytics";
import { money } from "../lib/format";

const tabs = ["all", "active", "overdue", "completed", "draft"] as const;

export function Contracts() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<(typeof tabs)[number]>("all");
  const [search, setSearch] = useState("");

  const query = useQuery({
    queryKey: tenantAnalyticsQueryKey,
    queryFn: getTenantAnalytics,
  });

  const contracts = query.data?.contracts ?? [];
  const activeContracts = contracts.filter((c) => c.status === "active");
  const overdueContracts = contracts.filter((c) => c.overdueInstallments > 0);
  const completedContracts = contracts.filter((c) => c.status === "completed");

  const totalOutstanding = contracts.reduce((acc, c) => acc + (c.outstanding || 0), 0);
  const totalFinanced = contracts.reduce((acc, c) => acc + (c.financedPrincipal || 0), 0);

  const rows = useMemo(() => {
    return contracts.filter((contract) => {
      // Tab filter
      const matchesTab =
        tab === "all"
          ? true
          : tab === "overdue"
            ? contract.overdueInstallments > 0
            : contract.status === tab;

      if (!matchesTab) return false;

      // Search filter
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        contract.customerName.toLowerCase().includes(q) ||
        contract.id.toLowerCase().includes(q) ||
        contract.device.brand.toLowerCase().includes(q) ||
        contract.device.model.toLowerCase().includes(q) ||
        contract.branchName.toLowerCase().includes(q)
      );
    });
  }, [contracts, tab, search]);

  function exportContracts() {
    downloadCsv("contracts.csv", [
      [
        "contract_id",
        "customer",
        "branch",
        "device",
        "status",
        "principal",
        "paid",
        "outstanding",
        "next_due",
      ],
      ...rows.map((contract) => [
        contract.id,
        contract.customerName,
        contract.branchName,
        `${contract.device.brand} ${contract.device.model}`,
        contract.overdueInstallments > 0 ? "overdue" : contract.status,
        contract.financedPrincipal,
        contract.paidAmount,
        contract.outstanding,
        contract.nextDueDate ?? "",
      ]),
    ]);
  }

  return (
    <div className="space-y-6 pb-16 pt-2">
      <PageHeader
        title="Active Contracts"
        subtitle={`${query.data?.summary.contracts ?? 0} active agreements in the immutable financing ledger`}
        breadcrumb={["Finance", "Contracts"]}
        actions={
          <Button
            variant="outline"
            onClick={exportContracts}
            disabled={rows.length === 0}
            className="rounded-xl text-xs h-10 gap-1.5"
          >
            <Download className="size-4" /> Export CSV
          </Button>
        }
      />

      {/* KPI Metrics Summary Ribbon */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <GlassCard className="p-4.5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Active Book</span>
            <FileSignature className="size-4.5 text-primary" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-foreground">
            {activeContracts.length}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Performing financing loans
          </div>
        </GlassCard>

        <GlassCard className="p-4.5" glow="emerald">
          <div className="flex items-center justify-between text-emerald-600 dark:text-[#00DF81]">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Total Financed
            </span>
            <Wallet className="size-4.5" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-foreground">
            {money(totalFinanced, true)}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Cumulative loan principal
          </div>
        </GlassCard>

        <GlassCard className="p-4.5">
          <div className="flex items-center justify-between text-amber-500">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Outstanding Balance
            </span>
            <Clock className="size-4.5" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-foreground">
            {money(totalOutstanding, true)}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Awaiting future repayments
          </div>
        </GlassCard>

        <GlassCard className="p-4.5">
          <div className="flex items-center justify-between text-rose-500">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Overdue Accounts
            </span>
            <ShieldAlert className="size-4.5" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-rose-500">
            {overdueContracts.length}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Knox lock warnings active
          </div>
        </GlassCard>
      </div>

      {/* Main Register Table Card */}
      <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-xs">
        {/* Controls Bar: Search & Status Tabs */}
        <div className="flex flex-col gap-4 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between bg-muted/20">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search customer, device or contract ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 rounded-xl pl-9 text-xs"
            />
          </div>

          <div
            className="flex items-center gap-1 rounded-xl border border-border bg-muted/40 p-1 overflow-x-auto no-scrollbar max-w-full"
            role="tablist"
            aria-label="Contract status"
          >
            {tabs.map((value) => (
              <button
                key={value}
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className={cn(
                  "rounded-lg px-3 py-1 text-xs font-medium capitalize transition-all",
                  tab === value
                    ? "bg-card text-foreground font-semibold shadow-xs border border-border/80"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {value}
                {value === "overdue" && overdueContracts.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-rose-500/20 px-1.5 py-0.2 font-mono text-[10px] text-rose-600 dark:text-rose-400 font-bold">
                    {overdueContracts.length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Content Table */}
        {query.isPending ? (
          <div className="p-8">
            <LoadingState label="Loading contracts..." />
          </div>
        ) : query.isError ? (
          <div className="p-6">
            <ErrorState error={query.error} retry={() => void query.refetch()} />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8">
            <EmptyState label="No contracts match this filter." />
          </div>
        ) : (
          <div className="no-scrollbar overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm text-left">
              <thead>
                <tr className="border-b border-border bg-muted/20 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-3.5">Customer & Contract</th>
                  <th className="px-5 py-3.5">Device</th>
                  <th className="px-5 py-3.5">Repayment Progress</th>
                  <th className="px-5 py-3.5">Next Due</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Outstanding</th>
                  <th className="px-5 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {rows.map((contract) => (
                  <tr
                    key={contract.id}
                    onClick={() => navigate(`/contracts/${contract.id}`)}
                    className="group cursor-pointer transition-colors hover:bg-accent/40"
                  >
                    {/* Customer Column */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary font-bold text-xs">
                          {contract.customerName.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-xs text-foreground group-hover:text-primary transition-colors">
                            {contract.customerName}
                          </div>
                          <div className="font-mono text-[11px] text-muted-foreground">
                            {contract.id.slice(0, 12)} · {contract.branchName}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Device Column */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2 text-xs">
                        <Smartphone className="size-4 text-muted-foreground shrink-0" />
                        <div>
                          <div className="font-medium text-foreground">
                            {contract.device.brand} {contract.device.model}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {contract.device.storage} · {contract.device.color}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Repayment Progress */}
                    <td className="px-5 py-3.5">
                      <div className="w-36">
                        <ProgressMeter
                          value={
                            contract.installmentCount === 0
                              ? 0
                              : (contract.paidInstallments /
                                  contract.installmentCount) *
                                100
                          }
                          tone={contract.overdueInstallments > 0 ? "danger" : "emerald"}
                        />
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground font-mono">
                        {contract.paidInstallments}/{contract.installmentCount} paid
                      </div>
                    </td>

                    {/* Next Due */}
                    <td className="px-5 py-3.5 text-xs text-muted-foreground">
                      {formatDate(contract.nextDueDate)}
                    </td>

                    {/* Status Badge */}
                    <td className="px-5 py-3.5">
                      <StatusBadge tone={contractTone(contract)}>
                        {contract.overdueInstallments > 0 ? "overdue" : contract.status}
                      </StatusBadge>
                    </td>

                    {/* Outstanding Amount */}
                    <td className="px-5 py-3.5 text-right font-mono font-bold text-xs text-foreground">
                      {money(contract.outstanding)}
                    </td>

                    {/* Action Arrow */}
                    <td className="px-5 py-3.5 text-right">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                        View <ArrowRight className="size-3.5" />
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

function contractTone(contract: AnalyticsContract): StatusTone {
  if (contract.overdueInstallments > 0) return "danger";
  switch (contract.status) {
    case "completed":
      return "success";
    case "active":
      return "info";
    case "past_due":
    case "terminated":
    case "written_off":
      return "danger";
    case "suspended":
      return "warning";
    case "draft":
    case "pending_signature":
    case "cancelled":
      return "neutral";
  }
}

function formatDate(value: string | null) {
  if (value === null) return "No balance due";
  return new Intl.DateTimeFormat("en-CM", { dateStyle: "medium" }).format(
    new Date(`${value}T00:00:00Z`),
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

