import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MailPlus,
  RotateCcw,
  Search,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../components/common/AsyncState";
import { GlassCard } from "../../components/common/GlassCard";
import { SectionCard } from "../../components/common/SectionCard";
import { StatusBadge } from "../../components/common/StatusBadge";
import { PageHeader } from "../../components/layout/PageHeader";
import { Avatar, AvatarFallback } from "../../components/ui/avatar";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  assignPlatformRole,
  getPlatformInvitations,
  getPlatformRoles,
  getPlatformUsers,
  invitePlatformUser,
  platformInvitationsQueryKey,
  platformRolesQueryKey,
  platformUsersQueryKey,
  resendPlatformInvitation,
  revokePlatformInvitation,
  revokePlatformRole,
  updatePlatformUser,
  updatePlatformUserAccess,
  type PlatformInvitation,
  type PlatformUser,
} from "../../lib/analytics";
import { useAuth } from "../../lib/auth";
import { dateTime } from "../../lib/format";

export function PlatformUsers() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<PlatformUser>();
  const [displayName, setDisplayName] = useState("");
  const [roleId, setRoleId] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRoleId, setInviteRoleId] = useState("");

  const users = useQuery({
    queryKey: platformUsersQueryKey,
    queryFn: getPlatformUsers,
    refetchInterval: 15_000,
  });
  const roles = useQuery({
    queryKey: platformRolesQueryKey,
    queryFn: getPlatformRoles,
  });
  const invitations = useQuery({
    queryKey: platformInvitationsQueryKey,
    queryFn: getPlatformInvitations,
    refetchInterval: 15_000,
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: platformUsersQueryKey }),
      queryClient.invalidateQueries({ queryKey: platformRolesQueryKey }),
      queryClient.invalidateQueries({ queryKey: platformInvitationsQueryKey }),
    ]);
    await auth.refreshAccess();
  };
  const profileMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      updatePlatformUser(id, { displayName: name }),
    onSuccess: async () => {
      toast.success("Platform profile updated.");
      await refresh();
    },
    onError: (error) => toast.error(error.message),
  });
  const accessMutation = useMutation({
    mutationFn: ({ id, disabled }: { id: string; disabled: boolean }) =>
      updatePlatformUserAccess(id, disabled),
    onSuccess: async () => {
      toast.success("Platform access state updated.");
      setTarget(undefined);
      await refresh();
    },
    onError: (error) => toast.error(error.message),
  });
  const roleMutation = useMutation({
    mutationFn: ({
      action,
      userId,
      nextRoleId,
    }: {
      action: "assign" | "revoke";
      userId: string;
      nextRoleId: string;
    }) =>
      action === "assign"
        ? assignPlatformRole(userId, nextRoleId)
        : revokePlatformRole(userId, nextRoleId),
    onSuccess: async () => {
      toast.success("Platform role assignments updated.");
      setRoleId("");
      await refresh();
      setTarget(undefined);
    },
    onError: (error) => toast.error(error.message),
  });
  const inviteMutation = useMutation({
    mutationFn: () =>
      invitePlatformUser({
        fullName: inviteName.trim(),
        email: inviteEmail.trim(),
        roleId: inviteRoleId,
      }),
    onSuccess: async (result) => {
      toast.success(
        result.deliveryStatus === "sent"
          ? "Platform invitation sent."
          : "Invitation recorded, but email delivery needs attention.",
      );
      setInviteOpen(false);
      setInviteName("");
      setInviteEmail("");
      setInviteRoleId("");
      await refresh();
    },
    onError: (error) => toast.error(error.message),
  });
  const invitationMutation = useMutation({
    mutationFn: ({ action, id }: { action: "resend" | "revoke"; id: string }) =>
      action === "resend" ? resendPlatformInvitation(id) : revokePlatformInvitation(id),
    onSuccess: async (_, variables) => {
      toast.success(
        variables.action === "resend"
          ? "Platform invitation resent."
          : "Platform invitation revoked.",
      );
      await refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  const rows = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return (users.data ?? []).filter(
      (user) =>
        normalized === "" ||
        `${user.displayName ?? ""} ${user.email ?? ""} ${user.id}`
          .toLowerCase()
          .includes(normalized),
    );
  }, [users.data, search]);
  const pendingInvitations = (invitations.data ?? []).filter(
    (invitation) => invitation.status === "pending",
  );
  const active = (users.data ?? []).filter((user) => !user.disabled).length;
  const disabled = (users.data ?? []).filter((user) => user.disabled).length;
  const roleCount = new Set(
    (users.data ?? []).flatMap((user) => user.roles.map((role) => role.roleKey)),
  ).size;
  const canInvite = auth.platformPermissions.includes("platform.users.invite");
  const canUpdate = auth.platformPermissions.includes("platform.users.update");
  const canDisable = auth.platformPermissions.includes("platform.users.disable");
  const canManageRoles = auth.platformPermissions.includes(
    "platform.users.roles.manage",
  );
  const availableRoles = (roles.data ?? []).filter(
    (role) =>
      role.assignable && !target?.roles.some((assigned) => assigned.roleId === role.id),
  );

  function openEditor(user: PlatformUser) {
    setTarget(user);
    setDisplayName(user.displayName ?? "");
    setRoleId("");
  }

  return (
    <>
      <PageHeader
        title="Platform Users"
        subtitle="Invite staff and administer least-privilege platform roles"
        breadcrumb={["Governance", "Platform Users"]}
        actions={
          canInvite ? (
            <Button onClick={() => setInviteOpen(true)}>
              <UserPlus className="size-4" /> Invite platform staff
            </Button>
          ) : undefined
        }
      />
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Metric label="Active staff" value={String(active)} />
        <Metric label="Disabled" value={String(disabled)} />
        <Metric label="Role types" value={String(roleCount)} />
        <Metric label="Pending invites" value={String(pendingInvitations.length)} />
      </div>
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name, email, or user ID..."
          className="pl-9"
          aria-label="Search platform users"
        />
      </div>
      <SectionCard title="Authorized platform staff" bodyClassName="p-0">
        {users.isPending ? (
          <LoadingState label="Loading platform users..." />
        ) : users.isError ? (
          <div className="p-5">
            <ErrorState error={users.error} retry={() => void users.refetch()} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState label="No platform identities match this search." />
        ) : (
          <div className="scroll-slim overflow-x-auto">
            <table className="w-full min-w-[840px] text-sm">
              <thead>
                <tr className="border-b border-white/8 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3">User</th>
                  <th className="px-5 py-3">Roles</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Created</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/6">
                {rows.map((user) => (
                  <tr key={user.id}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="size-9">
                          <AvatarFallback className="bg-white/8 text-xs">
                            {initials(user.displayName ?? user.email ?? "User")}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">
                            {user.displayName ?? "Unnamed user"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {user.email ?? user.id}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1">
                        {user.roles.map((role) => (
                          <StatusBadge key={role.roleId} tone="gold" dot={false}>
                            {role.roleName}
                          </StatusBadge>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      {user.disabled ? (
                        <span className="inline-flex items-center gap-1 text-destructive">
                          <ShieldOff className="size-4" /> Disabled
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-primary">
                          <ShieldCheck className="size-4" /> Active
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {dateTime(user.createdAt)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditor(user)}
                      >
                        Manage
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <div className="mt-4">
        <SectionCard title="Platform staff invitations" bodyClassName="p-0">
          {invitations.isPending ? (
            <LoadingState label="Loading platform invitations..." />
          ) : invitations.isError ? (
            <div className="p-5">
              <ErrorState
                error={invitations.error}
                retry={() => void invitations.refetch()}
              />
            </div>
          ) : invitations.data?.length === 0 ? (
            <EmptyState label="No platform invitations have been created." />
          ) : (
            <div className="scroll-slim overflow-x-auto">
              <table className="w-full min-w-[850px] text-sm">
                <thead>
                  <tr className="border-b border-white/8 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3">Recipient</th>
                    <th className="px-5 py-3">Role</th>
                    <th className="px-5 py-3">Invitation</th>
                    <th className="px-5 py-3">Expires</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/6">
                  {(invitations.data ?? []).map((invitation) => (
                    <InvitationRow
                      key={invitation.id}
                      invitation={invitation}
                      canManage={canInvite}
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
        open={target !== undefined}
        onOpenChange={(open) => !open && setTarget(undefined)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage platform user</DialogTitle>
            <DialogDescription>
              Changes are permission-checked, protected against owner lockout, and
              recorded in the immutable platform audit trail.
            </DialogDescription>
          </DialogHeader>
          {target !== undefined && (
            <div className="space-y-5">
              <div>
                <Label htmlFor="platform-display-name">Display name</Label>
                <div className="flex gap-2">
                  <Input
                    id="platform-display-name"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    minLength={2}
                    maxLength={160}
                    disabled={!canUpdate}
                  />
                  {canUpdate && (
                    <Button
                      variant="outline"
                      disabled={
                        profileMutation.isPending || displayName.trim().length < 2
                      }
                      busy={profileMutation.isPending}
                      onClick={() =>
                        profileMutation.mutate({
                          id: target.id,
                          name: displayName.trim(),
                        })
                      }
                    >
                      Save
                    </Button>
                  )}
                </div>
              </div>
              <div>
                <Label>Assigned roles</Label>
                <div className="mt-1 flex flex-wrap gap-2 rounded-lg border border-white/8 bg-white/[0.03] p-3">
                  {target.roles.map((role) => (
                    <span
                      key={role.roleId}
                      className="inline-flex items-center gap-1 rounded-full bg-white/8 px-2.5 py-1 text-xs"
                    >
                      {role.roleName}
                      {canManageRoles && target.id !== auth.session?.user.id && (
                        <button
                          type="button"
                          aria-label={`Revoke ${role.roleName}`}
                          disabled={roleMutation.isPending}
                          onClick={() =>
                            roleMutation.mutate({
                              action: "revoke",
                              userId: target.id,
                              nextRoleId: role.roleId,
                            })
                          }
                        >
                          <X className="size-3.5" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              </div>
              {canManageRoles && target.id !== auth.session?.user.id && (
                <div>
                  <Label htmlFor="new-platform-role">Assign another role</Label>
                  <div className="flex gap-2">
                    <Select value={roleId} onValueChange={setRoleId}>
                      <SelectTrigger id="new-platform-role">
                        <SelectValue placeholder="Select an assignable role" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableRoles.map((role) => (
                          <SelectItem key={role.id} value={role.id}>
                            {role.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      disabled={roleId === "" || roleMutation.isPending}
                      busy={roleMutation.isPending}
                      onClick={() =>
                        roleMutation.mutate({
                          action: "assign",
                          userId: target.id,
                          nextRoleId: roleId,
                        })
                      }
                    >
                      Assign
                    </Button>
                  </div>
                </div>
              )}
              <div className="rounded-lg border border-white/8 bg-white/[0.03] p-3 text-sm">
                <div className="text-muted-foreground">Account</div>
                <div>{target.email ?? target.id}</div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(undefined)}>
              Close
            </Button>
            {target !== undefined && canDisable && (
              <Button
                variant={target.disabled ? "default" : "destructive"}
                disabled={
                  accessMutation.isPending || target.id === auth.session?.user.id
                }
                title={
                  target.id === auth.session?.user.id
                    ? "Self-lockout is prohibited."
                    : undefined
                }
                busy={accessMutation.isPending}
                onClick={() =>
                  accessMutation.mutate({
                    id: target.id,
                    disabled: !target.disabled,
                  })
                }
              >
                {target.disabled ? "Reactivate" : "Disable access"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite platform staff</DialogTitle>
            <DialogDescription>
              The recipient receives a secure Supabase email link and gains no platform
              authority until accepting it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="platform-invite-name">Full name</Label>
              <Input
                id="platform-invite-name"
                value={inviteName}
                onChange={(event) => setInviteName(event.target.value)}
                minLength={2}
                maxLength={160}
              />
            </div>
            <div>
              <Label htmlFor="platform-invite-email">Email</Label>
              <Input
                id="platform-invite-email"
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                maxLength={254}
              />
            </div>
            <div>
              <Label htmlFor="platform-invite-role">Initial role</Label>
              <Select value={inviteRoleId} onValueChange={setInviteRoleId}>
                <SelectTrigger id="platform-invite-role">
                  <SelectValue placeholder="Select an assignable role" />
                </SelectTrigger>
                <SelectContent>
                  {(roles.data ?? [])
                    .filter((role) => role.assignable)
                    .map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        {role.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                inviteMutation.isPending ||
                inviteName.trim().length < 2 ||
                !inviteEmail.includes("@") ||
                inviteRoleId === ""
              }
              busy={inviteMutation.isPending}
              onClick={() => inviteMutation.mutate()}
            >
              <MailPlus className="size-4" />
              {inviteMutation.isPending ? "Sending..." : "Send invitation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function InvitationRow({
  invitation,
  canManage,
  busy,
  act,
}: {
  invitation: PlatformInvitation;
  canManage: boolean;
  busy: boolean;
  act(action: "resend" | "revoke"): void;
}) {
  const pending = invitation.status === "pending";
  const tone =
    invitation.status === "accepted"
      ? "success"
      : invitation.status === "pending"
        ? invitation.deliveryStatus === "failed"
          ? "danger"
          : "warning"
        : "neutral";
  return (
    <tr>
      <td className="px-5 py-3">
        <div className="font-medium">{invitation.fullName}</div>
        <div className="text-xs text-muted-foreground">{invitation.email}</div>
      </td>
      <td className="px-5 py-3">{invitation.roleName}</td>
      <td className="px-5 py-3">
        <StatusBadge tone={tone}>{invitation.status}</StatusBadge>
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
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-mono text-2xl font-semibold">{value}</div>
    </GlassCard>
  );
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
