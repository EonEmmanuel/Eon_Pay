import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MailPlus,
  RotateCcw,
  Search,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState, LoadingState } from "../components/common/AsyncState";
import { GlassCard } from "../components/common/GlassCard";
import { SectionCard } from "../components/common/SectionCard";
import { StatusBadge, type StatusTone } from "../components/common/StatusBadge";
import { PageHeader } from "../components/layout/PageHeader";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
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
import { useAuth } from "../lib/auth";
import { dateTime } from "../lib/format";
import {
  assignStaffRole,
  branchQueryKey,
  getBranches,
  getStaff,
  getStaffInvitations,
  getStaffRoles,
  inviteStaff,
  resendStaffInvitation,
  revokeStaffInvitation,
  revokeStaffRole,
  staffInvitationQueryKey,
  staffQueryKey,
  staffRoleQueryKey,
  updateStaffAccess,
  updateStaffStatus,
  type RetailerBranch,
  type StaffInvitation,
  type StaffMembership,
  type StaffRole,
} from "../lib/organization";

export function Staff() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const canManage = auth.tenantPermissions.includes("memberships.manage");
  const canManageOwners = auth.tenantPermissions.includes("tenant.owners.manage");
  const memberKey = staffQueryKey(auth.tenantId);
  const invitationKey = staffInvitationQueryKey(auth.tenantId);
  const roleKey = staffRoleQueryKey(auth.tenantId);
  const branchesKey = branchQueryKey(auth.tenantId);
  const staff = useQuery({ queryKey: memberKey, queryFn: getStaff });
  const invitations = useQuery({
    queryKey: invitationKey,
    queryFn: getStaffInvitations,
  });
  const roles = useQuery({ queryKey: roleKey, queryFn: getStaffRoles });
  const branches = useQuery({ queryKey: branchesKey, queryFn: getBranches });

  const [search, setSearch] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRoleId, setInviteRoleId] = useState("");
  const [inviteAllBranches, setInviteAllBranches] = useState(true);
  const [inviteBranchIds, setInviteBranchIds] = useState<string[]>([]);
  const [target, setTarget] = useState<StaffMembership>();
  const [accessAllBranches, setAccessAllBranches] = useState(true);
  const [accessBranchIds, setAccessBranchIds] = useState<string[]>([]);
  const [assignRoleId, setAssignRoleId] = useState("");

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: memberKey }),
      queryClient.invalidateQueries({ queryKey: invitationKey }),
      queryClient.invalidateQueries({ queryKey: roleKey }),
      queryClient.invalidateQueries({ queryKey: branchesKey }),
    ]);
    await auth.refreshAccess();
  };

  const inviteMutation = useMutation({
    mutationFn: () =>
      inviteStaff({
        fullName: inviteName.trim(),
        email: inviteEmail.trim(),
        roleId: inviteRoleId,
        allBranches: inviteAllBranches,
        branchIds: inviteAllBranches ? [] : inviteBranchIds,
      }),
    onSuccess: async (result) => {
      toast.success(
        result.deliveryStatus === "sent"
          ? "Staff invitation sent."
          : "Invitation saved, but email delivery needs attention.",
      );
      closeInvite();
      await refresh();
    },
    onError: (error) => toast.error(error.message),
  });
  const invitationMutation = useMutation({
    mutationFn: ({ action, id }: { action: "resend" | "revoke"; id: string }) =>
      action === "resend" ? resendStaffInvitation(id) : revokeStaffInvitation(id),
    onSuccess: async (_, variables) => {
      toast.success(
        variables.action === "resend"
          ? "Staff invitation resent."
          : "Staff invitation revoked.",
      );
      await refresh();
    },
    onError: (error) => toast.error(error.message),
  });
  const statusMutation = useMutation({
    mutationFn: ({
      membershipId,
      status,
    }: {
      membershipId: string;
      status: "active" | "suspended" | "revoked";
    }) => updateStaffStatus(membershipId, status),
    onSuccess: async (_, variables) => {
      toast.success(
        variables.status === "active"
          ? "Staff access reactivated."
          : variables.status === "suspended"
            ? "Staff access suspended."
            : "Staff access revoked.",
      );
      setTarget(undefined);
      await refresh();
    },
    onError: (error) => toast.error(error.message),
  });
  const accessMutation = useMutation({
    mutationFn: () =>
      updateStaffAccess(target!.id, {
        allBranches: accessAllBranches,
        branchIds: accessAllBranches ? [] : accessBranchIds,
      }),
    onSuccess: async () => {
      toast.success("Staff branch access updated.");
      setTarget(undefined);
      await refresh();
    },
    onError: (error) => toast.error(error.message),
  });
  const roleMutation = useMutation({
    mutationFn: ({
      action,
      roleId,
    }: {
      action: "assign" | "revoke";
      roleId: string;
    }) =>
      action === "assign"
        ? assignStaffRole(target!.id, roleId)
        : revokeStaffRole(target!.id, roleId),
    onSuccess: async () => {
      toast.success("Staff role assignments updated.");
      setAssignRoleId("");
      setTarget(undefined);
      await refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  const rows = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return (staff.data ?? []).filter(
      (member) =>
        normalized === "" ||
        `${member.displayName ?? ""} ${member.email ?? ""} ${member.roles
          .map((role) => role.name)
          .join(" ")}`
          .toLowerCase()
          .includes(normalized),
    );
  }, [search, staff.data]);
  const pendingInvitations = (invitations.data ?? []).filter(
    (invitation) => invitation.status === "pending",
  );
  const activeStaff = (staff.data ?? []).filter(
    (member) => member.status === "active",
  ).length;
  const suspendedStaff = (staff.data ?? []).filter(
    (member) => member.status === "suspended",
  ).length;
  const activeBranches = (branches.data ?? []).filter((branch) => branch.active);
  const assignableRoles = (roles.data ?? []).filter(
    (role) =>
      (!role.requiresOwnerAuthority || canManageOwners) &&
      !target?.roles.some((assigned) => assigned.id === role.id),
  );
  const selectedInviteRole = (roles.data ?? []).find(
    (role) => role.id === inviteRoleId,
  );
  const targetScope = membershipScopeConstraint(target);

  function selectInviteRole(roleId: string) {
    setInviteRoleId(roleId);
    const role = (roles.data ?? []).find((candidate) => candidate.id === roleId);
    if (role?.accessPolicy === "branch_required") {
      setInviteAllBranches(false);
    } else {
      setInviteAllBranches(true);
      setInviteBranchIds([]);
    }
  }

  function closeInvite() {
    setInviteOpen(false);
    setInviteName("");
    setInviteEmail("");
    setInviteRoleId("");
    setInviteAllBranches(true);
    setInviteBranchIds([]);
  }

  function openEditor(member: StaffMembership) {
    setTarget(member);
    setAccessAllBranches(member.allBranches);
    setAccessBranchIds(member.branches.map((branch) => branch.id));
    setAssignRoleId("");
  }

  const inviteValid =
    inviteName.trim().length >= 2 &&
    inviteEmail.includes("@") &&
    selectedInviteRole !== undefined &&
    (inviteAllBranches || inviteBranchIds.length > 0);
  const accessValid = accessAllBranches || accessBranchIds.length > 0;

  return (
    <>
      <PageHeader
        title="Retailer Staff"
        subtitle="Invite staff, apply least-privilege roles, and restrict branch access"
        breadcrumb={["Administration", "Staff"]}
        actions={
          canManage ? (
            <Button onClick={() => setInviteOpen(true)}>
              <UserPlus className="size-4" /> Invite staff
            </Button>
          ) : undefined
        }
      />
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Metric label="Active staff" value={String(activeStaff)} />
        <Metric label="Suspended" value={String(suspendedStaff)} />
        <Metric label="Pending invites" value={String(pendingInvitations.length)} />
        <Metric label="Active branches" value={String(activeBranches.length)} />
      </div>
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="pl-9"
          placeholder="Search staff by name, email, or role..."
          aria-label="Search retailer staff"
        />
      </div>
      <SectionCard title="Authorized retailer staff" bodyClassName="p-0">
        {staff.isPending ? (
          <LoadingState label="Loading retailer staff..." />
        ) : staff.isError ? (
          <div className="p-5">
            <ErrorState error={staff.error} retry={() => void staff.refetch()} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState label="No retailer staff match this search." />
        ) : (
          <div className="scroll-slim overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-white/8 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3">Staff member</th>
                  <th className="px-5 py-3">Roles</th>
                  <th className="px-5 py-3">Branch access</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/6">
                {rows.map((member) => (
                  <tr key={member.id}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="size-9">
                          <AvatarFallback className="bg-white/8 text-xs">
                            {initials(member.displayName ?? member.email ?? "Staff")}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">
                            {member.displayName ?? "Unnamed staff member"}
                            {member.isCurrentUser && (
                              <span className="ml-2 text-xs text-primary">You</span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {member.email ?? member.userId}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1">
                        {member.roles.map((role) => (
                          <StatusBadge key={role.id} tone="gold" dot={false}>
                            {role.name}
                          </StatusBadge>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {accessLabel(member.allBranches, member.branches)}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge tone={membershipTone(member.status)}>
                        {member.status}
                      </StatusBadge>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {canManage && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={member.isCurrentUser}
                          title={
                            member.isCurrentUser
                              ? "Self-access changes are prohibited."
                              : undefined
                          }
                          onClick={() => openEditor(member)}
                        >
                          Manage
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <div className="mt-4">
        <SectionCard title="Staff invitations" bodyClassName="p-0">
          {invitations.isPending ? (
            <LoadingState label="Loading staff invitations..." />
          ) : invitations.isError ? (
            <div className="p-5">
              <ErrorState
                error={invitations.error}
                retry={() => void invitations.refetch()}
              />
            </div>
          ) : invitations.data.length === 0 ? (
            <EmptyState label="No staff invitations have been created." />
          ) : (
            <div className="scroll-slim overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-white/8 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3">Recipient</th>
                    <th className="px-5 py-3">Role</th>
                    <th className="px-5 py-3">Branch access</th>
                    <th className="px-5 py-3">Invitation</th>
                    <th className="px-5 py-3">Expires</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/6">
                  {invitations.data.map((invitation) => (
                    <InvitationRow
                      key={invitation.id}
                      invitation={invitation}
                      canManage={
                        canManage &&
                        (invitation.roleKey !== "tenant_owner" || canManageOwners)
                      }
                      busy={invitationMutation.isPending}
                      act={(action) =>
                        invitationMutation.mutate({ action, id: invitation.id })
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>

      <Dialog
        open={inviteOpen}
        onOpenChange={(open) => (open ? setInviteOpen(true) : closeInvite())}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite retailer staff</DialogTitle>
            <DialogDescription>
              Access starts only after the recipient accepts the secure Supabase
              invitation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="staff-invite-name">Full name</Label>
              <Input
                id="staff-invite-name"
                value={inviteName}
                onChange={(event) => setInviteName(event.target.value)}
                minLength={2}
                maxLength={160}
              />
            </div>
            <div>
              <Label htmlFor="staff-invite-email">Email</Label>
              <Input
                id="staff-invite-email"
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                maxLength={254}
              />
            </div>
            <div>
              <Label htmlFor="staff-invite-role">Initial role</Label>
              <Select value={inviteRoleId} onValueChange={selectInviteRole}>
                <SelectTrigger id="staff-invite-role">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {(roles.data ?? [])
                    .filter((role) => !role.requiresOwnerAuthority || canManageOwners)
                    .map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        {role.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            {selectedInviteRole !== undefined && (
              <AccessEditor
                allBranches={inviteAllBranches}
                branchIds={inviteBranchIds}
                branches={activeBranches}
                policy={selectedInviteRole.accessPolicy}
                setAllBranches={setInviteAllBranches}
                setBranchIds={setInviteBranchIds}
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeInvite}>
              Cancel
            </Button>
            <Button
              disabled={inviteMutation.isPending || !inviteValid}
              busy={inviteMutation.isPending}
              onClick={() => inviteMutation.mutate()}
            >
              <MailPlus className="size-4" />
              {inviteMutation.isPending ? "Sending..." : "Send invitation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={target !== undefined}
        onOpenChange={(open) => !open && setTarget(undefined)}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Manage retailer staff</DialogTitle>
            <DialogDescription>
              Self-lockout and removal of the final active owner are blocked by the
              database.
            </DialogDescription>
          </DialogHeader>
          {target !== undefined && (
            <div className="space-y-5">
              <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4 text-sm">
                <div className="font-medium">
                  {target.displayName ?? "Unnamed staff member"}
                </div>
                <div className="text-muted-foreground">
                  {target.email ?? target.userId}
                </div>
              </div>
              <div>
                <Label>Assigned roles</Label>
                <div className="mt-1 flex flex-wrap gap-2 rounded-xl border border-white/8 bg-white/[0.03] p-3">
                  {target.roles.map((role) => (
                    <span
                      key={role.id}
                      className="inline-flex items-center gap-1 rounded-full bg-white/8 px-2.5 py-1 text-xs"
                    >
                      {role.name}
                      {(!role.key.includes("owner") || canManageOwners) && (
                        <button
                          type="button"
                          aria-label={`Remove ${role.name} role`}
                          disabled={roleMutation.isPending}
                          onClick={() =>
                            roleMutation.mutate({ action: "revoke", roleId: role.id })
                          }
                        >
                          <X className="size-3.5" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <Label htmlFor="assign-staff-role">Assign another role</Label>
                <div className="flex gap-2">
                  <Select value={assignRoleId} onValueChange={setAssignRoleId}>
                    <SelectTrigger id="assign-staff-role">
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                      {assignableRoles.map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    disabled={assignRoleId === "" || roleMutation.isPending}
                    busy={roleMutation.isPending}
                    onClick={() =>
                      roleMutation.mutate({ action: "assign", roleId: assignRoleId })
                    }
                  >
                    Assign
                  </Button>
                </div>
              </div>
              <AccessEditor
                allBranches={accessAllBranches}
                branchIds={accessBranchIds}
                branches={activeBranches}
                policy={targetScope}
                setAllBranches={setAccessAllBranches}
                setBranchIds={setAccessBranchIds}
              />
              <Button
                className="w-full"
                variant="outline"
                disabled={!accessValid || accessMutation.isPending}
                busy={accessMutation.isPending}
                onClick={() => accessMutation.mutate()}
              >
                {accessMutation.isPending ? "Saving access..." : "Save branch access"}
              </Button>
            </div>
          )}
          <DialogFooter className="sm:justify-between">
            {target !== undefined && target.status !== "revoked" && (
              <div className="flex gap-2">
                <Button
                  variant={target.status === "suspended" ? "default" : "outline"}
                  disabled={statusMutation.isPending}
                  busy={statusMutation.isPending}
                  onClick={() =>
                    statusMutation.mutate({
                      membershipId: target.id,
                      status: target.status === "suspended" ? "active" : "suspended",
                    })
                  }
                >
                  {target.status === "suspended" ? (
                    <ShieldCheck className="size-4" />
                  ) : (
                    <ShieldOff className="size-4" />
                  )}
                  {target.status === "suspended" ? "Reactivate" : "Suspend"}
                </Button>
                <Button
                  variant="destructive"
                  disabled={statusMutation.isPending}
                  busy={statusMutation.isPending}
                  onClick={() =>
                    statusMutation.mutate({
                      membershipId: target.id,
                      status: "revoked",
                    })
                  }
                >
                  Revoke access
                </Button>
              </div>
            )}
            <Button variant="outline" onClick={() => setTarget(undefined)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AccessEditor({
  allBranches,
  branchIds,
  branches,
  policy,
  setAllBranches,
  setBranchIds,
}: {
  allBranches: boolean;
  branchIds: string[];
  branches: RetailerBranch[];
  policy: StaffRole["accessPolicy"];
  setAllBranches(value: boolean): void;
  setBranchIds(value: string[]): void;
}) {
  const tenantWideRequired = policy === "tenant_wide";
  const branchRequired = policy === "branch_required";
  return (
    <fieldset className="space-y-3 rounded-xl border border-white/8 bg-white/[0.03] p-4">
      <legend className="px-1 text-sm font-medium">Branch access</legend>
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant={allBranches ? "default" : "outline"}
          disabled={branchRequired}
          onClick={() => {
            setAllBranches(true);
            setBranchIds([]);
          }}
        >
          All branches
        </Button>
        <Button
          type="button"
          variant={!allBranches ? "default" : "outline"}
          disabled={tenantWideRequired}
          onClick={() => setAllBranches(false)}
        >
          Selected branches
        </Button>
      </div>
      {!allBranches && (
        <div className="grid max-h-40 gap-2 overflow-y-auto rounded-lg border border-white/8 p-3 sm:grid-cols-2">
          {branches.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active branches are available.
            </p>
          ) : (
            branches.map((branch) => (
              <label
                key={branch.id}
                className="flex cursor-pointer items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  className="size-4 accent-[oklch(0.78_0.15_168)]"
                  checked={branchIds.includes(branch.id)}
                  onChange={(event) =>
                    setBranchIds(
                      event.target.checked
                        ? [...branchIds, branch.id]
                        : branchIds.filter((id) => id !== branch.id),
                    )
                  }
                />
                <span>{branch.name}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {branch.code}
                </span>
              </label>
            ))
          )}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {tenantWideRequired
          ? "This role requires retailer-wide access."
          : branchRequired
            ? "This role must remain restricted to at least one active branch."
            : "This role can be retailer-wide or restricted to selected branches."}
      </p>
    </fieldset>
  );
}

function InvitationRow({
  invitation,
  canManage,
  busy,
  act,
}: {
  invitation: StaffInvitation;
  canManage: boolean;
  busy: boolean;
  act(action: "resend" | "revoke"): void;
}) {
  const pending = invitation.status === "pending";
  return (
    <tr>
      <td className="px-5 py-3">
        <div className="font-medium">{invitation.fullName}</div>
        <div className="text-xs text-muted-foreground">{invitation.email}</div>
      </td>
      <td className="px-5 py-3">{invitation.roleName}</td>
      <td className="px-5 py-3 text-muted-foreground">
        {accessLabel(invitation.allBranches, invitation.branches)}
      </td>
      <td className="px-5 py-3">
        <StatusBadge tone={invitationTone(invitation)}>{invitation.status}</StatusBadge>
        {invitation.deliveryStatus === "failed" && (
          <div className="mt-1 text-xs text-destructive">
            Delivery: {invitation.deliveryError ?? "failed"}
          </div>
        )}
      </td>
      <td className="px-5 py-3 text-muted-foreground">
        {dateTime(invitation.expiresAt)}
      </td>
      <td className="px-5 py-3 text-right">
        {canManage && pending && (
          <div className="inline-flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => act("resend")}
            >
              <RotateCcw className="size-3.5" /> Resend
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={() => act("revoke")}
            >
              <Trash2 className="size-3.5" /> Revoke
            </Button>
          </div>
        )}
      </td>
    </tr>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <GlassCard className="p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <UsersRound className="size-4" aria-hidden="true" /> {label}
      </div>
      <div className="mt-1 font-mono text-2xl font-semibold">{value}</div>
    </GlassCard>
  );
}

function membershipScopeConstraint(
  member?: StaffMembership,
): StaffRole["accessPolicy"] {
  if (
    member?.roles.some(
      (role) => role.key === "tenant_owner" || role.key === "tenant_admin",
    )
  ) {
    return "tenant_wide";
  }
  if (
    member?.roles.some(
      (role) => role.key === "branch_manager" || role.key === "cashier",
    )
  ) {
    return "branch_required";
  }
  return "flexible";
}

function accessLabel(
  allBranches: boolean,
  branches: Array<{ name: string; code: string }>,
): string {
  return allBranches
    ? "All branches"
    : branches.length > 0
      ? branches.map((branch) => `${branch.name} (${branch.code})`).join(", ")
      : "No active branch";
}

function membershipTone(status: StaffMembership["status"]): StatusTone {
  if (status === "active") return "success";
  if (status === "suspended") return "warning";
  if (status === "revoked") return "danger";
  return "neutral";
}

function invitationTone(invitation: StaffInvitation): StatusTone {
  if (invitation.status === "accepted") return "success";
  if (invitation.status === "pending") {
    return invitation.deliveryStatus === "failed" ? "danger" : "warning";
  }
  return "neutral";
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
