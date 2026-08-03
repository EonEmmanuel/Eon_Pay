import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Mail, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState, LoadingState } from "../../components/common/AsyncState";
import { SectionCard } from "../../components/common/SectionCard";
import { StatusBadge } from "../../components/common/StatusBadge";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { useAuth } from "../../lib/auth";
import { dateTime } from "../../lib/format";
import {
  archivePlatformTenant,
  createPlatformTenant,
  listPlatformTenants,
  platformTenantsQueryKey,
  resendPlatformOwnerInvitation,
  type CreatePlatformTenant,
  type PlatformInvitation,
  type PlatformTenant,
} from "../../lib/platform";
import { cn } from "../../components/ui/utils";

const filters = ["all", "active", "pending", "archived"] as const;
type Filter = (typeof filters)[number];

const emptyForm: CreatePlatformTenant = {
  name: "",
  slug: "",
  ownerName: "",
  ownerEmail: "",
  branchCode: "",
  branchName: "",
};

export function Tenants() {
  const navigate = useNavigate();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [queryText, setQueryText] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<CreatePlatformTenant>(emptyForm);
  const [archiveTarget, setArchiveTarget] = useState<PlatformTenant>();
  const [archiveConfirmation, setArchiveConfirmation] = useState("");
  const [archiveReason, setArchiveReason] = useState("");
  const canCreate = auth.platformPermissions.includes("platform.tenants.create");
  const canManage = auth.platformPermissions.includes("platform.tenants.manage");
  const canManageInvitations = auth.platformPermissions.includes(
    "platform.users.invite",
  );

  const tenants = useQuery({
    queryKey: platformTenantsQueryKey,
    queryFn: listPlatformTenants,
  });

  const createTenant = useMutation({
    mutationFn: () =>
      createPlatformTenant({
        name: form.name.trim(),
        slug: form.slug.trim().toLowerCase(),
        ownerName: form.ownerName.trim(),
        ownerEmail: form.ownerEmail.trim().toLowerCase(),
        branchCode: form.branchCode.trim().toUpperCase(),
        branchName: form.branchName.trim(),
      }),
    onSuccess: async (tenant) => {
      if (tenant.ownerInvitation?.deliveryStatus === "sent") {
        toast.success(`${tenant.name} was created and the owner invitation was sent.`);
      } else {
        toast.warning(
          `${tenant.name} was created. ${invitationFailureMessage(
            tenant.ownerInvitation?.deliveryError ?? null,
          )}`,
        );
      }
      setDialogOpen(false);
      setForm(emptyForm);
      await queryClient.invalidateQueries({ queryKey: platformTenantsQueryKey });
    },
    onError: (error) => toast.error(error.message),
  });

  const resendInvitation = useMutation({
    mutationFn: resendPlatformOwnerInvitation,
    onSuccess: async (invitation) => {
      if (invitation.deliveryStatus === "sent") {
        toast.success(`The owner invitation was sent to ${invitation.email}.`);
      } else {
        toast.warning(invitationFailureMessage(invitation.deliveryError));
      }
      await queryClient.invalidateQueries({ queryKey: platformTenantsQueryKey });
    },
    onError: (error) => toast.error(error.message),
  });

  const archiveTenant = useMutation({
    mutationFn: ({ tenantId, reason }: { tenantId: string; reason: string }) =>
      archivePlatformTenant(tenantId, reason),
    onSuccess: async (tenant) => {
      toast.success(
        `${tenant.name} was archived. Its financial history was preserved.`,
      );
      closeArchiveDialog();
      await queryClient.invalidateQueries({ queryKey: platformTenantsQueryKey });
    },
    onError: (error) => toast.error(error.message),
  });

  const rows = useMemo(() => {
    const normalizedQuery = queryText.trim().toLowerCase();
    return (tenants.data ?? []).filter((tenant) => {
      const matchesQuery =
        normalizedQuery === "" ||
        tenant.name.toLowerCase().includes(normalizedQuery) ||
        tenant.slug.toLowerCase().includes(normalizedQuery) ||
        tenant.id.toLowerCase().includes(normalizedQuery);
      const matchesFilter =
        filter === "all" ||
        (filter === "active" && tenant.active && tenant.archivedAt === null) ||
        (filter === "pending" &&
          tenant.onboardingStatus === "pending_owner" &&
          tenant.archivedAt === null) ||
        (filter === "archived" && tenant.archivedAt !== null);
      return matchesQuery && matchesFilter;
    });
  }, [filter, queryText, tenants.data]);

  function updateForm<Key extends keyof CreatePlatformTenant>(
    key: Key,
    value: CreatePlatformTenant[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function closeArchiveDialog() {
    setArchiveTarget(undefined);
    setArchiveConfirmation("");
    setArchiveReason("");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createTenant.mutate();
  }

  const archiveReady =
    archiveTarget !== undefined &&
    archiveConfirmation.trim().toLowerCase() === archiveTarget.slug.toLowerCase() &&
    archiveReason.trim().length >= 3;

  return (
    <>
      <PageHeader
        title="Retailers"
        subtitle={
          tenants.isPending
            ? "Loading retailer organizations…"
            : `${tenants.data?.length ?? 0} retailer organizations`
        }
        breadcrumb={["Platform", "Retailers"]}
        actions={
          <Button
            onClick={() => setDialogOpen(true)}
            disabled={!canCreate}
            title={
              canCreate ? undefined : "Your platform role cannot create retailers."
            }
          >
            <Plus className="size-4" aria-hidden="true" />
            Onboard retailer
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-white/8 bg-white/[0.03] p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={queryText}
            onChange={(event) => setQueryText(event.target.value)}
            placeholder="Search by retailer, slug, or ID…"
            className="pl-9"
            aria-label="Search retailers"
          />
        </div>
        <div
          className="flex items-center gap-1 rounded-lg border border-white/8 bg-white/[0.03] p-1"
          aria-label="Retailer status filter"
        >
          {filters.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                filter === value
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      <SectionCard bodyClassName="p-0">
        {tenants.isPending ? (
          <LoadingState label="Loading retailers…" />
        ) : tenants.isError ? (
          <div className="p-5">
            <ErrorState error={tenants.error} retry={() => void tenants.refetch()} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No retailers found"
            description="Try another search or status filter."
          />
        ) : (
          <div className="scroll-slim overflow-x-auto">
            <table className="w-full min-w-[1080px] text-sm">
              <thead>
                <tr className="border-b border-white/8 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Retailer</th>
                  <th className="px-5 py-3 font-medium">Slug</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Created</th>
                  <th className="px-5 py-3 font-medium">Owner invitation</th>
                  <th className="px-5 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/6">
                {rows.map((tenant) => (
                  <tr key={tenant.id}>
                    <td className="px-5 py-4 font-medium">{tenant.name}</td>
                    <td className="px-5 py-4 font-mono text-xs text-muted-foreground">
                      {tenant.slug}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge
                        tone={
                          tenant.archivedAt !== null
                            ? "neutral"
                            : tenant.active
                              ? "success"
                              : "warning"
                        }
                      >
                        {tenant.archivedAt !== null
                          ? "Archived"
                          : tenant.active
                            ? "Active"
                            : "Owner invite pending"}
                      </StatusBadge>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">
                      {dateTime(tenant.createdAt)}
                    </td>
                    <td className="px-5 py-4">
                      {tenant.archivedAt === null &&
                      tenant.ownerInvitation?.status === "pending" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => resendInvitation.mutate(tenant.id)}
                          disabled={
                            !canCreate ||
                            !canManageInvitations ||
                            resendInvitation.isPending
                          }
                          busy={resendInvitation.isPending}
                        >
                          <Mail className="size-4" aria-hidden="true" />
                          {tenant.ownerInvitation.deliveryStatus === "sent"
                            ? "Resend"
                            : "Send invite"}
                        </Button>
                      ) : (
                        <span className="text-xs capitalize text-muted-foreground">
                          {tenant.ownerInvitation?.status ?? "Unavailable"}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/admin/tenants/${tenant.id}`)}
                        >
                          View
                        </Button>
                        {tenant.archivedAt === null ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-destructive/30 text-destructive hover:bg-destructive/10"
                            onClick={() => setArchiveTarget(tenant)}
                            disabled={!canManage}
                            title={
                              canManage
                                ? "Archive retailer"
                                : "Your platform role cannot archive retailers."
                            }
                          >
                            <Trash2 className="size-4" aria-hidden="true" /> Archive
                          </Button>
                        ) : (
                          <span
                            className="max-w-48 truncate text-xs text-muted-foreground"
                            title={tenant.archiveReason ?? undefined}
                          >
                            {tenant.archiveReason}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Onboard retailer</DialogTitle>
            <DialogDescription>
              The retailer remains pending until its owner accepts the secure email
              invitation.
            </DialogDescription>
          </DialogHeader>
          <form
            id="retailer-onboarding-form"
            onSubmit={submit}
            className="grid gap-4 sm:grid-cols-2"
          >
            <Field label="Retailer name" id="retailer-name" className="sm:col-span-2">
              <Input
                id="retailer-name"
                value={form.name}
                onChange={(event) => updateForm("name", event.target.value)}
                minLength={2}
                maxLength={120}
                required
              />
            </Field>
            <Field label="Retailer slug" id="retailer-slug" className="sm:col-span-2">
              <Input
                id="retailer-slug"
                value={form.slug}
                onChange={(event) => updateForm("slug", event.target.value)}
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                minLength={2}
                maxLength={63}
                required
              />
            </Field>
            <Field label="Owner name" id="owner-name">
              <Input
                id="owner-name"
                value={form.ownerName}
                onChange={(event) => updateForm("ownerName", event.target.value)}
                minLength={2}
                maxLength={160}
                required
              />
            </Field>
            <Field label="Owner email" id="owner-email">
              <Input
                id="owner-email"
                type="email"
                value={form.ownerEmail}
                onChange={(event) => updateForm("ownerEmail", event.target.value)}
                maxLength={254}
                required
              />
            </Field>
            <Field label="Initial branch code" id="branch-code">
              <Input
                id="branch-code"
                value={form.branchCode}
                onChange={(event) => updateForm("branchCode", event.target.value)}
                minLength={2}
                maxLength={20}
                required
              />
            </Field>
            <Field label="Initial branch name" id="branch-name">
              <Input
                id="branch-name"
                value={form.branchName}
                onChange={(event) => updateForm("branchName", event.target.value)}
                minLength={2}
                maxLength={120}
                required
              />
            </Field>
          </form>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={createTenant.isPending}
              busy={createTenant.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="retailer-onboarding-form"
              disabled={createTenant.isPending}
              busy={createTenant.isPending}
            >
              {createTenant.isPending ? "Creating retailer…" : "Create retailer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={archiveTarget !== undefined}
        onOpenChange={(open) => !open && closeArchiveDialog()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive retailer</DialogTitle>
            <DialogDescription>
              This disables the retailer and revokes pending invitations. Contracts,
              payments, ledger entries and audit history are permanently preserved.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field
              label={`Type ${archiveTarget?.slug ?? "the retailer slug"} to confirm`}
              id="archive-confirmation"
            >
              <Input
                id="archive-confirmation"
                value={archiveConfirmation}
                onChange={(event) => setArchiveConfirmation(event.target.value)}
                autoComplete="off"
              />
            </Field>
            <Field label="Reason" id="archive-reason">
              <Input
                id="archive-reason"
                value={archiveReason}
                onChange={(event) => setArchiveReason(event.target.value)}
                minLength={3}
                maxLength={500}
                required
              />
            </Field>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={closeArchiveDialog}
              disabled={archiveTenant.isPending}
              busy={archiveTenant.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!archiveReady || archiveTenant.isPending}
              busy={archiveTenant.isPending}
              onClick={() =>
                archiveTarget &&
                archiveTenant.mutate({
                  tenantId: archiveTarget.id,
                  reason: archiveReason.trim(),
                })
              }
            >
              {archiveTenant.isPending ? "Archiving…" : "Archive retailer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({
  label,
  id,
  className,
  children,
}: {
  label: string;
  id: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function invitationFailureMessage(reason: PlatformInvitation["deliveryError"]): string {
  if (reason === "not_configured")
    return "The server invitation provider is not configured.";
  if (reason === "provider_rejected")
    return "Supabase rejected the invitation. Check Auth logs, SMTP settings, and rate limits.";
  return "The invitation could not be delivered. Check the backend logs and retry.";
}
