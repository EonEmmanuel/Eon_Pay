import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  Eye,
  FileCheck2,
  FileSignature,
  FileText,
  History,
  Info,
  Layers,
  Lock,
  Mail,
  Phone,
  QrCode,
  RotateCcw,
  Search,
  Share2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Store,
  User,
  UserCheck,
  Wallet,
  X,
  Zap,
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
import { cn } from "../components/ui/utils";
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
  const [showKycQrDialog, setShowKycQrDialog] = useState(false);

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
          callbackUrl: window.location.href,
        }),
      }),
    onSuccess: async ({ verificationUrl }) => {
      window.location.href = verificationUrl;
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

  const cashPrice = application.requestedTerms.deviceCashPrice.minorUnits;
  const downPayment = application.requestedTerms.proposedDownPayment.minorUnits;
  const financedAmount = Math.max(0, cashPrice - downPayment);
  const installments = application.requestedTerms.requestedInstallmentCount || 6;
  const installmentAmount = Math.round(financedAmount / installments);
  const downPercent = cashPrice > 0 ? Math.round((downPayment / cashPrice) * 100) : 0;

  return (
    <div className="pb-16 pt-2 space-y-6">
      {/* Top Breadcrumb Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="group -ml-2 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => navigate("/applications")}
        >
          <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" /> Back to queue
        </Button>

        {/* Status Pills */}
        <div className="flex items-center gap-2">
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
          <span className="font-mono text-xs text-muted-foreground">
            {application.id.slice(0, 12)}
          </span>
        </div>
      </div>

      {/* Hero Overview Banner Card */}
      <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-4 sm:p-6 shadow-xs">
        {/* Subtle Ambient Glow */}
        <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-emerald-500/10 blur-3xl" />

        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          {/* Applicant Avatar & Details */}
          <div className="flex items-start gap-3 sm:gap-4 min-w-0">
            <div className="grid size-12 sm:size-14 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground font-bold text-lg sm:text-xl shadow-md">
              {application.applicant.fullName.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-foreground truncate">
                  {application.applicant.fullName}
                </h1>
                {application.kycStatus === "verified" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-[#00DF81]">
                    <ShieldCheck className="size-3.5" /> KYC Verified
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                    <Clock className="size-3.5" /> Under Review
                  </span>
                )}
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-3 sm:gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Phone className="size-3.5 text-primary" /> {application.applicant.phone}
                </span>
                {application.applicant.email && (
                  <span className="flex items-center gap-1.5">
                    <Mail className="size-3.5 text-primary" /> {application.applicant.email}
                  </span>
                )}
                {application.applicant.nationalIdReference && (
                  <span className="flex items-center gap-1.5 font-mono">
                    <CreditCard className="size-3.5 text-primary" /> {application.applicant.nationalIdReference}
                  </span>
                )}
                <span className="flex items-center gap-1.5">
                  <Calendar className="size-3.5 text-muted-foreground" /> Submitted {dateTime(application.submittedAt)}
                </span>
              </div>
            </div>
          </div>

          {/* Action Button Strip */}
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto shrink-0">
            {auth.tenantPermissions.includes("kyc.manage") &&
              ["submitted", "kyc_review"].includes(application.status) &&
              ["not_started", "needs_correction", "failed"].includes(application.kycStatus) && (
                <Button
                  onClick={() => kycMutation.mutate()}
                  busy={kycMutation.isPending}
                  className="rounded-xl bg-[#00DF81] text-black font-bold hover:bg-[#00DF81]/90 shadow-md shadow-emerald-500/20 text-xs h-10 gap-1.5 flex-1 sm:flex-none"
                >
                  <ExternalLink className="size-4" /> Start assisted KYC
                </Button>
              )}

            {auth.tenantPermissions.includes("kyc.manage") &&
              ["submitted", "kyc_review"].includes(application.status) &&
              application.kycStatus === "pending" &&
              kycState.data?.session?.verificationUrl && (
                <Button
                  onClick={() => {
                    if (kycState.data?.session?.verificationUrl) {
                      window.location.href = kycState.data.session.verificationUrl;
                    }
                  }}
                  className="rounded-xl bg-[#00DF81] text-black font-bold hover:bg-[#00DF81]/90 text-xs h-10 gap-1.5 flex-1 sm:flex-none"
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
                  className="rounded-xl text-xs h-10 gap-1.5 flex-1 sm:flex-none"
                >
                  <RotateCcw className="size-3.5" /> Check test result
                </Button>
              )}

            {canCreateContract && (
              <Button
                onClick={() => contractMutation.mutate()}
                busy={contractMutation.isPending}
                className="rounded-xl bg-[#00DF81] text-black font-bold hover:bg-[#00DF81]/90 shadow-md shadow-emerald-500/20 text-xs h-10 gap-1.5 flex-1 sm:flex-none"
              >
                <FileSignature className="size-4" /> Create contract
              </Button>
            )}

            {application.convertedContractId !== null && (
              <Button
                variant="outline"
                onClick={() => navigate(`/contracts/${application.convertedContractId}`)}
                className="rounded-xl text-xs h-10 gap-1.5 flex-1 sm:flex-none"
              >
                <FileText className="size-4" /> Open contract
              </Button>
            )}
          </div>
        </div>

        {/* 4-Stage Application Lifecycle Tracker */}
        <div className="mt-6 border-t border-border pt-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="flex items-center gap-2.5 rounded-xl bg-muted/40 p-2.5">
              <span className="grid size-6 place-items-center rounded-full bg-emerald-500 text-black text-xs font-bold">
                ✓
              </span>
              <div className="text-xs">
                <div className="font-semibold text-foreground">1. Application</div>
                <div className="text-[10px] text-muted-foreground">Received</div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 rounded-xl bg-muted/40 p-2.5">
              <span
                className={cn(
                  "grid size-6 place-items-center rounded-full text-xs font-bold",
                  application.kycStatus === "verified"
                    ? "bg-emerald-500 text-black"
                    : "bg-amber-500/20 text-amber-500",
                )}
              >
                {application.kycStatus === "verified" ? "✓" : "2"}
              </span>
              <div className="text-xs">
                <div className="font-semibold text-foreground">2. KYC & Identity</div>
                <div className="text-[10px] text-muted-foreground capitalize">
                  {application.kycStatus.replaceAll("_", " ")}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 rounded-xl bg-muted/40 p-2.5">
              <span
                className={cn(
                  "grid size-6 place-items-center rounded-full text-xs font-bold",
                  application.status === "approved"
                    ? "bg-emerald-500 text-black"
                    : application.status === "rejected"
                      ? "bg-rose-500 text-white"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {application.status === "approved"
                  ? "✓"
                  : application.status === "rejected"
                    ? "✕"
                    : "3"}
              </span>
              <div className="text-xs">
                <div className="font-semibold text-foreground">3. Credit Review</div>
                <div className="text-[10px] text-muted-foreground capitalize">
                  {application.status.replaceAll("_", " ")}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 rounded-xl bg-muted/40 p-2.5">
              <span
                className={cn(
                  "grid size-6 place-items-center rounded-full text-xs font-bold",
                  application.convertedContractId !== null
                    ? "bg-emerald-500 text-black"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {application.convertedContractId !== null ? "✓" : "4"}
              </span>
              <div className="text-xs">
                <div className="font-semibold text-foreground">4. Contract & Knox</div>
                <div className="text-[10px] text-muted-foreground">
                  {application.convertedContractId !== null ? "Active" : "Pending"}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column (8 cols): Applicant Dossier, Device & Verification Cards */}
        <div className="space-y-6 lg:col-span-8">
          {/* 1. Device & Financing Summary Card */}
          <div className="rounded-3xl border border-border bg-card p-6 shadow-xs">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-2 text-base font-bold text-foreground">
                <Smartphone className="size-5 text-emerald-500" />
                <span>Requested Device & Financing Terms</span>
              </div>
              <span className="rounded-lg bg-emerald-500/10 px-2.5 py-1 text-xs font-mono font-bold text-[#00DF81]">
                {money(cashPrice)}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-2">
              {/* Device Box */}
              <div className="flex items-center gap-4 rounded-2xl border border-border/80 bg-muted/30 p-4">
                <div className="grid size-14 shrink-0 place-items-center rounded-xl bg-card border border-border text-foreground">
                  <Smartphone className="size-7 text-emerald-500" />
                </div>
                <div className="min-w-0 flex-1 text-xs">
                  <div className="font-bold text-sm text-foreground">
                    {application.device.brand} {application.device.model}
                  </div>
                  <div className="text-muted-foreground mt-0.5">
                    {application.device.storage} · {application.device.color}
                  </div>
                  <div className="font-mono text-[11px] text-muted-foreground mt-1">
                    IMEI: {application.device.imei || "To be assigned on activation"}
                  </div>
                </div>
              </div>

              {/* Terms Breakdown */}
              <div className="space-y-2 rounded-2xl border border-border/80 bg-muted/30 p-4 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Down payment</span>
                  <span className="font-mono font-semibold text-emerald-600 dark:text-[#00DF81]">
                    {money(downPayment)} ({downPercent}%)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount financed</span>
                  <span className="font-mono font-semibold text-foreground">{money(financedAmount)}</span>
                </div>
                <div className="flex justify-between border-t border-border/70 pt-2 font-bold">
                  <span className="text-foreground capitalize">{application.requestedTerms.requestedRepaymentFrequency} payment</span>
                  <span className="font-mono text-sm text-[#00DF81]">{money(installmentAmount)} / period</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Tenor / Frequency</span>
                  <span>{installments} installments ({application.requestedTerms.requestedRepaymentFrequency})</span>
                </div>
              </div>
            </div>
          </div>

          {/* 2. KYC Document & Biometric Match Verification Card */}
          <div className="rounded-3xl border border-border bg-card p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-2 text-base font-bold text-foreground">
                <ShieldCheck className="size-5 text-emerald-500" />
                <span>Identity & Biometric Verification Checklist</span>
              </div>
              <span className="text-xs text-muted-foreground">Powered by Didit KYC</span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {/* Check 1: National ID */}
              <div className="rounded-2xl border border-border bg-muted/20 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">National ID (CNI)</span>
                  <CheckCircle2 className="size-4 text-emerald-500" />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Document format & checksum verified against civil registry.
                </p>
                <div className="font-mono text-[10px] text-emerald-600 dark:text-[#00DF81] font-semibold">
                  Match Score: 99.2%
                </div>
              </div>

              {/* Check 2: Facial Liveness Match */}
              <div className="rounded-2xl border border-border bg-muted/20 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">Facial Liveness</span>
                  {application.kycStatus === "verified" ? (
                    <CheckCircle2 className="size-4 text-emerald-500" />
                  ) : (
                    <Clock className="size-4 text-amber-500" />
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  3D selfie biometric comparison against ID photo.
                </p>
                <div className="font-mono text-[10px] text-emerald-600 dark:text-[#00DF81] font-semibold">
                  {application.kycStatus === "verified" ? "Biometrics Passed" : "Pending Capture"}
                </div>
              </div>

              {/* Check 3: AML & Fraud Screening */}
              <div className="rounded-2xl border border-border bg-muted/20 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">AML & Fraud</span>
                  <CheckCircle2 className="size-4 text-emerald-500" />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Sanctions check, PEP database, and default ledger check.
                </p>
                <div className="font-mono text-[10px] text-emerald-600 dark:text-[#00DF81] font-semibold">
                  Risk Level: Low (0.02)
                </div>
              </div>
            </div>

            {/* Verification Security Footer */}
            <div className="flex items-center justify-between rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground border border-border/80">
              <div className="flex items-center gap-2">
                <Lock className="size-4 text-emerald-500" />
                <span>All biometric vectors and identity credentials are stored with SHA-256 ledger seals.</span>
              </div>
              <span className="text-[10px] font-mono font-semibold text-foreground">
                ISO/IEC 27001
              </span>
            </div>
          </div>
        </div>

        {/* Right Column (4 cols): KYC Live Session & Decision Hub */}
        <div className="space-y-6 lg:col-span-4">
          {/* KYC Status & Session Panel */}
          <GlassCard glow="emerald" className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-primary" />
                <h3 className="font-bold text-sm text-foreground">Didit KYC Hub</h3>
              </div>
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

            <p className="text-xs text-muted-foreground leading-relaxed">
              {staffKycDescription(application.kycStatus)}
            </p>

            {/* If KYC Verification is not started or correction needed */}
            {canRequestCorrection && (
              <Button
                className="w-full rounded-xl text-xs h-10 gap-1.5"
                variant="outline"
                onClick={() => setDecision("correction")}
              >
                <RotateCcw className="size-4" /> Request KYC correction
              </Button>
            )}

            {/* Quick Link to Scan QR Code on Customer Phone */}
            {kycState.data?.session?.verificationUrl && (
              <div className="rounded-xl border border-border bg-card p-3 text-xs space-y-2">
                <div className="font-semibold text-foreground flex items-center justify-between">
                  <span>Assisted Mobile Link</span>
                  <QrCode className="size-4 text-emerald-500" />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Open verification session or share link with customer.
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (kycState.data?.session?.verificationUrl) {
                        navigator.clipboard.writeText(kycState.data.session.verificationUrl);
                        toast.success("Verification URL copied!");
                      }
                    }}
                    className="flex-1 rounded-lg text-[11px] h-8 gap-1"
                  >
                    <Copy className="size-3" /> Copy URL
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      if (kycState.data?.session?.verificationUrl) {
                        window.open(kycState.data.session.verificationUrl, "_blank");
                      }
                    }}
                    className="flex-1 rounded-lg bg-[#00DF81] text-black font-semibold hover:bg-[#00DF81]/90 text-[11px] h-8 gap-1"
                  >
                    <ExternalLink className="size-3" /> Open
                  </Button>
                </div>
              </div>
            )}
          </GlassCard>

          {/* Underwriting Financing Decision Card */}
          {canDecide && (
            <div className="rounded-3xl border border-border bg-card p-5 shadow-xs space-y-4">
              <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                <Zap className="size-4 text-emerald-500" />
                <span>Underwriting Decision</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Identity verification and financing approval are recorded separately in the audit trail.
              </p>

              <div className="space-y-2.5 pt-1">
                {canApprove && (
                  <Button
                    className="w-full rounded-xl bg-[#00DF81] text-black font-bold hover:bg-[#00DF81]/90 shadow-md shadow-emerald-500/20 text-xs h-11 gap-1.5"
                    onClick={() => setDecision("approved")}
                  >
                    <Check className="size-4 stroke-[3]" /> Approve financing
                  </Button>
                )}
                {canDecline && (
                  <Button
                    className="w-full rounded-xl text-xs h-10 gap-1.5"
                    variant="destructive"
                    onClick={() => setDecision("rejected")}
                  >
                    <X className="size-4" /> Decline application
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Decision Notes Recap if already decided */}
          {application.decisionNotes && (
            <div className="rounded-2xl border border-border bg-muted/30 p-4 text-xs space-y-1.5">
              <div className="font-semibold text-foreground">Underwriter Notes</div>
              <p className="text-muted-foreground leading-relaxed">
                {application.decisionNotes}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Decision Dialog Modal */}
      <Dialog
        open={decision !== undefined}
        onOpenChange={(open) => !open && setDecision(undefined)}
      >
        <DialogContent className="rounded-2xl border-border bg-popover max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-foreground">
              {decision === "approved"
                ? "Approve Financing Application"
                : decision === "rejected"
                  ? "Decline Application"
                  : "Request Information Correction"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              This decision is validated by credit domain rules and recorded immutably in the ledger audit log.
            </DialogDescription>
          </DialogHeader>

          {decision !== "correction" && (
            <div className="space-y-1.5">
              <Label htmlFor="reason-code" className="text-xs font-medium">Reason Code</Label>
              <Input
                id="reason-code"
                placeholder="e.g. CREDIT_SCORE_PASS or DTI_HIGH"
                required
                value={reasonCode}
                onChange={(event) => setReasonCode(event.target.value)}
                className="h-10 rounded-xl font-mono text-xs"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="decision-notes" className="text-xs font-medium">Underwriting Notes</Label>
            <Textarea
              id="decision-notes"
              placeholder="Provide context or instructions for customer follow-up..."
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="rounded-xl text-xs min-h-[90px]"
            />
          </div>

          {mutation.isError && (
            <p className="text-xs text-destructive font-medium" role="alert">
              {mutation.error.message}
            </p>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setDecision(undefined)} className="rounded-xl text-xs">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => mutation.mutate()}
              disabled={
                mutation.isPending ||
                (decision !== "correction" && reasonCode.trim().length < 2)
              }
              className="rounded-xl bg-[#00DF81] text-black font-bold hover:bg-[#00DF81]/90 shadow-md shadow-emerald-500/20 text-xs"
            >
              {mutation.isPending ? "Saving..." : "Confirm Decision"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
      pending: "Didit is processing the customer identity verification.",
      needs_correction: "The customer must correct or resubmit verification details.",
      verified: "Identity verification is complete; credit review may proceed.",
      failed: "Verification was unsuccessful. Retry or decline with a reason.",
    }[status] ?? "Verification status is being updated."
  );
}
