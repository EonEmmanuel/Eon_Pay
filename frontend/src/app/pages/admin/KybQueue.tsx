import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Building2, Clock3, ShieldAlert, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../components/common/AsyncState";
import { GlassCard } from "../../components/common/GlassCard";
import { StatusBadge } from "../../components/common/StatusBadge";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { dateTime } from "../../lib/format";
import { listPlatformKyb, platformKybQueryKey } from "../../lib/kyb";

export function KybQueue() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const query = useQuery({ queryKey: platformKybQueryKey, queryFn: listPlatformKyb });
  const cases = useMemo(() => {
    const value = search.trim().toLowerCase();
    return (query.data ?? []).filter((item) =>
      [item.tenantName, item.legalName, item.registrationNumber, item.status]
        .join(" ")
        .toLowerCase()
        .includes(value),
    );
  }, [query.data, search]);

  return (
    <>
      <PageHeader
        title="Retailer KYB"
        subtitle="Provider evidence, risk signals and final platform decisions"
        breadcrumb={["Platform", "Compliance", "Retailer KYB"]}
      />
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Metric
          icon={Clock3}
          label="Awaiting review"
          value={String(
            (query.data ?? []).filter((item) =>
              ["provider_approved", "provider_declined", "in_review"].includes(
                item.status,
              ),
            ).length,
          )}
          tone="amber"
        />
        <Metric
          icon={ShieldCheck}
          label="Approved"
          value={String(
            (query.data ?? []).filter((item) => item.status === "approved").length,
          )}
          tone="green"
        />
        <Metric
          icon={ShieldAlert}
          label="Needs attention"
          value={String(
            (query.data ?? []).filter((item) =>
              ["provider_declined", "resubmission_required", "rejected"].includes(
                item.status,
              ),
            ).length,
          )}
          tone="red"
        />
      </div>
      <GlassCard className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold">Verification cases</h2>
            <p className="text-sm text-muted-foreground">
              Decisions remain auditable and tenant-isolated.
            </p>
          </div>
          <Input
            className="sm:w-80"
            aria-label="Search KYB cases"
            placeholder="Search retailer or registration..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {query.isPending ? (
          <LoadingState label="Loading KYB review queue..." />
        ) : query.isError ? (
          <div className="p-5">
            <ErrorState error={query.error} retry={() => void query.refetch()} />
          </div>
        ) : cases.length === 0 ? (
          <EmptyState label="No KYB cases match this view." />
        ) : (
          <div className="scroll-slim overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-3">Retailer</th>
                  <th className="px-5 py-3">Registration</th>
                  <th className="px-5 py-3">Decision</th>
                  <th className="px-5 py-3">Risk</th>
                  <th className="px-5 py-3">Updated</th>
                  <th className="px-5 py-3 text-right">Review</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {cases.map((item) => (
                  <tr
                    key={item.id}
                    className="transition-colors hover:bg-accent/60"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                          <Building2 className="size-4" />
                        </span>
                        <div>
                          <div className="font-medium">{item.legalName}</div>
                          <div className="text-xs text-muted-foreground">
                            {item.tenantName} · {item.countryCode}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 font-mono text-xs">
                      {item.registrationNumber}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge
                        tone={
                          item.status === "approved" ||
                          item.status === "provider_approved"
                            ? "success"
                            : item.status.includes("declined") ||
                                item.status === "rejected"
                              ? "danger"
                              : "warning"
                        }
                      >
                        {item.status.replaceAll("_", " ")}
                      </StatusBadge>
                    </td>
                    <td className="px-5 py-4">
                      <span className="font-mono">{item.riskScore ?? "—"}</span>
                      <span className="text-muted-foreground"> / 100</span>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">
                      {dateTime(item.updatedAt)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/admin/kyb/${item.id}`)}
                      >
                        Open case <ArrowRight className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Clock3;
  label: string;
  value: string;
  tone: "amber" | "green" | "red";
}) {
  const colors = {
    amber: "bg-amber-400/10 text-amber-300",
    green: "bg-primary/10 text-primary",
    red: "bg-destructive/10 text-destructive",
  };
  return (
    <GlassCard className="p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            {label}
          </div>
          <div className="mt-2 font-mono text-3xl font-semibold">{value}</div>
        </div>
        <span className={`grid size-11 place-items-center rounded-2xl ${colors[tone]}`}>
          <Icon className="size-5" />
        </span>
      </div>
    </GlassCard>
  );
}
