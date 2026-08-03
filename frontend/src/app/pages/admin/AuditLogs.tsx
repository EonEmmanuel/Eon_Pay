import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, ShieldX } from "lucide-react";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../components/common/AsyncState";
import { GlassCard } from "../../components/common/GlassCard";
import { StatusBadge } from "../../components/common/StatusBadge";
import { PageHeader } from "../../components/layout/PageHeader";
import { apiRequest } from "../../lib/api";
import { dateTime } from "../../lib/format";

interface AuditEvent {
  id: string;
  actionCode: string;
  actionLabel: string;
  message: string;
  actor: {
    id: string | null;
    name: string | null;
    email: string | null;
    label: string;
  };
  resource: { type: string; label: string; id: string | null };
  requestId: string | null;
  details: Record<string, unknown>;
  eventHash: string;
  previousHash: string | null;
  occurredAt: string;
}

interface Verification {
  valid: boolean;
  checkedEvents: number;
  firstInvalidEventId: string | null;
}

export function AuditLogs() {
  const events = useQuery({
    queryKey: ["platform", "audit-events"],
    queryFn: () =>
      apiRequest<AuditEvent[]>("/platform/audit-events", { tenant: false }),
  });
  const verification = useQuery({
    queryKey: ["platform", "audit-verification"],
    queryFn: () =>
      apiRequest<Verification>("/platform/audit-events/verify", {
        tenant: false,
      }),
  });

  return (
    <>
      <PageHeader
        title="Immutable audit trail"
        subtitle="Platform administration events protected by a SHA-256 hash chain"
        breadcrumb={["Security", "Audit"]}
      />
      <GlassCard
        className="mb-4 flex items-center justify-between gap-4"
        glow={verification.data?.valid ? "emerald" : undefined}
      >
        <div>
          <h2 className="text-base">Chain verification</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {verification.isLoading
              ? "Verifying…"
              : verification.data?.valid
                ? `${verification.data.checkedEvents} events verified`
                : `Integrity failure at ${verification.data?.firstInvalidEventId ?? "unknown event"}`}
          </p>
        </div>
        {verification.data?.valid ? (
          <StatusBadge tone="success">
            <ShieldCheck className="size-4" aria-hidden="true" /> Valid
          </StatusBadge>
        ) : (
          <StatusBadge tone="danger">
            <ShieldX className="size-4" aria-hidden="true" /> Attention
          </StatusBadge>
        )}
      </GlassCard>
      <section className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03]">
        <h2 className="border-b border-white/8 p-4 text-base">Events</h2>
        {events.isLoading ? (
          <LoadingState label="Loading audit events…" />
        ) : events.isError ? (
          <div className="p-4">
            <ErrorState error={events.error} retry={() => void events.refetch()} />
          </div>
        ) : events.data?.length === 0 ? (
          <EmptyState label="No audit events recorded." />
        ) : (
          <div className="scroll-slim overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-white/8 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3">Time</th>
                  <th className="px-5 py-3">Activity</th>
                  <th className="px-5 py-3">Resource</th>
                  <th className="px-5 py-3">Actor</th>
                  <th className="px-5 py-3">Hash</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/6">
                {(events.data ?? []).map((event) => (
                  <tr key={event.id}>
                    <td className="px-5 py-3 text-muted-foreground">
                      {dateTime(event.occurredAt)}
                    </td>
                    <td className="px-5 py-3">
                      <div className="font-medium">{event.actionLabel}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {event.message}
                      </div>
                    </td>
                    <td className="px-5 py-3">{event.resource.label}</td>
                    <td className="px-5 py-3 text-xs">
                      <div>{event.actor.label}</div>
                      {event.actor.name !== null && event.actor.email !== null && (
                        <div className="text-muted-foreground">{event.actor.email}</div>
                      )}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs" title={event.eventHash}>
                      {event.eventHash.slice(0, 12)}…
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
