import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState, LoadingState } from "../components/common/AsyncState";
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
import { apiRequest, idempotencyKey } from "../lib/api";
import { useAuth } from "../lib/auth";
import { dateTime, money } from "../lib/format";

interface Payment {
  id: string;
  customerId: string;
  contractId: string | null;
  amount: number;
  channel: string;
  status: "initiated" | "pending" | "settled" | "failed" | "cancelled" | "reversed";
  externalReference: string | null;
  createdAt: string;
}

interface Installment {
  id: string;
  sequence: number;
  principalDue: number;
  financeChargeDue: number;
  principalPaid: number;
  financeChargePaid: number;
}

interface Customer {
  id: string;
  fullName: string;
}

interface Contract {
  id: string;
  customerId: string;
  status: string;
}

function buildAllocations(amount: number, contractId: string, schedule: Installment[]) {
  let remaining = amount;
  const allocations: Array<Record<string, string | number>> = [];
  if (contractId !== "") {
    for (const installment of [...schedule].sort(
      (left, right) => left.sequence - right.sequence,
    )) {
      const financeOutstanding = Math.max(
        Number(installment.financeChargeDue) - Number(installment.financeChargePaid),
        0,
      );
      const financeAmount = Math.min(remaining, financeOutstanding);
      if (financeAmount > 0) {
        allocations.push({
          targetType: "installment_finance_charge",
          contractId,
          installmentId: installment.id,
          amountMinorUnits: financeAmount,
        });
        remaining -= financeAmount;
      }
      const principalOutstanding = Math.max(
        Number(installment.principalDue) - Number(installment.principalPaid),
        0,
      );
      const principalAmount = Math.min(remaining, principalOutstanding);
      if (principalAmount > 0) {
        allocations.push({
          targetType: "installment_principal",
          contractId,
          installmentId: installment.id,
          amountMinorUnits: principalAmount,
        });
        remaining -= principalAmount;
      }
      if (remaining === 0) break;
    }
  }
  if (remaining > 0) {
    allocations.push({
      targetType: "unapplied_credit",
      ...(contractId === "" ? {} : { contractId }),
      amountMinorUnits: remaining,
    });
  }
  return allocations;
}

function tone(status: Payment["status"]) {
  if (status === "settled") return "success" as const;
  if (status === "failed" || status === "cancelled" || status === "reversed") {
    return "danger" as const;
  }
  return "warning" as const;
}

