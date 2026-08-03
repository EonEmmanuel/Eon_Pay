import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Lock, RefreshCw, ShieldOff } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { ErrorState, LoadingState } from "../components/common/AsyncState";
import { GlassCard } from "../components/common/GlassCard";
import { StatusBadge } from "../components/common/StatusBadge";
import { PageHeader } from "../components/layout/PageHeader";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import { Button } from "../components/ui/button";
import { apiRequest, idempotencyKey } from "../lib/api";
import { dateTime } from "../lib/format";

type CommandKind = "lock" | "restrict" | "release" | "sync";

interface MdmCommand {
  id: string;
  kind: string;
  status: string;
  reason: string;
  createdAt: string;
}

interface ManagedDevice {
  id: string;
  contractId: string;
  provider: string;
  providerDeviceId: string;
  imei: string;
  status: string;
  lastSeenAt: string | null;
  enrolledAt: string | null;
  commands: MdmCommand[];
}

export function DeviceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState<CommandKind>();
  const query = useQuery({
    queryKey: ["device", id],
    enabled: id !== undefined,
    queryFn: () => apiRequest<ManagedDevice>(`/devices/${id ?? ""}`),
  });
  const mutation = useMutation({
    mutationFn: (kind: CommandKind) =>
      apiRequest(`/devices/${id ?? ""}/commands`, {
        method: "POST",
        headers: { "idempotency-key": idempotencyKey(`mdm-${kind}`) },
        body: JSON.stringify({
          kind,
          reason:
            kind === "restrict"
              ? "Contract servicing restriction authorized by operator"
              : `${kind} requested by operator`,
        }),
      }),
    onSuccess: async () => {
      toast.success("Esper command accepted");
      setConfirm(undefined);
      await queryClient.invalidateQueries({ queryKey: ["device", id] });
    },
    onError: (error) => toast.error(error.message),
  });

  if (query.isLoading) {
    return <LoadingState label="Loading managed device…" />;
  }
  if (query.isError || query.data === undefined) {
    return <ErrorState error={query.error} retry={() => void query.refetch()} />;
  }
  const device = query.data;

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="mb-3 -ml-2"
        onClick={() => navigate("/devices")}
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> Back to devices
      </Button>
      <PageHeader
        title={`Managed device ${device.id.slice(0, 8)}`}
        subtitle={`Esper device ${device.providerDeviceId}`}
        actions={
          <StatusBadge
            tone={
              device.status === "active"
                ? "success"
                : device.status === "restricted"
                  ? "danger"
                  : "warning"
            }
          >
            {device.status}
          </StatusBadge>
        }
      />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <GlassCard>
          <h2 className="text-base">Device identity</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <Row label="IMEI" value={device.imei} />
            <Row label="Contract" value={device.contractId} />
            <Row label="Provider" value={device.provider} />
            <Row label="Enrolled" value={dateTime(device.enrolledAt)} />
            <Row label="Last seen" value={dateTime(device.lastSeenAt)} />
          </dl>
          <div className="mt-5 space-y-2">
            <Button
              className="w-full"
              variant="destructive"
              onClick={() => setConfirm("restrict")}
            >
              <Lock className="size-4" aria-hidden="true" /> Restrict device
            </Button>
            <Button
              className="w-full"
              variant="outline"
              onClick={() => setConfirm("release")}
            >
              <ShieldOff className="size-4" aria-hidden="true" /> Restore policy
            </Button>
            <Button
              className="w-full"
              variant="outline"
              onClick={() => setConfirm("sync")}
            >
              <RefreshCw className="size-4" aria-hidden="true" /> Force sync
            </Button>
          </div>
        </GlassCard>
        <GlassCard className="xl:col-span-2">
          <h2 className="text-base">Command history</h2>
          {device.commands.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              No commands have been issued.
            </p>
          ) : (
            <ol className="mt-4 space-y-3">
              {device.commands.map((command) => (
                <li
                  key={command.id}
                  className="rounded-xl border border-white/8 bg-white/[0.03] p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{command.kind}</span>
                    <StatusBadge
                      tone={
                        command.status === "failed"
                          ? "danger"
                          : command.status === "acknowledged"
                            ? "success"
                            : "warning"
                      }
                    >
                      {command.status}
                    </StatusBadge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{command.reason}</p>
                  <time className="mt-1 block text-xs text-muted-foreground">
                    {dateTime(command.createdAt)}
                  </time>
                </li>
              ))}
            </ol>
          )}
        </GlassCard>
      </div>

      <AlertDialog
        open={confirm !== undefined}
        onOpenChange={(open) => !open && setConfirm(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Issue {confirm} command?</AlertDialogTitle>
            <AlertDialogDescription>
              This sends a real command to Esper and records the request in the
              immutable audit chain.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {mutation.isError && (
            <p className="text-sm text-destructive" role="alert">
              {mutation.error.message}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={mutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (confirm !== undefined) mutation.mutate(confirm);
              }}
            >
              {mutation.isPending ? "Sending…" : "Send command"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="max-w-[65%] break-all text-right font-medium">{value}</dd>
    </div>
  );
}
