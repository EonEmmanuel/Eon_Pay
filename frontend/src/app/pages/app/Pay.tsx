import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Smartphone } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { ErrorState, LoadingState } from "../../components/common/AsyncState";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { apiRequest, idempotencyKey } from "../../lib/api";
import { money } from "../../lib/format";

interface Contract {
  id: string;
  status: string;
  currency: "XAF";
  device: { brand: string; model: string };
}

interface Payment {
  id: string;
  status: string;
  externalReference: string;
}

export function Pay() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [contractId, setContractId] = useState("");
  const [amount, setAmount] = useState("");
  const [channel, setChannel] = useState<"mtn_momo" | "orange_money">("mtn_momo");
  const [created, setCreated] = useState<Payment>();
  const contracts = useQuery({
    queryKey: ["my-contracts"],
    queryFn: () => apiRequest<Contract[]>("/me/contracts"),
  });
  const mutation = useMutation({
    mutationFn: () =>
      apiRequest<Payment>("/me/payments", {
        method: "POST",
        headers: { "idempotency-key": idempotencyKey("customer-payment") },
        body: JSON.stringify({
          contractId,
          amountMinorUnits: Number(amount),
          channel,
        }),
      }),
    onSuccess: async (payment) => {
      setCreated(payment);
      await queryClient.invalidateQueries({ queryKey: ["my-payments"] });
    },
  });

  if (contracts.isLoading) {
    return <LoadingState label="Loading your contracts…" />;
  }
  if (contracts.isError) {
    return (
      <ErrorState error={contracts.error} retry={() => void contracts.refetch()} />
    );
  }
  if (created !== undefined) {
    return (
      <section className="py-10 text-center" aria-live="polite">
        <CheckCircle2 className="mx-auto size-14 text-primary" aria-hidden="true" />
        <h1 className="mt-4 text-xl">Payment request created</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Reference {created.externalReference}. The payment will settle only after the
          provider’s signed confirmation.
        </p>
        <Button className="mt-6" onClick={() => navigate("/customer")}>
          Return home
        </Button>
      </section>
    );
  }

  return (
    <section>
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2"
        onClick={() => navigate("/customer")}
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> Back
      </Button>
      <h1 className="mt-3 text-xl">Pay an installment</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Payment requests are idempotent and verified by provider webhook.
      </p>

      <div className="mt-6 space-y-5">
        <div>
          <Label htmlFor="customer-contract">Contract</Label>
          <Select value={contractId} onValueChange={setContractId}>
            <SelectTrigger id="customer-contract">
              <SelectValue placeholder="Select contract" />
            </SelectTrigger>
            <SelectContent>
              {(contracts.data ?? [])
                .filter((contract) =>
                  ["active", "past_due", "suspended"].includes(contract.status),
                )
                .map((contract) => (
                  <SelectItem key={contract.id} value={contract.id}>
                    {contract.device.brand} {contract.device.model}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="customer-payment-amount">Amount (XAF)</Label>
          <Input
            id="customer-payment-amount"
            inputMode="numeric"
            type="number"
            min="1"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
          {Number(amount) > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              You will authorize {money(Number(amount))}.
            </p>
          )}
        </div>
        <fieldset>
          <legend className="text-sm font-medium">Mobile-money provider</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(["mtn_momo", "orange_money"] as const).map((provider) => (
              <button
                key={provider}
                type="button"
                aria-pressed={channel === provider}
                onClick={() => setChannel(provider)}
                className={`rounded-xl border p-4 text-sm ${
                  channel === provider
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-white/10 bg-white/[0.03]"
                }`}
              >
                <Smartphone className="mx-auto mb-2 size-5" aria-hidden="true" />
                {provider === "mtn_momo" ? "MTN MoMo" : "Orange Money"}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
      {mutation.isError && (
        <p className="mt-4 text-sm text-destructive" role="alert">
          {mutation.error.message}
        </p>
      )}
      <Button
        className="mt-6 w-full"
        disabled={
          mutation.isPending ||
          contractId === "" ||
          !Number.isSafeInteger(Number(amount)) ||
          Number(amount) <= 0
        }
        busy={mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? "Creating request…" : "Continue securely"}
      </Button>
    </section>
  );
}
