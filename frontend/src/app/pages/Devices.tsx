import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  Filter,
  Lock,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Unlock,
  Zap,
} from "lucide-react";
import QRCode from "qrcode";
import { useMemo, useState } from "react";
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
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { cn } from "../components/ui/utils";
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

const statusFilters = ["all", "active", "restricted", "pending"] as const;

export function Devices() {
  const navigate = useNavigate();
  const auth = useAuth();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [contractId, setContractId] = useState("");
  const [intent, setIntent] = useState<EnrollmentIntent>();
  const [provisioningQr, setProvisioningQr] = useState<string>();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<(typeof statusFilters)[number]>("all");

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

  const devices = query.data ?? [];
  const activeDevices = devices.filter((d) => d.status === "active");
  const restrictedDevices = devices.filter((d) => d.status === "restricted");

  const filteredDevices = useMemo(() => {
    return devices.filter((device) => {
      const matchesFilter =
        filter === "all"
          ? true
          : filter === "pending"
            ? device.status === "pending_enrollment"
            : device.status === filter;

      if (!matchesFilter) return false;

      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        device.imei.toLowerCase().includes(q) ||
        device.providerDeviceId.toLowerCase().includes(q) ||
        device.contractId.toLowerCase().includes(q) ||
        device.provider.toLowerCase().includes(q)
      );
    });
  }, [devices, filter, search]);

  async function changeDialog(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) return;
    setContractId("");
    setIntent(undefined);
    setProvisioningQr(undefined);
    await client.invalidateQueries({ queryKey: ["devices"] });
  }

  return (
    <div className="space-y-6 pb-16 pt-2">
      <PageHeader
        title="Device Fleet Management"
        subtitle="Knox & MDM Device Owner enrollment, remote lock policies, and authenticated telemetry"
        breadcrumb={["Devices", "Managed devices"]}
        actions={
          canEnroll ? (
            <Button
              onClick={() => setOpen(true)}
              className="rounded-xl bg-[#00DF81] text-black font-bold hover:bg-[#00DF81]/90 shadow-md shadow-emerald-500/20 text-xs h-10 gap-1.5"
            >
              <Plus className="size-4" /> Enroll Device
            </Button>
          ) : undefined
        }
      />

      {/* KPI Metrics Summary Ribbon */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <GlassCard className="p-4.5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Enrolled Fleet</span>
            <Smartphone className="size-4.5 text-primary" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-foreground">
            {devices.length}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Provisioned Device Owner agents
          </div>
        </GlassCard>

        <GlassCard className="p-4.5" glow="emerald">
          <div className="flex items-center justify-between text-emerald-600 dark:text-[#00DF81]">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Active & Unlocked
            </span>
            <ShieldCheck className="size-4.5" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-emerald-600 dark:text-[#00DF81]">
            {activeDevices.length}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Good standing telemetry check-ins
          </div>
        </GlassCard>

        <GlassCard className="p-4.5">
          <div className="flex items-center justify-between text-rose-500">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Knox Locked / Restricted
            </span>
            <Lock className="size-4.5" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-rose-500">
            {restrictedDevices.length}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Delinquent past-due lock applied
          </div>
        </GlassCard>
      </div>

      {/* Main Managed Devices Table Card */}
      <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-xs">
        {/* Controls Bar: Search & Status Filter */}
        <div className="flex flex-col gap-4 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between bg-muted/20">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by IMEI, Device ID, or Contract..."
              className="h-9 rounded-xl pl-9 text-xs"
            />
          </div>

          <div className="flex items-center gap-1 rounded-xl border border-border bg-muted/40 p-1 overflow-x-auto no-scrollbar max-w-full">
            {statusFilters.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={cn(
                  "rounded-lg px-3 py-1 text-xs font-medium capitalize transition-all",
                  filter === value
                    ? "bg-card text-foreground font-semibold shadow-xs border border-border/80"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {value}
                {value === "restricted" && restrictedDevices.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-rose-500/20 px-1.5 py-0.2 font-mono text-[10px] text-rose-600 dark:text-rose-400 font-bold">
                    {restrictedDevices.length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Content Table */}
        {query.isLoading ? (
          <div className="p-8">
            <LoadingState label="Loading devices..." />
          </div>
        ) : query.isError ? (
          <div className="p-6">
            <ErrorState error={query.error} retry={() => void query.refetch()} />
          </div>
        ) : filteredDevices.length === 0 ? (
          <div className="p-8">
            <EmptyState label="No financed devices match this filter." />
          </div>
        ) : (
          <div className="no-scrollbar overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm text-left">
              <thead>
                <tr className="border-b border-border bg-muted/20 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-3.5">Device & IMEI</th>
                  <th className="px-5 py-3.5">Financing Contract</th>
                  <th className="px-5 py-3.5">Management Agent</th>
                  <th className="px-5 py-3.5">Last Check-in</th>
                  <th className="px-5 py-3.5">Lock State</th>
                  <th className="px-5 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {filteredDevices.map((device) => (
                  <tr
                    key={device.id}
                    onClick={() => navigate(`/devices/${device.id}`)}
                    className="group cursor-pointer transition-colors hover:bg-accent/40"
                  >
                    {/* Device & IMEI */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                          <Smartphone className="size-4.5" />
                        </div>
                        <div>
                          <div className="font-semibold text-xs text-foreground group-hover:text-primary transition-colors">
                            {device.providerDeviceId}
                          </div>
                          <div className="font-mono text-[11px] text-muted-foreground">
                            IMEI: {device.imei}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Contract ID */}
                    <td className="px-5 py-3.5 font-mono text-xs text-muted-foreground">
                      {device.contractId.slice(0, 12)}
                    </td>

                    {/* Management Agent */}
                    <td className="px-5 py-3.5 text-xs text-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Shield className="size-3.5 text-primary" />
                        {device.provider === "first_party_dpc"
                          ? "First-party Device Owner"
                          : device.provider}
                      </span>
                    </td>

                    {/* Last seen */}
                    <td className="px-5 py-3.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="size-3" /> {dateTime(device.lastSeenAt)}
                      </span>
                    </td>

                    {/* Lock State */}
                    <td className="px-5 py-3.5">
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
                          <Lock className="size-3 mr-1" />
                        ) : (
                          <ShieldCheck className="size-3 mr-1" />
                        )}
                        {device.status}
                      </StatusBadge>
                    </td>

                    {/* Action Arrow */}
                    <td className="px-5 py-3.5 text-right">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                        Manage <ArrowRight className="size-3.5" />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Enrollment QR Modal */}
      <Dialog open={open} onOpenChange={(value) => void changeDialog(value)}>
        <DialogContent className="rounded-3xl border-border bg-popover max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-foreground">
              Enroll an Activated Phone
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Provision first-party Device Owner Knox agent. The phone must be factory-reset and connected to Wi-Fi.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="enrollment-contract" className="text-xs font-medium">Activated contract</Label>
              <Select
                value={contractId}
                onValueChange={(value) => {
                  setContractId(value);
                  setIntent(undefined);
                  setProvisioningQr(undefined);
                }}
              >
                <SelectTrigger id="enrollment-contract" className="mt-1.5 h-10 rounded-xl">
                  <SelectValue placeholder="Select contract and financed IMEI" />
                </SelectTrigger>
                <SelectContent>
                  {eligible.map((contract) => (
                    <SelectItem key={contract.id} value={contract.id}>
                      {contract.device.brand} {contract.device.model} - {contract.device.imei}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!contracts.isPending && eligible.length === 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Every eligible activated contract already has an enrolled device agent.
                </p>
              )}
            </div>

            {selected !== undefined && selectedUnit === undefined && !units.isPending && (
              <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
                The financed inventory unit linked to this contract could not be found. Correct stock assignment before enrollment.
              </div>
            )}

            {selectedUnit !== undefined && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-300 space-y-1">
                <div className="font-semibold flex items-center gap-1">
                  <AlertCircle className="size-3.5" /> Provisioning Instructions
                </div>
                <p>
                  Reset the phone, tap the welcome screen six times, connect to Wi-Fi, and scan the QR code to install the Device Owner agent.
                </p>
              </div>
            )}

            {provisioningQr !== undefined && intent !== undefined && (
              <div className="rounded-2xl border border-emerald-500/20 bg-white p-4 text-center text-slate-950 shadow-inner">
                <img
                  src={provisioningQr}
                  alt="First-party Android Device Owner provisioning QR code"
                  className="mx-auto size-60 max-w-full rounded-xl"
                />
                <p className="mt-2 font-mono text-[11px] text-slate-600">
                  Valid until {dateTime(intent.expiresAt)}
                </p>
              </div>
            )}

            {enrollment.data?.status === "pending_enrollment" && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-300">
                Waiting for Device Owner provisioning and the first authenticated check-in...
              </div>
            )}

            {enrollment.data?.status === "active" && enrollment.data.deviceOwnerAttested && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-600 dark:text-[#00DF81]">
                Enrollment verified. This phone is now secured by the first-party Knox agent.
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => void changeDialog(false)} className="rounded-xl text-xs">
              {enrollment.data?.status === "active" ? "Done" : "Cancel"}
            </Button>
            {contractId !== "" && (
              <Button
                variant="outline"
                size="sm"
                busy={enrollment.isFetching}
                onClick={() => void enrollment.refetch()}
                className="rounded-xl text-xs gap-1.5"
              >
                <RefreshCw className="size-3.5" /> Refresh status
              </Button>
            )}
            {enrollment.data?.status !== "active" && (
              <Button
                size="sm"
                disabled={selectedUnit === undefined}
                busy={enroll.isPending}
                onClick={() => enroll.mutate()}
                className="rounded-xl bg-[#00DF81] text-black font-bold hover:bg-[#00DF81]/90 shadow-md shadow-emerald-500/20 text-xs gap-1.5"
              >
                <QrCode className="size-3.5" />
                {enrollment.data === null ? "Create enrollment QR" : "Regenerate QR"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

