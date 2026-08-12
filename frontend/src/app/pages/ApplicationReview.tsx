import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  ExternalLink,
  FileSignature,
  RotateCcw,
  ShieldCheck,
  X,
} from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { ErrorState, LoadingState } from "../components/common/AsyncState";
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
import { Textarea } from "../components/ui/textarea";
import { apiRequest } from "../lib/api";
import { useAuth } from "../lib/auth";
import { dateTime, money } from "../lib/format";

interface FinancingApplication {
  id: string;
  applicant: {
    fullName: string;
    phone: string;
    email?: string;
    nationalIdReference?: string;
  };
  device: {
    brand: string;
    model: string;
    storage: string;
    color: string;
    imei?: string;
  };
  requestedTerms: {
    deviceCashPrice: { minorUnits: number };
    proposedDownPayment: { minorUnits: number };
    requestedInstallmentCount: number;
    requestedRepaymentFrequency: "weekly" | "biweekly" | "monthly";
  };
  approvedTerms?: Record<string, unknown>;
  status: string;
  kycStatus: string;
  submittedAt: string | null;
  decisionNotes: string | null;
  convertedContractId: string | null;
}

interface KycState {
  status: string;
  kycStatus: string;
  pollingFallbackEnabled: boolean;
  session: {
    id: string;
    status: string;
    verificationUrl: string | null;
    updatedAt: string;
  } | null;
}

type Decision = "approved" | "rejected" | "correction";

