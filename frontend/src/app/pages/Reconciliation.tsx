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
import { Textarea } from "../components/ui/textarea";
import { apiRequest, idempotencyKey } from "../lib/api";
import { dateTime, money } from "../lib/format";

interface Run {
  id: string;
  provider: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  matchedItems: number;
  exceptionItems: number;
  createdAt: string;
}

interface RunDetail extends Run {
  items: Array<{
    id: string;
    externalReference: string;
    internalAmount: number | null;
    providerAmount: number | null;
    internalStatus: string | null;
    providerStatus: string;
    status: string;
  }>;
}

export function Reconciliation() {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const [provider, setProvider] = useState("mtn_momo");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [statement, setStatement] = useState("");
  const runs = useQuery({
    queryKey: ["reconciliation-runs"],
    queryFn: () => apiRequest<Run[]>("/reconciliation/runs"),
  });
  const detail = useQuery({
    queryKey: ["reconciliation-run", selectedId],
    enabled: selectedId !== undefined,
    queryFn: () => apiRequest<RunDetail>(`/reconciliation/runs/${selectedId}`),
  });
  const mutation = useMutation({
    mutationFn: () => {
      const items = statement
        .split(/\r?\n/)
        .map((row) => row.trim())
        .filter(Boolean)
        .map((row, index) => {
          const [externalReference, amount, status] = row
            .split(",")
            .map((value) => value.trim());
          if (!externalReference || !amount || !status)
            throw new Error(
              `Statement row ${index + 1} must contain reference, amount, status.`,
            );
          return { externalReference, amountMinorUnits: Number(amount), status };
        });
      if (items.length === 0) throw new Error("Add at least one statement row.");
      return apiRequest("/reconciliation/runs", {
        method: "POST",
        headers: { "idempotency-key": idempotencyKey("reconciliation") },
        body: JSON.stringify({
          provider,
          periodStart: new Date(periodStart).toISOString(),
          periodEnd: new Date(periodEnd).toISOString(),
          items,
        }),
      });
    },
    onSuccess: async () => {
      toast.success("Reconciliation run completed");
      setOpen(false);
      setStatement("");
      await client.invalidateQueries({ queryKey: ["reconciliation-runs"] });
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <>
      <PageHeader
        title="Payment Reconciliation"
        subtitle="Compare provider statements with idempotent payment records and surface exceptions"
        breadcrumb={["Finance", "Reconciliation"]}
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" /> Import statement
          </Button>
        }
      />
      <section className="overflow-hidden rounded-2xl border border-border bg-muted/50">
        {runs.isPending ? (
          <LoadingState label="Loading reconciliation runs..." />
        ) : runs.isError ? (
          <ErrorState error={runs.error} retry={() => void runs.refetch()} />
        ) : runs.data?.length === 0 ? (
          <EmptyState label="No provider statements have been reconciled." />
        ) : (
          <div className="scroll-slim overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="px-5 py-3">Provider / period</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Matched</th>
                  <th className="px-5 py-3 text-right">Exceptions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(runs.data ?? []).map((run) => (
                  <tr
                    key={run.id}
                    className="cursor-pointer hover:bg-accent/60"
                    onClick={() => setSelectedId(run.id)}
                  >
                    <td className="px-5 py-3">
                      <div className="font-medium">
                        {run.provider.replaceAll("_", " ")}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {dateTime(run.periodStart)} - {dateTime(run.periodEnd)}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge
                        tone={run.exceptionItems > 0 ? "warning" : "success"}
                      >
                        {run.status.replaceAll("_", " ")}
                      </StatusBadge>
                    </td>
                    <td className="px-5 py-3 text-right font-mono">
                      {run.matchedItems}
                    </td>
                    <td className="px-5 py-3 text-right font-mono">
                      {run.exceptionItems}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <Dialog
        open={selectedId !== undefined}
        onOpenChange={(value) => !value && setSelectedId(undefined)}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Reconciliation exceptions</DialogTitle>
            <DialogDescription>
              Matched provider rows and the exceptions requiring finance review.
            </DialogDescription>
          </DialogHeader>
          {detail.isPending ? (
            <LoadingState label="Loading reconciliation details..." />
          ) : detail.isError ? (
            <ErrorState error={detail.error} retry={() => void detail.refetch()} />
          ) : (
            <div className="max-h-[55vh] overflow-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2">Reference</th>
                    <th>Status</th>
                    <th className="text-right">Internal</th>
                    <th className="text-right">Provider</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(detail.data?.items ?? []).map((item) => (
                    <tr key={item.id}>
                      <td className="py-3 font-mono text-xs">
                        {item.externalReference}
                      </td>
                      <td>
                        <StatusBadge
                          tone={item.status === "matched" ? "success" : "warning"}
                        >
                          {item.status.replaceAll("_", " ")}
                        </StatusBadge>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {item.internalStatus ?? "missing"} / {item.providerStatus}
                        </div>
                      </td>
                      <td className="text-right font-mono">
                        {item.internalAmount === null
                          ? "-"
                          : money(item.internalAmount)}
                      </td>
                      <td className="text-right font-mono">
                        {item.providerAmount === null
                          ? "-"
                          : money(item.providerAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import provider statement</DialogTitle>
            <DialogDescription>
              Paste one transaction per line as reference, amount in XAF, status.
              Example: MOMO-123, 25000, settled
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label htmlFor="reconciliation-provider">Provider</Label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger id="reconciliation-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mtn_momo">MTN MoMo</SelectItem>
                  <SelectItem value="orange_money">Orange Money</SelectItem>
                  <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="period-start">Period start</Label>
              <Input
                id="period-start"
                type="datetime-local"
                required
                value={periodStart}
                onChange={(event) => setPeriodStart(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="period-end">Period end</Label>
              <Input
                id="period-end"
                type="datetime-local"
                required
                value={periodEnd}
                onChange={(event) => setPeriodEnd(event.target.value)}
              />
            </div>
            <div className="col-span-2">
              <Label htmlFor="statement">Statement rows</Label>
              <Textarea
                id="statement"
                className="min-h-36 font-mono text-xs"
                value={statement}
                onChange={(event) => setStatement(event.target.value)}
                placeholder="MOMO-123, 25000, settled"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!periodStart || !periodEnd || !statement.trim()}
              busy={mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              Run reconciliation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