export function Payments() {
  const queryClient = useQueryClient();
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<Payment>();
  const [customerId, setCustomerId] = useState("");
  const [contractId, setContractId] = useState("");
  const [amount, setAmount] = useState("");
  const [channel, setChannel] = useState<"cash" | "mtn_momo" | "orange_money">("cash");
  const [externalReference, setExternalReference] = useState("");
  const payments = useQuery({
    queryKey: ["payments"],
    queryFn: () => apiRequest<Payment[]>("/payments"),
  });
  const customers = useQuery({
    queryKey: ["customers"],
    queryFn: () => apiRequest<Customer[]>("/customers"),
  });
  const contracts = useQuery({
    queryKey: ["contracts"],
    queryFn: () => apiRequest<Contract[]>("/contracts"),
  });
  const schedule = useQuery({
    queryKey: ["contract-installments", contractId],
    enabled: contractId !== "",
    queryFn: () => apiRequest<Installment[]>(`/contracts/${contractId}/installments`),
  });
  const mutation = useMutation({
    mutationFn: async () => {
      const amountMinorUnits = Number(amount);
      const createKey = idempotencyKey("payment-create");
      const payment = await apiRequest<Payment>("/payments", {
        method: "POST",
        headers: { "idempotency-key": createKey },
        body: JSON.stringify({
          customerId,
          contractId: contractId || undefined,
          amountMinorUnits,
          channel,
          ...(channel === "cash"
            ? {}
            : {
                provider: channel,
                externalReference,
              }),
        }),
      });
      if (channel === "cash") {
        return apiRequest<Payment>(`/payments/${payment.id}/settle`, {
          method: "POST",
          headers: { "idempotency-key": idempotencyKey("payment-settle") },
          body: JSON.stringify({
            allocations: buildAllocations(
              amountMinorUnits,
              contractId,
              schedule.data ?? [],
            ),
          }),
        });
      }
      return payment;
    },
    onSuccess: async () => {
      toast.success(
        channel === "cash"
          ? "Cash payment settled"
          : "Payment created; awaiting signed provider webhook",
      );
      setOpen(false);
      setAmount("");
      setExternalReference("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["payments"] }),
        queryClient.invalidateQueries({ queryKey: ["contract-installments"] }),
        queryClient.invalidateQueries({ queryKey: ["tenant-analytics"] }),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });
  const customerById = new Map(
    (customers.data ?? []).map((customer) => [customer.id, customer.fullName]),
  );
  const availableContracts = (contracts.data ?? []).filter(
    (contract) =>
      contract.customerId === customerId &&
      ["active", "past_due", "suspended"].includes(contract.status),
  );

  return (
    <>
      <PageHeader
        title="Payments & Ledger"
        subtitle="Record idempotent payments and monitor provider settlement"
        breadcrumb={["Finance", "Payments"]}
        actions={
          auth.tenantPermissions.includes("payments.record") ? (
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" aria-hidden="true" /> Record payment
            </Button>
          ) : undefined
        }
      />

      <section className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03]">
        <h2 className="border-b border-white/8 p-4 text-base">Payment transactions</h2>
        {payments.isLoading ? (
          <LoadingState label="Loading payments…" />
        ) : payments.isError ? (
          <div className="p-4">
            <ErrorState error={payments.error} retry={() => void payments.refetch()} />
          </div>
        ) : payments.data?.length === 0 ? (
          <EmptyState label="No payments have been recorded." />
        ) : (
          <div className="scroll-slim overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-white/8 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3">Transaction</th>
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Channel</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/6">
                {(payments.data ?? []).map((payment) => (
                  <tr key={payment.id}>
                    <td className="px-5 py-3">
                      <button
                        className="font-mono text-xs hover:text-primary focus-visible:ring-2 focus-visible:ring-primary"
                        onClick={() => setDetail(payment)}
                      >
                        {payment.id.slice(0, 12)}
                      </button>
                      <div className="text-xs text-muted-foreground">
                        {dateTime(payment.createdAt)}
                      </div>
                    </td>
                    <td className="px-5 py-3 font-medium">
                      {customerById.get(payment.customerId) ??
                        payment.customerId.slice(0, 8)}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {payment.channel.replaceAll("_", " ")}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge tone={tone(payment.status)}>
                        {payment.status}
                      </StatusBadge>
                    </td>
                    <td className="px-5 py-3 text-right font-mono">
                      {money(payment.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record payment</DialogTitle>
            <DialogDescription>
              Cash is allocated automatically to the oldest outstanding finance charge
              and principal. Any excess becomes customer credit. Mobile money waits for
              the verified provider callback.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="payment-customer">Customer</Label>
              <Select
                value={customerId}
                onValueChange={(value) => {
                  setCustomerId(value);
                  setContractId("");
                }}
              >
                <SelectTrigger id="payment-customer">
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {(customers.data ?? []).map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="payment-contract">Contract</Label>
              <Select value={contractId} onValueChange={setContractId}>
                <SelectTrigger id="payment-contract">
                  <SelectValue placeholder="Select active contract" />
                </SelectTrigger>
                <SelectContent>
                  {availableContracts.map((contract) => (
                    <SelectItem key={contract.id} value={contract.id}>
                      {contract.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="payment-amount">Amount (XAF)</Label>
              <Input
                id="payment-amount"
                type="number"
                min="1"
                required
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="payment-channel">Channel</Label>
              <Select
                value={channel}
                onValueChange={(value) => setChannel(value as typeof channel)}
              >
                <SelectTrigger id="payment-channel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="mtn_momo">MTN MoMo</SelectItem>
                  <SelectItem value="orange_money">Orange Money</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {channel !== "cash" && (
              <div>
                <Label htmlFor="external-reference">Provider external reference</Label>
                <Input
                  id="external-reference"
                  required
                  value={externalReference}
                  onChange={(event) => setExternalReference(event.target.value)}
                />
              </div>
            )}
          </div>
          {mutation.isError && (
            <p className="text-sm text-destructive" role="alert">
              {mutation.error.message}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => mutation.mutate()}
              disabled={
                mutation.isPending ||
                customerId === "" ||
                amount === "" ||
                (channel !== "cash" && externalReference === "")
              }
              busy={mutation.isPending}
            >
              {mutation.isPending ? "Recording…" : "Record"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={detail !== undefined}
        onOpenChange={(value) => !value && setDetail(undefined)}
      >
        <DialogContent>
          {detail !== undefined && (
            <>
              <DialogHeader>
                <DialogTitle>Payment {detail.id}</DialogTitle>
                <DialogDescription>{dateTime(detail.createdAt)}</DialogDescription>
              </DialogHeader>
              <dl className="space-y-3 text-sm">
                <Row label="Status" value={detail.status} />
                <Row label="Channel" value={detail.channel} />
                <Row label="Amount" value={money(detail.amount)} />
                <Row
                  label="External reference"
                  value={detail.externalReference ?? "Not applicable"}
                />
              </dl>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