export function ApplicationReview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [decision, setDecision] = useState<Decision>();
  const [reasonCode, setReasonCode] = useState("");
  const [notes, setNotes] = useState("");
  const query = useQuery({
    queryKey: ["application", id],
    enabled: id !== undefined,
    queryFn: () => apiRequest<FinancingApplication>(`/applications/${id ?? ""}`),
    refetchInterval: (currentQuery) => {
      const app = currentQuery.state.data;
      return app !== undefined && app.kycStatus === "pending" ? 8_000 : false;
    },
  });
  const kycState = useQuery({
    queryKey: ["application", id, "kyc-status"],
    enabled: id !== undefined && auth.tenantPermissions.includes("kyc.read"),
    queryFn: () => apiRequest<KycState>(`/applications/${id ?? ""}/kyc/status`),
    refetchInterval: (currentQuery) => {
      const state = currentQuery.state.data;
      return state !== null &&
        state !== undefined &&
        state.session !== null &&
        !["approved", "declined", "abandoned", "expired", "failed"].includes(
          state.session?.status ?? "",
        )
        ? 8_000
        : false;
    },
  });
  const mutation = useMutation({
    mutationFn: async () => {
      if (id === undefined || decision === undefined) return;
      if (decision === "correction") {
        return apiRequest(`/applications/${id}/kyc-review`, {
          method: "POST",
          body: JSON.stringify({ status: "needs_correction" }),
        });
      }
      const application = query.data;
      if (application === undefined) return;
      const downPayment = application.requestedTerms.proposedDownPayment.minorUnits;
      const cashPrice = application.requestedTerms.deviceCashPrice.minorUnits;
      const firstDueDate = new Date();
      firstDueDate.setUTCMonth(firstDueDate.getUTCMonth() + 1);
      return apiRequest(`/applications/${id}/decision`, {
        method: "POST",
        body: JSON.stringify({
          outcome: decision,
          reasonCode,
          notes: notes || undefined,
          ...(decision === "approved"
            ? {
                approvedTerms: {
                  deviceCashPriceMinorUnits: cashPrice,
                  downPaymentMinorUnits: downPayment,
                  financedPrincipalMinorUnits: cashPrice - downPayment,
                  financeChargeMinorUnits: 0,
                  installmentCount:
                    application.requestedTerms.requestedInstallmentCount,
                  repaymentFrequency:
                    application.requestedTerms.requestedRepaymentFrequency,
                  firstDueDate: firstDueDate.toISOString().slice(0, 10),
                  gracePeriodDays: 3,
                },
              }
            : {}),
        }),
      });
    },
    onSuccess: async () => {
      toast.success(
        decision === "correction" ? "Correction requested" : `Application ${decision}`,
      );
      setDecision(undefined);
      setReasonCode("");
      setNotes("");
      await queryClient.invalidateQueries({ queryKey: ["applications"] });
      await query.refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const contractMutation = useMutation({
    mutationFn: () =>
      apiRequest<{ id: string }>("/contracts/from-application", {
        method: "POST",
        body: JSON.stringify({ applicationId: id }),
      }),
    onSuccess: async (contract) => {
      toast.success("Contract created and ready for signature");
      await queryClient.invalidateQueries({ queryKey: ["contracts"] });
      navigate(`/contracts/${contract.id}`);
    },
    onError: (error) => toast.error(error.message),
  });
  const kycMutation = useMutation({
    mutationFn: () =>
      apiRequest<{ verificationUrl: string }>(`/applications/${id}/kyc/session`, {
        method: "POST",
        body: JSON.stringify({
          language: "en",
          consentAccepted: true,
          consentVersion: "retailer-assisted-v1",
        }),
      }),
    onSuccess: async ({ verificationUrl }) => {
      window.open(verificationUrl, "_blank", "noopener,noreferrer");
      await Promise.all([query.refetch(), kycState.refetch()]);
    },
    onError: (error) => toast.error(error.message),
  });
  const syncKyc = useMutation({
    mutationFn: () =>
      apiRequest<KycState>(`/applications/${id}/kyc/sync`, { method: "POST" }),
    onSuccess: async () => {
      toast.success("Didit test result synchronized");
      await Promise.all([query.refetch(), kycState.refetch()]);
    },
    onError: (error) => toast.error(error.message),
  });

  if (query.isLoading) {
    return <LoadingState label="Loading application…" />;
  }
  if (query.isError || query.data === undefined) {
    return <ErrorState error={query.error} retry={() => void query.refetch()} />;
  }
  const application = query.data;
  const canReviewApplications = auth.tenantPermissions.includes("applications.review");
  const canApprove =
    canReviewApplications &&
    application.status === "credit_review" &&
    application.kycStatus === "verified";
  const canDecline =
    canReviewApplications &&
    ["submitted", "kyc_review", "credit_review"].includes(application.status);
  const canRequestCorrection =
    canReviewApplications && application.status === "kyc_review";
  const canDecide = canApprove || canDecline;
  const canCreateContract =
    application.status === "approved" &&
    application.convertedContractId === null &&
    auth.tenantPermissions.includes("contracts.create");

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="mb-3 -ml-2 text-muted-foreground"
        onClick={() => navigate("/applications")}
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> Back to queue
      </Button>
      <PageHeader
        title={application.applicant.fullName}
        subtitle={`Application ${application.id}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {auth.tenantPermissions.includes("kyc.manage") &&
              ["submitted", "kyc_review"].includes(application.status) &&
              ["not_started", "needs_correction", "failed"].includes(
                application.kycStatus,
              ) && (
                <Button
                  variant="outline"
                  onClick={() => kycMutation.mutate()}
                  busy={kycMutation.isPending}
                >
                  <ExternalLink className="size-4" /> Start assisted KYC
                </Button>
              )}
            {auth.tenantPermissions.includes("kyc.manage") &&
              ["submitted", "kyc_review"].includes(application.status) &&
              application.kycStatus === "pending" &&
              kycState.data?.session?.verificationUrl && (
                <Button
                  variant="outline"
                  onClick={() =>
                    window.open(
                      kycState.data?.session?.verificationUrl ?? "",
                      "_blank",
                      "noopener,noreferrer",
                    )
                  }
                >
                  <ExternalLink className="size-4" /> Resume assisted KYC
                </Button>
              )}
            {kycState.data?.pollingFallbackEnabled &&
              ["submitted", "kyc_review"].includes(application.status) &&
              kycState.data.session !== null &&
              application.kycStatus !== "verified" && (
                <Button
                  variant="outline"
                  onClick={() => syncKyc.mutate()}
                  busy={syncKyc.isPending}
                >
                  <RotateCcw className="size-4" /> Check test result
                </Button>
              )}
            {canCreateContract && (
              <Button
                onClick={() => contractMutation.mutate()}
                busy={contractMutation.isPending}
              >
                <FileSignature className="size-4" /> Create contract
              </Button>
            )}
            {application.convertedContractId !== null && (
              <Button
                variant="outline"
                onClick={() =>
                  navigate(`/contracts/${application.convertedContractId}`)
                }
              >
                Open contract
              </Button>
            )}
            <StatusBadge
              tone={
                application.status === "approved"
                  ? "success"
                  : application.status === "rejected"
                    ? "danger"
                    : "warning"
              }
            >
              {application.status.replaceAll("_", " ")}
            </StatusBadge>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <GlassCard>
            <h2 className="text-base">Applicant</h2>
            <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Detail label="Full name" value={application.applicant.fullName} />
              <Detail label="Phone" value={application.applicant.phone} />
              <Detail
                label="Email"
                value={application.applicant.email ?? "Not provided"}
              />
              <Detail
                label="National ID reference"
                value={application.applicant.nationalIdReference ?? "Not provided"}
              />
            </dl>
          </GlassCard>
          <GlassCard>
            <h2 className="text-base">Device and requested terms</h2>
            <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Detail
                label="Device"
                value={`${application.device.brand} ${application.device.model}`}
              />
              <Detail
                label="Variant"
                value={`${application.device.storage} · ${application.device.color}`}
              />
              <Detail
                label="Cash price"
                value={money(application.requestedTerms.deviceCashPrice.minorUnits)}
              />
              <Detail
                label="Down payment"
                value={money(application.requestedTerms.proposedDownPayment.minorUnits)}
              />
              <Detail
                label="Plan"
                value={`${application.requestedTerms.requestedInstallmentCount} ${application.requestedTerms.requestedRepaymentFrequency}`}
              />
              <Detail label="Submitted" value={dateTime(application.submittedAt)} />
            </dl>
          </GlassCard>
        </div>
        <div className="space-y-4">
          <GlassCard glow="emerald">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
              <h2 className="text-base">Identity verification</h2>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Didit KYC</span>
              <StatusBadge
                tone={
                  application.kycStatus === "verified"
                    ? "success"
                    : application.kycStatus === "failed"
                      ? "danger"
                      : "warning"
                }
              >
                {staffKycLabel(application.kycStatus)}
              </StatusBadge>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {staffKycDescription(application.kycStatus)}
            </p>
            {canRequestCorrection && (
              <Button
                className="mt-4 w-full"
                variant="outline"
                onClick={() => setDecision("correction")}
              >
                <RotateCcw className="size-4" /> Request KYC correction
              </Button>
            )}
          </GlassCard>

          {canDecide && (
            <GlassCard>
              <h2 className="text-base">Financing decision</h2>
              <p className="mt-2 text-xs text-muted-foreground">
                Identity verification and the financing decision are recorded
                separately.
              </p>
              <div className="mt-4 space-y-2">
                {canApprove && (
                  <Button className="w-full" onClick={() => setDecision("approved")}>
                    <Check className="size-4" aria-hidden="true" /> Approve financing
                  </Button>
                )}
                {canDecline && (
                  <Button
                    className="w-full"
                    variant="destructive"
                    onClick={() => setDecision("rejected")}
                  >
                    <X className="size-4" aria-hidden="true" /> Decline application
                  </Button>
                )}
              </div>
            </GlassCard>
          )}
        </div>
      </div>

      <Dialog
        open={decision !== undefined}
        onOpenChange={(open) => !open && setDecision(undefined)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decision === "approved"
                ? "Approve application"
                : decision === "rejected"
                  ? "Reject application"
                  : "Request correction"}
            </DialogTitle>
            <DialogDescription>
              This decision is validated by the domain rules and recorded in the
              immutable audit chain.
            </DialogDescription>
          </DialogHeader>
          {decision !== "correction" && (
            <div>
              <Label htmlFor="reason-code">Reason code</Label>
              <Input
                id="reason-code"
                required
                value={reasonCode}
                onChange={(event) => setReasonCode(event.target.value)}
              />
            </div>
          )}
          <div>
            <Label htmlFor="decision-notes">Notes</Label>
            <Textarea
              id="decision-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
          {mutation.isError && (
            <p className="text-sm text-destructive" role="alert">
              {mutation.error.message}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecision(undefined)}>
              Cancel
            </Button>
            <Button
              onClick={() => mutation.mutate()}
              disabled={
                mutation.isPending ||
                (decision !== "correction" && reasonCode.trim().length < 2)
              }
              busy={mutation.isPending}
            >
              {mutation.isPending ? "Saving…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{value}</dd>
    </div>
  );
}

function staffKycLabel(status: string): string {
  return (
    {
      not_started: "Verification required",
      pending: "Verification in progress",
      needs_correction: "Additional information required",
      verified: "Verification completed",
      failed: "Verification unsuccessful",
    }[status] ?? "Verification in progress"
  );
}

function staffKycDescription(status: string): string {
  return (
    {
      not_started: "Start assisted verification when the customer is ready.",
      pending: "Didit is processing the customer verification.",
      needs_correction: "The customer must correct or resubmit verification details.",
      verified: "Identity verification is complete; credit review may proceed.",
      failed: "Verification was unsuccessful. Retry or decline with a reason.",
    }[status] ?? "Verification status is being updated."
  );
}
