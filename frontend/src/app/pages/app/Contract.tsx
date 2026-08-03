import { useQuery } from "@tanstack/react-query";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../components/common/AsyncState";
import { StatusBadge } from "../../components/common/StatusBadge";
import { apiRequest } from "../../lib/api";
import { money } from "../../lib/format";

interface Contract {
  id: string;
  status: string;
  device: { brand: string; model: string };
  deviceCashPrice: number;
  downPayment: number;
  financedPrincipal: number;
  financeCharge: number;
  installmentCount: number;
  repaymentFrequency: string;
}

interface Installment {
  id: string;
  sequence: number;
  dueDate: string;
  principalDue: number;
  financeChargeDue: number;
}

export function Contract() {
  const contracts = useQuery({
    queryKey: ["my-contracts"],
    queryFn: () => apiRequest<Contract[]>("/me/contracts"),
  });
  const contract = contracts.data?.[0];
  const schedule = useQuery({
    queryKey: ["my-schedule", contract?.id],
    enabled: contract !== undefined,
    queryFn: () =>
      apiRequest<Installment[]>(`/me/contracts/${contract?.id ?? ""}/installments`),
  });
  if (contracts.isLoading || schedule.isLoading) {
    return <LoadingState label="Loading your contract…" />;
  }
  if (contracts.isError || schedule.isError) {
    return (
      <ErrorState
        error={contracts.error ?? schedule.error}
        retry={() => {
          void contracts.refetch();
          void schedule.refetch();
        }}
      />
    );
  }
  if (contract === undefined) {
    return <EmptyState label="No financing contract was found." />;
  }
  return (
    <section>
      <div className="flex items-center justify-between">
        <h1 className="text-xl">Contract</h1>
        <StatusBadge tone={contract.status === "active" ? "success" : "warning"}>
          {contract.status}
        </StatusBadge>
      </div>
      <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
        <h2 className="font-medium">
          {contract.device.brand} {contract.device.model}
        </h2>
        <dl className="mt-4 space-y-3 text-sm">
          <Row label="Cash price" value={money(contract.deviceCashPrice)} />
          <Row label="Down payment" value={money(contract.downPayment)} />
          <Row label="Financed principal" value={money(contract.financedPrincipal)} />
          <Row label="Finance charge" value={money(contract.financeCharge)} />
          <Row
            label="Plan"
            value={`${contract.installmentCount} ${contract.repaymentFrequency}`}
          />
        </dl>
      </div>
      <h2 className="mt-6 text-base">Installment schedule</h2>
      <ol className="mt-3 space-y-2">
        {(schedule.data ?? []).map((installment) => (
          <li
            key={installment.id}
            className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.03] p-3 text-sm"
          >
            <div>
              <span className="font-medium">#{installment.sequence}</span>
              <span className="ml-2 text-muted-foreground">{installment.dueDate}</span>
            </div>
            <span className="font-mono">
              {money(installment.principalDue + installment.financeChargeDue)}
            </span>
          </li>
        ))}
      </ol>
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
