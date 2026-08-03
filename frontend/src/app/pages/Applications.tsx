import { useQuery } from "@tanstack/react-query";
import { FileClock, Plus } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { EmptyState, ErrorState, LoadingState } from "../components/common/AsyncState";
import { GlassCard } from "../components/common/GlassCard";
import { StatusBadge } from "../components/common/StatusBadge";
import { PageHeader } from "../components/layout/PageHeader";
import { Button } from "../components/ui/button";
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
  const query = useQuery({
    queryKey: ["applications"],
    queryFn: () => apiRequest<Application[]>("/applications"),
  });
  const applications = query.data ?? [];
  const rows = applications.filter((application) => {
    if (tab === "all") return true;
    if (tab === "pending") return isPending(application.status);
    return application.status === tab;
  });
  const pending = applications.filter((application) => isPending(application.status));

  return (
    <>
      <PageHeader
        title="Financing Applications"
        subtitle="Review and decision real financing requests"
        breadcrumb={["Operations", "Applications"]}
        actions={
          auth.tenantPermissions.includes("applications.create") ? (
            <Button onClick={() => navigate("/applications/new")}>
              <Plus className="size-4" aria-hidden="true" /> New application
            </Button>
          ) : undefined
        }
      />
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <GlassCard className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Awaiting review
          </div>
          <div className="mt-1 font-mono text-2xl font-semibold">{pending.length}</div>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Approved
          </div>
          <div className="mt-1 font-mono text-2xl font-semibold text-primary">
            {
              applications.filter((application) => application.status === "approved")
                .length
            }
          </div>
        </GlassCard>
        <GlassCard className="p-4" glow="gold">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Pending value
          </div>
          <div className="mt-1 font-mono text-2xl font-semibold">
            {money(
              pending.reduce(
                (total, application) =>
                  total + application.requestedTerms.deviceCashPrice.minorUnits,
                0,
              ),
              true,
            )}
          </div>
        </GlassCard>
      </div>

      <section className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03]">
        <div className="flex flex-col gap-3 border-b border-white/8 p-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base">Application queue</h2>
          <div
            className="flex items-center gap-1 rounded-lg border border-white/8 bg-white/[0.03] p-1"
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
                  "rounded-md px-3 py-1.5 text-xs font-medium capitalize",
                  tab === value
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
        {query.isLoading ? (
          <LoadingState label="Loading applications…" />
        ) : query.isError ? (
          <div className="p-4">
            <ErrorState error={query.error} retry={() => void query.refetch()} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState label="No applications match this filter." />
        ) : (
          <div className="scroll-slim overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-white/8 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3">Applicant</th>
                  <th className="px-5 py-3">Device</th>
                  <th className="px-5 py-3">Plan</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/6">
                {rows.map((application) => (
                  <tr key={application.id}>
                    <td className="px-5 py-3">
                      <button
                        className="text-left font-medium hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        onClick={() => navigate(`/applications/${application.id}`)}
                      >
                        {application.applicant.fullName}
                      </button>
                      <div className="font-mono text-xs text-muted-foreground">
                        {application.id.slice(0, 8)} ·{" "}
                        {dateTime(application.submittedAt ?? application.createdAt)}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {application.device.brand} {application.device.model}
                    </td>
                    <td className="px-5 py-3">
                      {application.requestedTerms.requestedInstallmentCount}{" "}
                      {application.requestedTerms.requestedRepaymentFrequency}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge tone={tone(application.status)}>
                        {application.status.replaceAll("_", " ")}
                      </StatusBadge>
                    </td>
                    <td className="px-5 py-3 text-right font-mono">
                      {money(application.requestedTerms.deviceCashPrice.minorUnits)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
