import { useQuery } from "@tanstack/react-query";
import { Activity, RefreshCcw, Server } from "lucide-react";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../components/common/AsyncState";
import { GlassCard } from "../../components/common/GlassCard";
import { SectionCard } from "../../components/common/SectionCard";
import { StatusBadge, type StatusTone } from "../../components/common/StatusBadge";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/ui/button";
import { getSystemHealth } from "../../lib/analytics";
import { dateTime } from "../../lib/format";

export function SystemHealth() {
  const query = useQuery({
    queryKey: ["platform", "system-health"],
    queryFn: getSystemHealth,
    refetchInterval: 30_000,
  });
  const data = query.data;
  const down = data?.services.some((service) => service.status === "down") ?? false;
  const notConfigured =
    data?.services.filter((service) => service.status === "not_configured").length ?? 0;
  return (
    <>
      <PageHeader
        title="System Health"
        subtitle={
          data === undefined
            ? "Live backend and provider configuration"
            : `Checked ${dateTime(data.checkedAt)} · refreshes every 30 seconds`
        }
        breadcrumb={["Operations", "System Health"]}
        actions={
          <Button
            variant="outline"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCcw
              className={`size-4 ${query.isFetching ? "animate-spin" : ""}`}
            />{" "}
            Refresh
          </Button>
        }
      />
      {query.isPending ? (
        <LoadingState label="Checking system health..." />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : data === undefined ? (
        <EmptyState label="System health is unavailable." />
      ) : (
        <>
          <GlassCard
            glow={down ? undefined : "emerald"}
            className="mb-4 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-center gap-4">
              <span
                className={`grid size-12 place-items-center rounded-2xl ${down ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary"}`}
              >
                <Activity className="size-6" />
              </span>
              <div>
                <div className="font-semibold">
                  {down
                    ? "A service health check failed"
                    : "Core services are operational"}
                </div>
                <div className="text-sm text-muted-foreground">
                  {notConfigured} optional provider
                  {notConfigured === 1 ? " is" : "s are"} not configured.
                </div>
              </div>
            </div>
            <StatusBadge
              tone={down ? "danger" : notConfigured > 0 ? "warning" : "success"}
            >
              {down ? "Outage" : notConfigured > 0 ? "Setup incomplete" : "Operational"}
            </StatusBadge>
          </GlassCard>
          <SectionCard title="Services" bodyClassName="p-0">
            <div className="divide-y divide-white/6">
              {data.services.map((service) => (
                <div key={service.name} className="flex items-center gap-3 px-5 py-4">
                  <Server className="size-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{service.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {service.detail}
                    </div>
                  </div>
                  <StatusBadge tone={healthTone(service.status)}>
                    {service.status.replaceAll("_", " ")}
                  </StatusBadge>
                </div>
              ))}
            </div>
          </SectionCard>
        </>
      )}
    </>
  );
}
function healthTone(status: "operational" | "down" | "not_configured"): StatusTone {
  if (status === "operational") return "success";
  if (status === "down") return "danger";
  return "warning";
}
