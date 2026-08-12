import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, MapPin, Plus, Power, PowerOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState, LoadingState } from "../components/common/AsyncState";
import { GlassCard } from "../components/common/GlassCard";
import { SectionCard } from "../components/common/SectionCard";
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
import { useAuth } from "../lib/auth";
import { dateTime } from "../lib/format";
import {
  branchQueryKey,
  createBranch,
  getBranches,
  updateBranch,
  type RetailerBranch,
} from "../lib/organization";

export function Branches() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const canManage = auth.tenantPermissions.includes("branches.manage");
  const queryKey = branchQueryKey(auth.tenantId);
  const branches = useQuery({ queryKey, queryFn: getBranches });
  const [createOpen, setCreateOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<RetailerBranch>();
  const [editingName, setEditingName] = useState("");

  const refresh = () => queryClient.invalidateQueries({ queryKey });
  const createMutation = useMutation({
    mutationFn: () =>
      createBranch({ code: code.trim().toUpperCase(), name: name.trim() }),
    onSuccess: async () => {
      toast.success("Branch created.");
      setCreateOpen(false);
      setCode("");
      setName("");
      await refresh();
    },
    onError: (error) => toast.error(error.message),
  });
  const updateMutation = useMutation({
    mutationFn: ({
      branchId,
      update,
    }: {
      branchId: string;
      update: { name?: string; active?: boolean };
    }) => updateBranch(branchId, update),
    onSuccess: async (_, variables) => {
      toast.success(
        variables.update.active === false
          ? "Branch deactivated. Historical records remain available."
          : variables.update.active === true
            ? "Branch reactivated."
            : "Branch updated.",
      );
      setEditing(undefined);
      await refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  const activeCount = (branches.data ?? []).filter((branch) => branch.active).length;
  const inactiveCount = (branches.data ?? []).length - activeCount;

  function openEditor(branch: RetailerBranch) {
    setEditing(branch);
    setEditingName(branch.name);
  }

  return (
    <>
      <PageHeader
        title="Branches"
        subtitle="Manage retailer locations without losing historical financial records"
        breadcrumb={["Administration", "Branches"]}
        actions={
          canManage ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" /> Add branch
            </Button>
          ) : undefined
        }
      />
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Metric label="Total branches" value={String(branches.data?.length ?? 0)} />
        <Metric label="Active" value={String(activeCount)} />
        <Metric label="Inactive" value={String(inactiveCount)} />
      </div>
      <SectionCard
        title="Retailer locations"
        subtitle="Inactive branches stay attached to applications, contracts, and payments."
        bodyClassName="p-0"
      >
        {branches.isPending ? (
          <LoadingState label="Loading branches..." />
        ) : branches.isError ? (
          <div className="p-5">
            <ErrorState error={branches.error} retry={() => void branches.refetch()} />
          </div>
        ) : branches.data.length === 0 ? (
          <EmptyState label="No branches are available to your account." />
        ) : (
          <div className="scroll-slim overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3">Branch</th>
                  <th className="px-5 py-3">Code</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Created</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {branches.data.map((branch) => (
                  <tr key={branch.id}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
                          <MapPin className="size-4" aria-hidden="true" />
                        </span>
                        <div>
                          <div className="font-medium">{branch.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {branch.id}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 font-mono">{branch.code}</td>
                    <td className="px-5 py-3">
                      <StatusBadge tone={branch.active ? "success" : "neutral"}>
                        {branch.active ? "Active" : "Inactive"}
                      </StatusBadge>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {dateTime(branch.createdAt)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {canManage && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditor(branch)}
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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create branch</DialogTitle>
            <DialogDescription>
              Branch codes are permanent identifiers; names can be updated later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="branch-code">Branch code</Label>
              <Input
                id="branch-code"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="DOUALA-01"
                minLength={2}
                maxLength={20}
                pattern="[A-Z0-9_-]+"
              />
            </div>
            <div>
              <Label htmlFor="branch-name">Branch name</Label>
              <Input
                id="branch-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Douala central"
                minLength={2}
                maxLength={120}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                createMutation.isPending ||
                !/^[A-Z0-9_-]{2,20}$/.test(code.trim()) ||
                name.trim().length < 2
              }
              busy={createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? "Creating..." : "Create branch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editing !== undefined}
        onOpenChange={(open) => !open && setEditing(undefined)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage branch</DialogTitle>
            <DialogDescription>
              Deactivation blocks new assignments and originations but preserves
              existing records.
            </DialogDescription>
          </DialogHeader>
          {editing !== undefined && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-branch-code">Branch code</Label>
                <Input id="edit-branch-code" value={editing.code} disabled />
              </div>
              <div>
                <Label htmlFor="edit-branch-name">Branch name</Label>
                <Input
                  id="edit-branch-name"
                  value={editingName}
                  onChange={(event) => setEditingName(event.target.value)}
                  minLength={2}
                  maxLength={120}
                />
              </div>
              <div className="rounded-xl border border-border bg-muted/50 p-4 text-sm text-muted-foreground">
                The final active branch cannot be deactivated. A branch assigned as a
                staff member&apos;s only active location must be reassigned first.
              </div>
            </div>
          )}
          <DialogFooter className="sm:justify-between">
            {editing !== undefined && (
              <Button
                variant={editing.active ? "destructive" : "default"}
                disabled={updateMutation.isPending}
                busy={updateMutation.isPending}
                onClick={() =>
                  updateMutation.mutate({
                    branchId: editing.id,
                    update: { active: !editing.active },
                  })
                }
              >
                {editing.active ? (
                  <PowerOff className="size-4" />
                ) : (
                  <Power className="size-4" />
                )}
                {editing.active ? "Deactivate" : "Reactivate"}
              </Button>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditing(undefined)}>
                Close
              </Button>
              {editing !== undefined && (
                <Button
                  disabled={
                    updateMutation.isPending ||
                    editingName.trim().length < 2 ||
                    editingName.trim() === editing.name
                  }
                  busy={updateMutation.isPending}
                  onClick={() =>
                    updateMutation.mutate({
                      branchId: editing.id,
                      update: { name: editingName.trim() },
                    })
                  }
                >
                  Save name
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <GlassCard className="p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <Building2 className="size-4" aria-hidden="true" /> {label}
      </div>
      <div className="mt-1 font-mono text-2xl font-semibold">{value}</div>
    </GlassCard>
  );
}
