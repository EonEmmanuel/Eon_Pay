import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, ShieldX } from "lucide-react";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../components/common/AsyncState";
import { StatusBadge } from "../../components/common/StatusBadge";
import { apiRequest } from "../../lib/api";
import { dateTime } from "../../lib/format";

interface Device {
  id: string;
  imei: string;
  status: string;
  provider: string;
  lastSeenAt: string | null;
  enrolledAt: string | null;
}

export function Device() {
  const query = useQuery({
    queryKey: ["my-devices"],
    queryFn: () => apiRequest<Device[]>("/devices"),
  });
  if (query.isLoading) return <LoadingState label="Loading your device…" />;
  if (query.isError) {
    return <ErrorState error={query.error} retry={() => void query.refetch()} />;
  }
  const device = query.data?.[0];
  if (device === undefined) {
    return <EmptyState label="No managed device is enrolled." />;
  }
  return (
    <section>
      <h1 className="text-xl">My device</h1>
      <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
        <div className="flex items-center justify-between">
          {device.status === "active" ? (
            <ShieldCheck className="size-9 text-primary" aria-hidden="true" />
          ) : (
            <ShieldX className="size-9 text-destructive" aria-hidden="true" />
          )}
          <StatusBadge tone={device.status === "active" ? "success" : "danger"}>
            {device.status}
          </StatusBadge>
        </div>
        <dl className="mt-5 space-y-3 text-sm">
          <Row label="IMEI" value={device.imei} />
          <Row label="Managed by" value={device.provider} />
          <Row label="Enrolled" value={dateTime(device.enrolledAt)} />
          <Row label="Last contact" value={dateTime(device.lastSeenAt)} />
        </dl>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Device restrictions are controlled by the signed financing contract and are
        recorded in the audit trail.
      </p>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
