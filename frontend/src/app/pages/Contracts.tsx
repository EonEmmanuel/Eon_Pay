import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { EmptyState, ErrorState, LoadingState } from "../components/common/AsyncState";
import { ProgressMeter } from "../components/common/ProgressMeter";
import { SectionCard } from "../components/common/SectionCard";
import { StatusBadge, type StatusTone } from "../components/common/StatusBadge";
import { PageHeader } from "../components/layout/PageHeader";
import { Button } from "../components/ui/button";
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
  const query = useQuery({
    queryKey: tenantAnalyticsQueryKey,
    queryFn: getTenantAnalytics,
  });
  const rows = useMemo(
    () =>
      (query.data?.contracts ?? []).filter((contract) => {
        if (tab === "all") return true;
        if (tab === "overdue") return contract.overdueInstallments > 0;
        return contract.status === tab;
      }),
    [query.data?.contracts, tab],
  );

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
    <>
      <PageHeader
        title="Contracts"
        subtitle={`${query.data?.summary.contracts ?? 0} agreements from the live financing ledger`}
        breadcrumb={["Finance", "Contracts"]}
        actions={
          <Button
            variant="outline"
            onClick={exportContracts}
            disabled={rows.length === 0}
          >
            <Download className="size-4" aria-hidden="true" /> Export CSV
          </Button>
        }
      />
      <SectionCard
        bodyClassName="p-0"
        title="Contract register"
        action={
          <div
            className="flex flex-wrap items-center gap-1 rounded-lg border border-white/8 bg-white/[0.03] p-1"
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
                  "rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                  tab === value
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {value}
              </button>
            ))}
          </div>
        }
      >
        {query.isPending ? (
          <LoadingState label="Loading contracts..." />
        ) : query.isError ? (
          <div className="p-5">
            <ErrorState error={query.error} retry={() => void query.refetch()} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState label="No contracts match this filter." />
        ) : (
          <div className="scroll-slim overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead>
                <tr className="border-b border-white/8 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3">Contract</th>
                  <th className="px-5 py-3">Device</th>
                  <th className="px-5 py-3">Progress</th>
                  <th className="px-5 py-3">Next due</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Outstanding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/6">
                {rows.map((contract) => (
                  <tr
                    key={contract.id}
                    onClick={() => navigate(`/contracts/${contract.id}`)}
                    className="cursor-pointer hover:bg-white/[0.03]"
                  >
                    <td className="px-5 py-3">
                      <div className="font-medium">{contract.customerName}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {contract.id}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {contract.branchName}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {contract.device.brand} {contract.device.model}
                      <div className="text-xs">
                        {contract.device.storage} · {contract.device.color}
                      </div>
                    </td>
                    <td className="px-5 py-3">
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
                      <div className="mt-1 text-xs text-muted-foreground">
                        {contract.paidInstallments}/{contract.installmentCount} paid
                      </div>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {formatDate(contract.nextDueDate)}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge tone={contractTone(contract)}>
                        {contract.overdueInstallments > 0 ? "overdue" : contract.status}
                      </StatusBadge>
                    </td>
                    <td className="px-5 py-3 text-right font-mono">
                      {money(contract.outstanding)}
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
