import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  CreditCard,
  FileCheck2,
  FileClock,
  Filter,
  Plus,
  Search,
  ShieldAlert,
  Smartphone,
  User,
  Wallet,
  Zap,
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
import { apiRequest } from "../lib/api";
import { useAuth } from "../lib/auth";
import { dateTime, money } from "../lib/format";

type ApplicationStatus =
  | "draft"
  | "submitted"
  | "kyc_review"
  | "credit_review"
  | "approved"
  | "rejected"
  | "cancelled"
  | "expired";

interface Application {
  id: string;
  applicant: { fullName: string };
  device: { brand: string; model: string };
  requestedTerms: {
    deviceCashPrice: { minorUnits: number };
    requestedInstallmentCount: number;
    requestedRepaymentFrequency: string;
  };
  status: ApplicationStatus;
  submittedAt: string | null;
  createdAt: string;
}

const tabs = ["all", "pending", "approved", "rejected"] as const;

function isPending(status: ApplicationStatus): boolean {
  return ["submitted", "kyc_review", "credit_review"].includes(status);
}

function tone(status: ApplicationStatus) {
  if (status === "approved") return "success" as const;
  if (status === "rejected" || status === "cancelled" || status === "expired") {
    return "danger" as const;
  }
  if (status === "draft") return "neutral" as const;
  return "warning" as const;
}

export function Applications() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [tab, setTab] = useState<(typeof tabs)[number]>("all");
  const [search, setSearch] = useState("");

  const query = useQuery({
    queryKey: ["applications"],
    queryFn: () => apiRequest<Application[]>("/applications"),
  });

  const applications = query.data ?? [];

  const pending = applications.filter((application) => isPending(application.status));
  const approved = applications.filter((application) => application.status === "approved");
  const pendingValue = pending.reduce(
    (total, application) =>
      total + application.requestedTerms.deviceCashPrice.minorUnits,
    0,
  );

  const filteredRows = useMemo(() => {
    return applications.filter((application) => {
      // Tab filter
      const matchesTab =
        tab === "all"
          ? true
          : tab === "pending"
            ? isPending(application.status)
            : application.status === tab;

      if (!matchesTab) return false;

      // Search filter
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        application.applicant.fullName.toLowerCase().includes(q) ||
        application.device.brand.toLowerCase().includes(q) ||
        application.device.model.toLowerCase().includes(q) ||
        application.id.toLowerCase().includes(q)
      );
    });
  }, [applications, tab, search]);

  return (
    <div className="space-y-6 pb-16 pt-2">
      <PageHeader
        title="Financing Applications"
        subtitle="Review, underwrite, and decision customer device financing requests"
        breadcrumb={["Operations", "Applications"]}
        actions={
          auth.tenantPermissions.includes("applications.create") ? (
            <Button
              onClick={() => navigate("/applications/new")}
              className="rounded-xl bg-[#00DF81] text-black font-bold hover:bg-[#00DF81]/90 shadow-md shadow-emerald-500/20 text-xs h-10 gap-1.5"
            >
              <Plus className="size-4" /> New application
            </Button>
          ) : undefined
        }
      />

      {/* KPI Metrics Ribbon */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <GlassCard className="p-4.5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Pipeline</span>
            <FileClock className="size-4.5 text-primary" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-foreground">
            {applications.length}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Active underwriting queue
          </div>
        </GlassCard>

        <GlassCard className="p-4.5">
          <div className="flex items-center justify-between text-amber-500">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Awaiting Review
            </span>
            <Clock className="size-4.5" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-amber-500">
            {pending.length}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            KYC & credit score check
          </div>
        </GlassCard>

        <GlassCard className="p-4.5">
          <div className="flex items-center justify-between text-[#00DF81]">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Approved
            </span>
            <CheckCircle2 className="size-4.5" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-emerald-600 dark:text-[#00DF81]">
            {approved.length}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Ready for contract signature
          </div>
        </GlassCard>

        <GlassCard className="p-4.5" glow="gold">
          <div className="flex items-center justify-between text-amber-500">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Pending Volume
            </span>
            <Wallet className="size-4.5" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-foreground">
            {money(pendingValue, true)}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Total pending device financing
          </div>
        </GlassCard>
      </div>

      {/* Main Queue Card */}
      <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-xs">
        {/* Controls Bar: Search & Status Tabs */}
        <div className="flex flex-col gap-4 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between bg-muted/20">
          {/* Search Bar */}
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search applicant name, device or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 rounded-xl pl-9 text-xs"
            />
          </div>

          {/* Status Tabs */}
          <div
            className="flex items-center gap-1 rounded-xl border border-border bg-muted/40 p-1 overflow-x-auto no-scrollbar max-w-full"
            role="tablist"
            aria-label="Application status"
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
                {value === "pending" && pending.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-amber-500/20 px-1.5 py-0.2 font-mono text-[10px] text-amber-600 dark:text-amber-400 font-bold">
                    {pending.length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Table Content */}
        {query.isLoading ? (
          <div className="p-8">
            <LoadingState label="Loading applications…" />
          </div>
        ) : query.isError ? (
          <div className="p-6">
            <ErrorState error={query.error} retry={() => void query.refetch()} />
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="p-8">
            <EmptyState label="No applications match this filter." />
          </div>
        ) : (
          <div className="no-scrollbar overflow-x-auto">
            <table className="w-full min-w-[780px] text-sm text-left">
              <thead>
                <tr className="border-b border-border bg-muted/20 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-3.5">Applicant</th>
                  <th className="px-5 py-3.5">Device</th>
                  <th className="px-5 py-3.5">Repayment Terms</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Device Value</th>
                  <th className="px-5 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {filteredRows.map((application) => (
                  <tr
                    key={application.id}
                    onClick={() => navigate(`/applications/${application.id}`)}
                    className="group cursor-pointer transition-colors hover:bg-accent/40"
                  >
                    {/* Applicant Column */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary font-bold text-xs">
                          {application.applicant.fullName.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-xs text-foreground group-hover:text-primary transition-colors">
                            {application.applicant.fullName}
                          </div>
                          <div className="font-mono text-[11px] text-muted-foreground">
                            {application.id.slice(0, 12)} · {dateTime(application.submittedAt ?? application.createdAt)}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Device Column */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2 text-xs">
                        <Smartphone className="size-4 text-muted-foreground shrink-0" />
                        <span className="font-medium text-foreground">
                          {application.device.brand} {application.device.model}
                        </span>
                      </div>
                    </td>

                    {/* Repayment Terms */}
                    <td className="px-5 py-3.5 text-xs text-muted-foreground">
                      <span className="font-mono font-medium text-foreground">
                        {application.requestedTerms.requestedInstallmentCount}
                      </span>{" "}
                      <span className="capitalize">{application.requestedTerms.requestedRepaymentFrequency} payments</span>
                    </td>

                    {/* Status Badge */}
                    <td className="px-5 py-3.5">
                      <StatusBadge tone={tone(application.status)}>
                        {application.status.replaceAll("_", " ")}
                      </StatusBadge>
                    </td>

                    {/* Cash Price */}
                    <td className="px-5 py-3.5 text-right font-mono font-bold text-xs text-foreground">
                      {money(application.requestedTerms.deviceCashPrice.minorUnits)}
                    </td>

                    {/* Action Arrow */}
                    <td className="px-5 py-3.5 text-right">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                        Review <ArrowRight className="size-3.5" />
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

