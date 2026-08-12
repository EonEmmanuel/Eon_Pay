import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Smartphone } from "lucide-react";
import { useNavigate } from "react-router";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../components/common/AsyncState";
import { StatusBadge } from "../../components/common/StatusBadge";
import { Button } from "../../components/ui/button";
import { apiRequest } from "../../lib/api";
import { dateTime, money } from "../../lib/format";

interface Contract {
  id: string;
  status: string;
  device: { brand: string; model: string };
  financedPrincipal: number;
  financeCharge: number;
  firstDueDate: string;
}

interface Payment {
  id: string;
  amount: number;
  status: string;
  createdAt: string;
}

interface Application {
  id: string;
  status: string;
  kycStatus: string;
  device: { brand: string; model: string };
  createdAt: string;
}

export function Home() {
  const navigate = useNavigate();
  const contracts = useQuery({
    queryKey: ["my-contracts"],
    queryFn: () => apiRequest<Contract[]>("/me/contracts"),
  });
  const payments = useQuery({
    queryKey: ["my-payments"],
    queryFn: () => apiRequest<Payment[]>("/me/payments"),
  });
  const applications = useQuery({
    queryKey: ["my-applications"],
    queryFn: () => apiRequest<Application[]>("/me/applications"),
  });
  if (contracts.isLoading || payments.isLoading || applications.isLoading) {
    return <LoadingState label="Loading your financing account…" />;
  }
  if (contracts.isError || payments.isError || applications.isError) {
    return (
      <ErrorState
        error={contracts.error ?? payments.error ?? applications.error}
        retry={() => {
          void contracts.refetch();
          void payments.refetch();
          void applications.refetch();
        }}
      />
    );
  }
  const contract = contracts.data?.[0];
  if (contract === undefined) {
    const application = applications.data?.[0];
    if (application === undefined) {
      return <EmptyState label="You do not have a financing application yet." />;
    }
    const verification = customerKycStatus(application.kycStatus);
    return (
      <section>
        <p className="text-sm text-muted-foreground">Your application</p>
        <h1 className="mt-1 text-xl">
          {application.device.brand} {application.device.model}
        </h1>
        <div className="mt-5 rounded-2xl border border-primary/20 bg-primary/5 p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">Identity verification</span>
            <StatusBadge tone={verification.tone}>{verification.label}</StatusBadge>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            {verification.description}
          </p>
          <div className="mt-4 flex items-center justify-between border-t border-border pt-4 text-sm">
            <span className="text-muted-foreground">Application status</span>
            <span>{customerApplicationStatus(application.status)}</span>
          </div>
        </div>
      </section>
    );
  }
  const settled = (payments.data ?? [])
    .filter((payment) => payment.status === "settled")
    .reduce((sum, payment) => sum + payment.amount, 0);
  const total = contract.financedPrincipal + contract.financeCharge;
  return (
    <section>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Your financing plan</p>
          <h1 className="mt-1 text-xl">
            {contract.device.brand} {contract.device.model}
          </h1>
        </div>
        <StatusBadge tone={contract.status === "active" ? "success" : "warning"}>
          {contract.status}
        </StatusBadge>
      </div>
      <div className="mt-5 rounded-2xl border border-primary/20 bg-primary/5 p-5">
        <Smartphone className="size-7 text-primary" aria-hidden="true" />
        <div className="mt-4 flex justify-between text-sm">
          <span className="text-muted-foreground">Paid</span>
          <span className="font-mono">{money(settled)}</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary"
            style={{
              width: `${Math.min(100, total === 0 ? 0 : (settled / total) * 100)}%`,
            }}
          />
        </div>
        <div className="mt-3 flex justify-between text-sm">
          <span className="text-muted-foreground">First due</span>
          <span>{dateTime(`${contract.firstDueDate}T00:00:00Z`)}</span>
        </div>
      </div>
      <Button className="mt-5 w-full" onClick={() => navigate("/customer/pay")}>
        Make a payment <ArrowRight className="size-4" aria-hidden="true" />
      </Button>
      <button
        className="mt-4 w-full text-center text-sm text-primary hover:underline"
        onClick={() => navigate("/customer/contract")}
      >
        View contract and schedule
      </button>
    </section>
  );
}

function customerKycStatus(status: string): {
  label: string;
  description: string;
  tone: "success" | "warning" | "danger" | "neutral";
} {
  return (
    {
      not_started: {
        label: "Verification required",
        description: "Your retailer will help you start identity verification.",
        tone: "warning" as const,
      },
      pending: {
        label: "Verification in progress",
        description: "Your identity information is being reviewed securely.",
        tone: "warning" as const,
      },
      needs_correction: {
        label: "Additional information required",
        description: "Contact your retailer to correct or resubmit your information.",
        tone: "warning" as const,
      },
      verified: {
        label: "Verification completed",
        description: "Your identity verification has been completed.",
        tone: "success" as const,
      },
      failed: {
        label: "Verification unsuccessful",
        description:
          "Contact your retailer for help with another verification attempt.",
        tone: "danger" as const,
      },
    }[status] ?? {
      label: "Verification in progress",
      description: "Your verification status is being updated.",
      tone: "neutral" as const,
    }
  );
}

function customerApplicationStatus(status: string): string {
  return (
    {
      draft: "Application being prepared",
      submitted: "Application submitted",
      kyc_review: "Identity verification",
      credit_review: "Financing review",
      approved: "Application approved",
      rejected: "Application declined",
      cancelled: "Application cancelled",
      expired: "Application expired",
    }[status] ?? "Application in progress"
  );
}
