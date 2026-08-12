import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Plus, QrCode, RefreshCw, ShieldCheck } from "lucide-react";
import QRCode from "qrcode";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { EmptyState, ErrorState, LoadingState } from "../components/common/AsyncState";
import { GlassCard } from "../components/common/GlassCard";
import { StatusBadge } from "../components/common/StatusBadge";
import { PageHeader } from "../components/layout/PageHeader";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { apiRequest } from "../lib/api";
import { useAuth } from "../lib/auth";
import { dateTime } from "../lib/format";
import { getInventoryUnits, inventoryUnitsKey } from "../lib/inventory";

interface Contract {
  id: string;
  status: string;
  device: { brand: string; model: string; imei?: string };
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
}

interface EnrollmentState {
  id: string;
  contractId: string;
  inventoryUnitId: string | null;
  imei: string;
  serialNumber: string | null;
  status: string;
  enrolledAt: string | null;
  lastSeenAt: string | null;
  enrollmentExpiresAt: string | null;
  deviceOwnerAttested: boolean;
  provider: string;
}

interface EnrollmentIntent {
  device: EnrollmentState;
  expiresAt: string;
  provisioningPayload: Record<string, unknown>;
}

export function Devices() {
  const navigate = useNavigate();
  const auth = useAuth();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [contractId, setContractId] = useState("");
  const [intent, setIntent] = useState<EnrollmentIntent>();
  const [provisioningQr, setProvisioningQr] = useState<string>();
  const canEnroll =
    auth.tenantPermissions.includes("devices.manage") &&
    auth.tenantPermissions.includes("inventory.stock.manage");
  const query = useQuery({
    queryKey: ["devices"],
    queryFn: () => apiRequest<ManagedDevice[]>("/devices"),
  });
  const contracts = useQuery({
    queryKey: ["contracts"],
    queryFn: () => apiRequest<Contract[]>("/contracts"),
  });
  const units = useQuery({
    queryKey: inventoryUnitsKey,
    queryFn: () => getInventoryUnits(),
  });
  const eligible = (contracts.data ?? []).filter(
    (contract) =>
      ["active", "past_due", "suspended"].includes(contract.status) &&
      contract.device.imei &&
      !(query.data ?? []).some(
        (device) =>
          device.contractId === contract.id && device.status !== "pending_enrollment",
      ),
  );
  const selected = eligible.find((contract) => contract.id === contractId);
  const selectedUnit = (units.data ?? []).find(
    (unit) =>
      unit.contractId === contractId &&
      unit.status === "financed" &&
      unit.imei === selected?.device.imei,
  );
  const enrollment = useQuery({
    queryKey: ["device-enrollment", contractId],
    enabled: open && contractId !== "",
    queryFn: () =>
      apiRequest<EnrollmentState | null>(`/device-enrollments/contracts/${contractId}`),
  });
  const enroll = useMutation({
    mutationFn: () =>
      apiRequest<EnrollmentIntent>("/device-enrollments", {
        method: "POST",
        body: JSON.stringify({ contractId, inventoryUnitId: selectedUnit?.id }),
      }),
    onSuccess: async (created) => {
      setIntent(created);
      setProvisioningQr(
        await QRCode.toDataURL(JSON.stringify(created.provisioningPayload), {
          width: 320,
          margin: 2,
          errorCorrectionLevel: "M",
        }),
      );
      toast.success("One-time first-party enrollment QR created");
      await client.invalidateQueries({ queryKey: ["device-enrollment", contractId] });
    },
    onError: (error) => toast.error(error.message),
  });
  const rows = query.data ?? [];

  async function changeDialog(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) return;
    setContractId("");
    setIntent(undefined);
    setProvisioningQr(undefined);
    await client.invalidateQueries({ queryKey: ["devices"] });
  }

  return (
    <>
      <PageHeader
        title="Device Management"
        subtitle="First-party Device Owner enrollment, policies, and authenticated check-ins"
        breadcrumb={["Devices", "Managed devices"]}
        actions={
          canEnroll ? (
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" /> Enroll with device agent
            </Button>
          ) : undefined
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <GlassCard className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Enrolled
          </div>
          <div className="mt-1 font-mono text-2xl font-semibold">{rows.length}</div>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Active
          </div>
          <div className="mt-1 font-mono text-2xl font-semibold text-primary">
            {rows.filter((device) => device.status === "active").length}
          </div>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Restricted
          </div>
          <div className="mt-1 font-mono text-2xl font-semibold text-destructive">
            {rows.filter((device) => device.status === "restricted").length}
          </div>
        </GlassCard>
      </div>
      <section className="overflow-hidden rounded-2xl border border-border bg-muted/50">
        <h2 className="border-b border-border p-4 text-base">Managed devices</h2>
        {query.isLoading ? (
          <LoadingState label="Loading devices..." />
        ) : query.isError ? (
          <div className="p-4">
            <ErrorState error={query.error} retry={() => void query.refetch()} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState label="No financed devices are enrolled." />
        ) : (
          <div className="scroll-slim overflow-x-auto">
            <table className="w-full min-w-[740px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3">Device</th>
                  <th className="px-5 py-3">Contract</th>
                  <th className="px-5 py-3">Management</th>
                  <th className="px-5 py-3">Last seen</th>
                  <th className="px-5 py-3">State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((device) => (
                  <tr key={device.id}>
                    <td className="px-5 py-3">
                      <button
                        className="text-left hover:text-primary focus-visible:ring-2 focus-visible:ring-primary"
                        onClick={() => navigate(`/devices/${device.id}`)}
                      >
                        <span className="block font-medium">
                          {device.providerDeviceId}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {device.imei}
                        </span>
                      </button>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs">{device.contractId}</td>
                    <td className="px-5 py-3">
                      {device.provider === "first_party_dpc"
                        ? "First-party agent"
                        : device.provider}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {dateTime(device.lastSeenAt)}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge
                        tone={
                          device.status === "active"
                            ? "success"
                            : device.status === "restricted"
                              ? "danger"
                              : "warning"
                        }
                      >
                        {device.status === "restricted" ? (
                          <Lock className="size-3" aria-hidden="true" />
                        ) : (
                          <ShieldCheck className="size-3" aria-hidden="true" />
                        )}
                        {device.status}
                      </StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <Dialog open={open} onOpenChange={(value) => void changeDialog(value)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enroll an activated phone</DialogTitle>
            <DialogDescription>
              Retrofit an activated contract that predates mandatory enrollment. The
              phone must be factory-reset and provisioned with the first-party Device
              Owner QR.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="enrollment-contract">Activated contract</Label>
              <Select
                value={contractId}
                onValueChange={(value) => {
                  setContractId(value);
                  setIntent(undefined);
                  setProvisioningQr(undefined);
                }}
              >
                <SelectTrigger id="enrollment-contract">
                  <SelectValue placeholder="Select contract and financed IMEI" />
                </SelectTrigger>
                <SelectContent>
                  {eligible.map((contract) => (
                    <SelectItem key={contract.id} value={contract.id}>
                      {contract.device.brand} {contract.device.model} -{" "}
                      {contract.device.imei}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!contracts.isPending && eligible.length === 0 && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Every eligible activated contract already has a managed-device record.
                </p>
              )}
            </div>
            {selected !== undefined &&
              selectedUnit === undefined &&
              !units.isPending && (
                <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                  The financed inventory unit linked to this contract could not be
                  found. Correct the stock assignment before enrollment.
                </div>
              )}
            {selectedUnit !== undefined && (
              <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-sm text-amber-100">
                This QR is valid only during Android’s initial setup. Reset the phone,
                tap the welcome screen six times, connect to the internet, and scan the
                QR. Resetting deletes the customer’s local data, so obtain authorization
                and back it up first.
              </div>
            )}
            {provisioningQr !== undefined && intent !== undefined && (
              <div className="rounded-xl border border-primary/20 bg-white p-4 text-center text-slate-950">
                <img
                  src={provisioningQr}
                  alt="First-party Android Device Owner provisioning QR code"
                  className="mx-auto size-64 max-w-full"
                />
                <p className="mt-2 text-xs">
                  Valid until {dateTime(intent.expiresAt)}. The credential is displayed
                  only inside this one-time QR.
                </p>
              </div>
            )}
            {enrollment.data?.status === "pending_enrollment" && (
              <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-sm text-amber-200">
                Waiting for Device Owner provisioning and the first authenticated
                check-in.
              </div>
            )}
            {enrollment.data?.status === "active" &&
              enrollment.data.deviceOwnerAttested && (
                <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3 text-sm text-emerald-200">
                  Enrollment verified. This phone is now managed by the first-party
                  agent.
                </div>
              )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => void changeDialog(false)}>
              {enrollment.data?.status === "active" ? "Done" : "Cancel"}
            </Button>
            {contractId !== "" && (
              <Button
                variant="outline"
                busy={enrollment.isFetching}
                onClick={() => void enrollment.refetch()}
              >
                <RefreshCw className="size-4" /> Refresh status
              </Button>
            )}
            {enrollment.data?.status !== "active" && (
              <Button
                disabled={selectedUnit === undefined}
                busy={enroll.isPending}
                onClick={() => enroll.mutate()}
              >
                <QrCode className="size-4" />
                {enrollment.data === null ? "Create enrollment QR" : "Regenerate QR"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
