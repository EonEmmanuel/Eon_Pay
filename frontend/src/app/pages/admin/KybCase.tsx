import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  RotateCcw,
  ShieldAlert,
  UserRound,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useNavigate, useParams } from "react-router";
import { ErrorState, LoadingState } from "../../components/common/AsyncState";
import { GlassCard } from "../../components/common/GlassCard";
import { SectionCard } from "../../components/common/SectionCard";
import { StatusBadge } from "../../components/common/StatusBadge";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/ui/button";
import { Textarea } from "../../components/ui/textarea";
import { useAuth } from "../../lib/auth";
import { dateTime } from "../../lib/format";
import {
  downloadKybReport,
  getPlatformKyb,
  isProviderDecisionPending,
  platformKybQueryKey,
  reviewPlatformKyb,
  syncPlatformKyb,
} from "../../lib/kyb";

export function KybCase() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState("");
  const canManage = auth.platformPermissions.includes("platform.kyb.manage");
  const query = useQuery({
    queryKey: [...platformKybQueryKey, id],
    queryFn: () => getPlatformKyb(id, canManage),
    enabled: id.length > 0,
    refetchInterval: (currentQuery) => {
      const current = currentQuery.state.data;
      return current?.pollingFallbackEnabled &&
        canManage &&
        isProviderDecisionPending(current.case.status)
        ? 10_000
        : false;
    },
  });
  const mutation = useMutation({
    mutationFn: (action: "approve" | "reject" | "request_resubmission") =>
      reviewPlatformKyb(id, { action, notes }),
    onSuccess: async () => {
      toast.success("KYB decision recorded.");
      setNotes("");
      await queryClient.invalidateQueries({ queryKey: platformKybQueryKey });
      await query.refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  const syncMutation = useMutation({
    mutationFn: () => syncPlatformKyb(id),
    onSuccess: async (response) => {
      queryClient.setQueryData([...platformKybQueryKey, id], response);
      await queryClient.invalidateQueries({ queryKey: platformKybQueryKey });
      toast.success("Didit status synchronized.");
    },
    onError: (error) => toast.error(error.message),
  });
  const pendingDecision = mutation.isPending ? mutation.variables : undefined;
  if (query.isPending) return <LoadingState label="Loading KYB evidence..." />;
  if (query.isError)
    return <ErrorState error={query.error} retry={() => void query.refetch()} />;
  const data = query.data;
  const evidenceLinks = extractEvidenceLinks(data.case.decision);
  const decisionStatus = data.case.providerStatus ?? data.case.status;
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="mb-3 -ml-2 text-muted-foreground"
        onClick={() => navigate("/admin/kyb")}
      >
        <ArrowLeft className="size-4" /> Back to KYB queue
      </Button>
      <PageHeader
        title={data.profile.legalName}
        subtitle={`${data.tenant.name} · Didit business verification`}
        breadcrumb={["Platform", "Compliance", "Retailer KYB", data.profile.legalName]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {data.pollingFallbackEnabled &&
              canManage &&
              isProviderDecisionPending(data.case.status) && (
                <Button
                  variant="outline"
                  disabled={syncMutation.isPending}
                  busy={syncMutation.isPending}
                  onClick={() => syncMutation.mutate()}
                >
                  <RotateCcw
                    className={`size-4 ${syncMutation.isPending ? "animate-spin" : ""}`}
                  />
                  Sync Didit status
                </Button>
              )}
            <Button
              variant="outline"
              onClick={() =>
                downloadKybReport(id).catch((error: Error) =>
                  toast.error(error.message),
                )
              }
            >
              <Download className="size-4" /> Download report
            </Button>
          </div>
        }
      />
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Signal
          label="Platform status"
          value={data.case.status.replaceAll("_", " ")}
          icon={CheckCircle2}
        />
        <Signal
          label="Didit status"
          value={data.case.providerStatus ?? "Not returned"}
          icon={ShieldAlert}
        />
        <Signal
          label="Risk score"
          value={
            data.case.riskScore === null ? "Not scored" : `${data.case.riskScore} / 100`
          }
          icon={ShieldAlert}
        />
        <Signal
          label="Last update"
          value={dateTime(data.case.updatedAt)}
          icon={RotateCcw}
        />
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-5">
          <SectionCard
            title="Registered company"
            subtitle="Retailer-provided legal identity"
          >
            <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <Row label="Legal name" value={data.profile.legalName} />
              <Row label="Trading name" value={data.profile.tradingName || "—"} />
              <Row label="Registration" value={data.profile.registrationNumber} />
              <Row
                label="Tax identifier"
                value={data.profile.taxIdentificationNumber}
              />
              <Row
                label="Legal form"
                value={data.profile.legalForm.replaceAll("_", " ")}
              />
              <Row label="Country" value={data.profile.countryCode} />
              <Row
                label="Address"
                value={`${data.profile.registeredAddressLine1}, ${data.profile.city}`}
              />
              <Row
                label="Compliance contact"
                value={`${data.profile.contactEmail} · ${data.profile.contactPhone}`}
              />
            </dl>
          </SectionCard>
          <SectionCard
            title="Documents and evidence"
            subtitle="Signed provider evidence links are retrieved through the KYB decision API."
          >
            {evidenceLinks.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No document links have been returned yet.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {evidenceLinks.map((item) => (
                  <a
                    key={item.url}
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex items-center gap-3 rounded-xl border border-border bg-muted/50 p-3 transition hover:border-primary/30 hover:bg-primary/5"
                  >
                    <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                      <FileText className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {item.label}
                    </span>
                    <ExternalLink className="size-4 text-muted-foreground group-hover:text-primary" />
                  </a>
                ))}
              </div>
            )}
          </SectionCard>
          <SectionCard
            title="Provider decision snapshot"
            subtitle="Immutable evidence captured when the signed webhook was processed."
          >
            <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/50 p-4">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Current status
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Latest verified decision received from Didit.
                </p>
              </div>
              <StatusBadge
                className="px-3 py-1 text-sm capitalize"
                tone={
                  decisionStatus.toLowerCase().includes("approve")
                    ? "success"
                    : decisionStatus.toLowerCase().includes("declin") ||
                        decisionStatus.toLowerCase().includes("reject")
                      ? "danger"
                      : decisionStatus.toLowerCase().includes("review") ||
                          decisionStatus.toLowerCase().includes("progress")
                        ? "warning"
                        : "neutral"
                }
              >
                {decisionStatus.replaceAll("_", " ").toLowerCase()}
              </StatusBadge>
            </div>
          </SectionCard>
        </div>
        <div className="space-y-5">
          <SectionCard
            title="Compliance decision"
            subtitle="A platform decision is required after the Didit result."
          >
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-muted/50 p-4">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Decision reason
                </div>
                <p className="mt-2 text-sm">
                  {data.case.decisionReason ?? "No adverse reason returned."}
                </p>
              </div>
              {data.case.reviewedAt !== null && (
                <div className="rounded-xl border border-primary/15 bg-primary/5 p-4 text-sm">
                  <div className="flex items-center gap-2 font-medium">
                    <UserRound className="size-4 text-primary" /> Reviewed by{" "}
                    {data.reviewerName ?? data.reviewerEmail ?? "platform staff"}
                  </div>
                  <p className="mt-2 text-muted-foreground">{data.case.reviewNotes}</p>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {dateTime(data.case.reviewedAt)}
                  </div>
                </div>
              )}
              {canManage && !["approved", "rejected"].includes(data.case.status) && (
                <>
                  <Textarea
                    aria-label="Compliance review notes"
                    placeholder="Record the evidence and reason for this decision..."
                    minLength={3}
                    maxLength={2000}
                    disabled={mutation.isPending}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                  />
                  <div className="grid grid-cols-1 gap-2">
                    <Button
                      disabled={
                        notes.trim().length < 3 ||
                        mutation.isPending ||
                        data.case.status !== "provider_approved"
                      }
                      busy={pendingDecision === "approve"}
                      busyLabel="Approving retailer"
                      onClick={() => mutation.mutate("approve")}
                    >
                      <CheckCircle2 className="size-4" /> Approve retailer
                    </Button>
                    <Button
                      variant="outline"
                      disabled={notes.trim().length < 3 || mutation.isPending}
                      busy={pendingDecision === "request_resubmission"}
                      busyLabel="Requesting KYB resubmission"
                      onClick={() => mutation.mutate("request_resubmission")}
                    >
                      <RotateCcw className="size-4" /> Request resubmission
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={notes.trim().length < 3 || mutation.isPending}
                      busy={pendingDecision === "reject"}
                      busyLabel="Rejecting retailer"
                      onClick={() => mutation.mutate("reject")}
                    >
                      <XCircle className="size-4" /> Reject retailer
                    </Button>
                  </div>
                </>
              )}
            </div>
          </SectionCard>
          <SectionCard title="Audit context">
            <dl className="space-y-3 text-sm">
              <Row label="Case ID" value={data.case.id} />
              <Row label="Didit session" value={data.case.providerSessionId ?? "—"} />
              <Row
                label="Submitted"
                value={
                  data.case.submittedAt
                    ? dateTime(data.case.submittedAt)
                    : "Not submitted"
                }
              />
              <Row
                label="Provider completed"
                value={
                  data.case.providerCompletedAt
                    ? dateTime(data.case.providerCompletedAt)
                    : "Pending"
                }
              />
              <Row
                label="Tenant state"
                value={data.tenant.onboardingStatus.replaceAll("_", " ")}
              />
            </dl>
          </SectionCard>
        </div>
      </div>
    </>
  );
}

function Signal({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof CheckCircle2;
}) {
  return (
    <GlassCard className="p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <Icon className="size-4 text-primary" />
        {label}
      </div>
      <div className="mt-2 truncate font-medium capitalize">{value}</div>
    </GlassCard>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 break-words capitalize">{value}</dd>
    </div>
  );
}
function extractEvidenceLinks(
  value: unknown,
  path = "Document",
): Array<{ label: string; url: string }> {
  if (Array.isArray(value))
    return value.flatMap((item, index) =>
      extractEvidenceLinks(item, `${path} ${index + 1}`),
    );
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) =>
    key === "file_url" && typeof item === "string"
      ? [{ label: path, url: item }]
      : extractEvidenceLinks(item, key.replaceAll("_", " ")),
  );
}
