import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Building2,
  FileStack,
  ShieldCheck,
  Smartphone,
  Users,
  Wallet,
} from "lucide-react";
import { useNavigate, useParams } from "react-router";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../components/common/AsyncState";
import { GlassCard } from "../../components/common/GlassCard";
import { SectionCard } from "../../components/common/SectionCard";
import { StatusBadge } from "../../components/common/StatusBadge";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/ui/button";
import { getPlatformAnalytics, platformAnalyticsQueryKey } from "../../lib/analytics";
import { dateTime, money } from "../../lib/format";
import { listPlatformTenants, platformTenantsQueryKey } from "../../lib/platform";

export function TenantDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const analytics = useQuery({
    queryKey: platformAnalyticsQueryKey,
    queryFn: getPlatformAnalytics,
  });
  const tenants = useQuery({
    queryKey: platformTenantsQueryKey,
    queryFn: listPlatformTenants,
  });
  const metrics = analytics.data?.tenants.find((tenant) => tenant.id === id);
  const tenant = tenants.data?.find((row) => row.id === id);
  const pending = analytics.isPending || tenants.isPending;
  const error = analytics.error ?? tenants.error;

  if (pending) return <LoadingState label="Loading retailer..." />;
  if (error !== null)
    return (
      <ErrorState
        error={error}
        retry={() => {
          void analytics.refetch();
          void tenants.refetch();
        }}
      />
    );
  if (tenant === undefined || metrics === undefined)
    return <EmptyState label="This retailer does not exist or is not accessible." />;

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="mb-3 -ml-2 text-muted-foreground"
        onClick={() => navigate("/admin/tenants")}
      >
        <ArrowLeft className="size-4" /> Back to retailers
      </Button>
      <PageHeader
        title={tenant.name}
        subtitle={`${tenant.slug} · Created ${dateTime(tenant.createdAt)}`}
        breadcrumb={["Platform", "Retailers", tenant.name]}
        actions={
          <Button variant="outline" onClick={() => navigate("/admin/tenants")}>
            Manage retailer
          </Button>
        }
      />
      {tenant.archivedAt !== null && (
        <GlassCard className="mb-4 border-destructive/25 bg-destructive/5 p-4">
          <div className="font-medium text-destructive">
            Retailer archived {dateTime(tenant.archivedAt)}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{tenant.archiveReason}</p>
        </GlassCard>
      )}
      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Metric
          icon={Wallet}
          label="Financed"
          value={money(metrics.financedVolume, true)}
        />
        <Metric icon={FileStack} label="Contracts" value={String(metrics.contracts)} />
        <Metric icon={Users} label="Customers" value={String(metrics.customers)} />
        <Metric
          icon={Smartphone}
          label="Managed devices"
          value={String(metrics.managedDevices)}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Organization">
          <dl className="space-y-3 text-sm">
            <Row label="Identifier" value={tenant.id} mono />
            <Row label="Slug" value={tenant.slug} />
            <Row
              label="Status"
              value={
                tenant.archivedAt !== null
                  ? "Archived"
                  : tenant.active
                    ? "Active"
                    : "Pending owner"
              }
            />
            <Row label="Branches" value={String(metrics.branches)} />
            <Row label="Staff memberships" value={String(metrics.members)} />
          </dl>
        </SectionCard>
        <SectionCard title="Owner onboarding">
          <div className="flex items-start gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <Building2 className="size-5" />
            </span>
            <div>
              <div className="font-medium">
                {tenant.ownerInvitation?.fullName ?? "Owner invitation unavailable"}
              </div>
              <div className="text-sm text-muted-foreground">
                {tenant.ownerInvitation?.email ?? "No pending owner email"}
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <StatusBadge
              tone={
                tenant.ownerInvitation?.status === "accepted" ? "success" : "warning"
              }
            >
              {tenant.ownerInvitation?.status ??
                tenant.onboardingStatus.replaceAll("_", " ")}
            </StatusBadge>
            {tenant.ownerInvitation !== undefined && (
              <StatusBadge
                tone={
                  tenant.ownerInvitation.deliveryStatus === "sent"
                    ? "success"
                    : tenant.ownerInvitation.deliveryStatus === "failed"
                      ? "danger"
                      : "warning"
                }
              >
                delivery {tenant.ownerInvitation.deliveryStatus}
              </StatusBadge>
            )}
          </div>
        </SectionCard>
        <SectionCard title="Portfolio">
          <dl className="space-y-3 text-sm">
            <Row label="Active contracts" value={String(metrics.activeContracts)} />
            <Row label="Overdue contracts" value={String(metrics.overdueContracts)} />
            <Row
              label="Written-off contracts"
              value={String(metrics.writtenOffContracts)}
            />
            <Row label="Written-off balance" value={money(metrics.writtenOffBalance)} />
            <Row label="Collected" value={money(metrics.collectedVolume)} />
            <Row
              label="Pending applications"
              value={String(metrics.pendingApplications)}
            />
          </dl>
        </SectionCard>
        <SectionCard title="Device controls">
          <dl className="space-y-3 text-sm">
            <Row label="Enrolled" value={String(metrics.managedDevices)} />
            <Row label="Restricted" value={String(metrics.restrictedDevices)} />
          </dl>
          <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-4 text-primary" /> Counts reflect
            provider-enrolled contract devices only.
          </div>
        </SectionCard>
      </div>
    </>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
}) {
  return (
    <GlassCard className="p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <Icon className="size-4 text-primary" />
        {label}
      </div>
      <div className="mt-2 font-mono text-2xl font-semibold">{value}</div>
    </GlassCard>
  );
}
function Row({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={`max-w-[65%] break-all text-right ${mono ? "font-mono text-xs" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
