import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, Play, Printer, QrCode, RefreshCw } from "lucide-react";
import QRCode from "qrcode";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { EmptyState, ErrorState, LoadingState } from "../components/common/AsyncState";
import { GlassCard } from "../components/common/GlassCard";
import { ProgressMeter } from "../components/common/ProgressMeter";
import { SectionCard } from "../components/common/SectionCard";
import { StatusBadge, type StatusTone } from "../components/common/StatusBadge";
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
import {
  getTenantAnalytics,
  tenantAnalyticsQueryKey,
  type AnalyticsInstallment,
} from "../lib/analytics";
import { apiRequest } from "../lib/api";
import { useAuth } from "../lib/auth";
import { dateTime, money } from "../lib/format";
import {
  getInventoryUnits,
  inventoryProductsKey,
  inventoryUnitsKey,
} from "../lib/inventory";

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
  enrollmentToken: string;
  expiresAt: string;
  provisioningPayload: Record<string, unknown>;
}

export function ContractDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const client = useQueryClient();
  const [activateOpen, setActivateOpen] = useState(false);
  const [inventoryUnitId, setInventoryUnitId] = useState("");
  const [enrollmentIntent, setEnrollmentIntent] = useState<EnrollmentIntent>();
  const [provisioningQr, setProvisioningQr] = useState<string>();
  const query = useQuery({
    queryKey: tenantAnalyticsQueryKey,
    queryFn: getTenantAnalytics,
  });
  const contract = query.data?.contracts.find((row) => row.id === id);
  const units = useQuery({
    queryKey: inventoryUnitsKey,
    queryFn: () => getInventoryUnits(),
  });
  const enrollment = useQuery({
    queryKey: ["device-enrollment", id],
    enabled: id !== undefined && auth.tenantPermissions.includes("devices.read"),
    queryFn: () =>
      apiRequest<EnrollmentState | null>(`/device-enrollments/contracts/${id ?? ""}`),
  });
  const selectedInventoryUnitId =
    inventoryUnitId || enrollment.data?.inventoryUnitId || "";
  const schedule = (query.data?.installments ?? [])
    .filter((row) => row.contractId === id)
    .sort((left, right) => left.sequence - right.sequence);

  const activate = useMutation({
    mutationFn: () =>
      apiRequest(`/contracts/${id}/activate`, {
        method: "POST",
        body: JSON.stringify({ inventoryUnitId: selectedInventoryUnitId }),
      }),
    onSuccess: async () => {
      toast.success("Contract activated and stock unit assigned");
      setActivateOpen(false);
      await Promise.all([
        client.invalidateQueries({ queryKey: tenantAnalyticsQueryKey }),
        client.invalidateQueries({ queryKey: inventoryUnitsKey }),
        client.invalidateQueries({ queryKey: inventoryProductsKey }),
        client.invalidateQueries({ queryKey: ["device-enrollment", id] }),
        client.invalidateQueries({ queryKey: ["devices"] }),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });
  const prepareEnrollment = useMutation({
    mutationFn: () =>
      apiRequest<EnrollmentIntent>("/device-enrollments", {
        method: "POST",
        body: JSON.stringify({
          contractId: id,
          inventoryUnitId: selectedInventoryUnitId,
        }),
      }),
    onSuccess: async (intent) => {
      setEnrollmentIntent(intent);
      setProvisioningQr(
        await QRCode.toDataURL(JSON.stringify(intent.provisioningPayload), {
          width: 320,
          margin: 2,
          errorCorrectionLevel: "M",
        }),
      );
      toast.success("One-time Device Owner enrollment QR created");
      await Promise.all([
        client.invalidateQueries({ queryKey: inventoryUnitsKey }),
        client.invalidateQueries({ queryKey: ["device-enrollment", id] }),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });
  const transition = useMutation({
    mutationFn: (status: string) =>
      apiRequest(`/contracts/${id}/transition`, {
        method: "POST",
        body: JSON.stringify({ status }),
      }),
    onSuccess: async () => {
      toast.success("Contract status updated");
      await client.invalidateQueries({ queryKey: tenantAnalyticsQueryKey });
    },
    onError: (error) => toast.error(error.message),
  });

  if (query.isPending) return <LoadingState label="Loading contract..." />;
  if (query.isError)
    return <ErrorState error={query.error} retry={() => void query.refetch()} />;
  if (contract === undefined)
    return (
      <EmptyState label="This contract does not exist or is not accessible in the current tenant." />
    );

  const matchingUnits = (units.data ?? []).filter(
    (unit) =>
      unit.branchId === contract.branchId &&
      unit.catalogProductId === contract.device.deviceId &&
      (unit.status === "available" || unit.id === enrollment.data?.inventoryUnitId),
  );
  const transitionOptions = transitionsFor(contract.status);

  const progress =
    contract.installmentCount === 0
      ? 0
      : (contract.paidInstallments / contract.installmentCount) * 100;

  function exportSchedule() {
    const rows: Array<Array<string | number>> = [
      [
        "sequence",
        "due_date",
        "principal_due",
        "finance_charge_due",
        "paid",
        "outstanding",
        "status",
      ],
      ...schedule.map((item) => [
        item.sequence,
        item.dueDate,
        item.principalDue,
        item.financeChargeDue,
        item.paidAmount,
        item.outstanding,
        item.status,
      ]),
    ];
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
    anchor.download = `contract-${id}-schedule.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="mb-3 -ml-2 text-muted-foreground"
        onClick={() => navigate("/contracts")}
      >
        <ArrowLeft className="size-4" /> Back to contracts
      </Button>
      <PageHeader
        title={`Contract ${contract.id}`}
        subtitle={`${contract.customerName} · ${contract.device.brand} ${contract.device.model}`}
        actions={
          <>
            {contract.status === "pending_signature" &&
              auth.tenantPermissions.includes("contracts.activate") && (
                <Button onClick={() => setActivateOpen(true)}>
                  <Play className="size-4" /> Activate
                </Button>
              )}
            {transitionOptions.length > 0 &&
              auth.tenantPermissions.includes("contracts.transition") && (
                <Select
                  onValueChange={(value) => transition.mutate(value)}
                  disabled={transition.isPending}
                >
                  <SelectTrigger className="w-[170px]">
                    <SelectValue placeholder="Change status" />
                  </SelectTrigger>
                  <SelectContent>
                    {transitionOptions.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status.replaceAll("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="size-4" /> Print
            </Button>
            <Button
              variant="outline"
              onClick={exportSchedule}
              disabled={schedule.length === 0}
            >
              <Download className="size-4" /> Schedule CSV
            </Button>
          </>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Metric label="Principal" value={money(contract.financedPrincipal)} />
        <Metric label="Finance charge" value={money(contract.financeCharge)} />
        <Metric label="Paid" value={money(contract.paidAmount)} highlight />
        <Metric label="Outstanding" value={money(contract.outstanding)} />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <SectionCard
          className="xl:col-span-2"
          title="Payment schedule"
          subtitle={`${contract.paidInstallments} of ${contract.installmentCount} installments settled`}
          bodyClassName="p-0"
        >
          {schedule.length === 0 ? (
            <EmptyState label="No installment schedule has been generated for this contract." />
          ) : (
            <div className="scroll-slim overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3">#</th>
                    <th className="px-5 py-3">Due date</th>
                    <th className="px-5 py-3 text-right">Due</th>
                    <th className="px-5 py-3 text-right">Paid</th>
                    <th className="px-5 py-3 text-right">Outstanding</th>
                    <th className="px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {schedule.map((item) => (
                    <tr key={item.id}>
                      <td className="px-5 py-3 font-mono">{item.sequence}</td>
                      <td className="px-5 py-3">{formatDate(item.dueDate)}</td>
                      <td className="px-5 py-3 text-right font-mono">
                        {money(item.principalDue + item.financeChargeDue)}
                      </td>
                      <td className="px-5 py-3 text-right font-mono">
                        {money(item.paidAmount)}
                      </td>
                      <td className="px-5 py-3 text-right font-mono">
                        {money(item.outstanding)}
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge tone={installmentTone(item.status)}>
                          {item.status}
                        </StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
        <div className="space-y-4">
          <GlassCard glow="emerald">
            <h3 className="mb-3">Completion</h3>
            <ProgressMeter
              value={progress}
              tone={contract.overdueInstallments > 0 ? "danger" : "emerald"}
              className="mb-3"
            />
            <p className="text-sm text-muted-foreground">
              {contract.installmentCount - contract.paidInstallments} installments
              remain.
            </p>
            <div className="mt-4 flex justify-between text-sm">
              <span className="text-muted-foreground">Status</span>
              <StatusBadge
                tone={
                  contract.overdueInstallments > 0
                    ? "danger"
                    : contract.status === "completed"
                      ? "success"
                      : "info"
                }
              >
                {contract.overdueInstallments > 0 ? "overdue" : contract.status}
              </StatusBadge>
            </div>
          </GlassCard>
          <SectionCard title="Terms">
            <dl className="space-y-3 text-sm">
              <Term label="Branch" value={contract.branchName} />
              <Term label="Cash price" value={money(contract.deviceCashPrice)} />
              <Term label="Down payment" value={money(contract.downPayment)} />
              <Term label="Frequency" value={contract.repaymentFrequency} />
              <Term label="First due" value={formatDate(contract.firstDueDate)} />
              <Term label="Activated" value={dateTime(contract.activatedAt)} />
            </dl>
          </SectionCard>
          <SectionCard title="Device">
            <dl className="space-y-3 text-sm">
              <Term
                label="Model"
                value={`${contract.device.brand} ${contract.device.model}`}
              />
              <Term
                label="Configuration"
                value={`${contract.device.storage} · ${contract.device.color}`}
              />
              <Term
                label="IMEI"
                value={contract.device.imei ?? enrollment.data?.imei ?? "Not recorded"}
              />
              <Term
                label="Enrollment"
                value={
                  enrollment.data === null || enrollment.data === undefined
                    ? "Not prepared"
                    : enrollment.data.status === "active" &&
                        enrollment.data.deviceOwnerAttested
                      ? "Device Owner verified"
                      : enrollment.data.status.replaceAll("_", " ")
                }
              />
              <Term
                label="Last check-in"
                value={dateTime(enrollment.data?.lastSeenAt)}
              />
            </dl>
          </SectionCard>
        </div>
      </div>
      <Dialog open={activateOpen} onOpenChange={setActivateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Activate signed contract</DialogTitle>
            <DialogDescription>
              Select the physical phone, enroll it as Android Device Owner, then
              activate only after the agent completes its first authenticated check-in.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="activation-stock-unit">Available stock unit</Label>
            <Select
              value={selectedInventoryUnitId}
              onValueChange={setInventoryUnitId}
              disabled={enrollment.data !== null && enrollment.data !== undefined}
            >
              <SelectTrigger id="activation-stock-unit">
                <SelectValue
                  placeholder={units.isPending ? "Loading stock..." : "Select IMEI"}
                />
              </SelectTrigger>
              <SelectContent>
                {matchingUnits.map((unit) => (
                  <SelectItem key={unit.id} value={unit.id}>
                    {unit.imei}
                    {unit.serialNumber ? ` - ${unit.serialNumber}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!units.isPending && matchingUnits.length === 0 && (
              <p className="mt-2 text-sm text-amber-300">
                No matching available unit exists at {contract.branchName}. Receive
                stock before activation.
              </p>
            )}
          </div>
          {enrollmentIntent !== undefined && provisioningQr !== undefined && (
            <div className="rounded-xl border border-primary/20 bg-white p-4 text-center text-slate-950">
              <img
                src={provisioningQr}
                alt="Android Device Owner provisioning QR code"
                className="mx-auto size-64 max-w-full"
              />
              <p className="mt-2 text-xs">
                Valid until {dateTime(enrollmentIntent.expiresAt)}. This token is
                displayed only once.
              </p>
            </div>
          )}
          {enrollment.data?.status === "pending_enrollment" && (
            <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-sm text-amber-200">
              Waiting for Device Owner provisioning and the first authenticated agent
              check-in.
            </div>
          )}
          {enrollment.data?.status === "active" &&
            enrollment.data.deviceOwnerAttested && (
              <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3 text-sm text-emerald-200">
                Enrollment verified. The contract is ready for activation.
              </div>
            )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setActivateOpen(false)}>
              Cancel
            </Button>
            {enrollment.data?.status !== "active" ||
            !enrollment.data.deviceOwnerAttested ? (
              <>
                <Button
                  variant="outline"
                  busy={enrollment.isFetching}
                  onClick={() => enrollment.refetch()}
                >
                  <RefreshCw className="size-4" /> Refresh status
                </Button>
                <Button
                  disabled={!selectedInventoryUnitId}
                  busy={prepareEnrollment.isPending}
                  onClick={() => prepareEnrollment.mutate()}
                >
                  <QrCode className="size-4" />
                  {enrollment.data === null ? "Create enrollment QR" : "Regenerate QR"}
                </Button>
              </>
            ) : (
              <Button
                disabled={!selectedInventoryUnitId}
                busy={activate.isPending}
                onClick={() => activate.mutate()}
              >
                Confirm activation
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function transitionsFor(status: string): string[] {
  const transitions: Record<string, string[]> = {
    active: ["past_due", "suspended", "completed", "terminated", "written_off"],
    past_due: ["active", "suspended", "completed", "terminated", "written_off"],
    suspended: ["active", "past_due", "terminated", "written_off"],
  };
  return transitions[status] ?? [];
}

function Metric({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <GlassCard className="p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={`mt-1 font-mono text-xl font-semibold ${highlight ? "text-primary" : ""}`}
      >
        {value}
      </div>
    </GlassCard>
  );
}
function Term({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-CM", { dateStyle: "medium" }).format(
    new Date(`${value}T00:00:00Z`),
  );
}
function installmentTone(status: AnalyticsInstallment["status"]): StatusTone {
  if (status === "paid") return "success";
  if (status === "overdue") return "danger";
  if (status === "due") return "warning";
  return "neutral";
}
