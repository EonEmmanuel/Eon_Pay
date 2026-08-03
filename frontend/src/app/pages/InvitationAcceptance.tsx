import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, LogOut, MailCheck, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { toast } from "sonner";
import { ErrorState, LoadingState } from "../components/common/AsyncState";
import { EmptyState } from "../components/common/EmptyState";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { apiRequest } from "../lib/api";
import { useAuth } from "../lib/auth";
import { dateTime } from "../lib/format";
import { supabase } from "../lib/supabase";

interface PendingInvitation {
  id: string;
  scope: "tenant" | "platform";
  tenantId?: string;
  tenantName?: string;
  tenantSlug?: string;
  email: string;
  fullName: string;
  roleId: string;
  roleName: string;
  requiresPasswordSetup: boolean;
  expiresAt: string;
}

const invitationsQueryKey = ["auth", "invitations"] as const;

export function InvitationAcceptance() {
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [confirmations, setConfirmations] = useState<Record<string, string>>({});
  const [validationError, setValidationError] = useState<string>();

  const invitations = useQuery({
    queryKey: invitationsQueryKey,
    queryFn: async () => {
      const [tenantInvitations, platformInvitations] = await Promise.all([
        apiRequest<Omit<PendingInvitation, "scope">[]>("/auth/invitations", {
          tenant: false,
        }),
        apiRequest<Omit<PendingInvitation, "scope">[]>("/auth/platform-invitations", {
          tenant: false,
        }),
      ]);
      return [
        ...tenantInvitations.map((invitation) => ({
          ...invitation,
          scope: "tenant" as const,
        })),
        ...platformInvitations.map((invitation) => ({
          ...invitation,
          scope: "platform" as const,
        })),
      ];
    },
  });

  const accept = useMutation({
    mutationFn: async (invitation: PendingInvitation) => {
      setValidationError(undefined);
      if (invitation.requiresPasswordSetup) {
        const password = passwords[invitation.id] ?? "";
        if (password.length < 12) {
          throw new Error("Choose a password containing at least 12 characters.");
        }
        if (password !== (confirmations[invitation.id] ?? "")) {
          throw new Error("The password confirmation does not match.");
        }
        if (supabase === undefined) {
          throw new Error("Supabase Auth is not configured.");
        }
        const passwordResult = await supabase.auth.updateUser({ password });
        // A retry can follow a successful password update and a failed membership acceptance.
        if (
          passwordResult.error !== null &&
          passwordResult.error.code !== "same_password"
        ) {
          throw passwordResult.error;
        }
      }

      if (invitation.scope === "platform") {
        await apiRequest<{ userId: string; roleId: string }>(
          `/auth/platform-invitations/${invitation.id}/accept`,
          { method: "POST", tenant: false },
        );
      } else {
        await apiRequest<{ tenantId: string; membershipId: string }>(
          `/auth/invitations/${invitation.id}/accept`,
          { method: "POST", tenant: false },
        );
      }
      return invitation.scope;
    },
    onSuccess: async (scope) => {
      await Promise.all([
        auth.refreshAccess(),
        queryClient.invalidateQueries({ queryKey: invitationsQueryKey }),
      ]);
      toast.success(
        scope === "platform"
          ? "Platform invitation accepted."
          : "Invitation accepted. Welcome to your retailer workspace.",
      );
      navigate(scope === "platform" ? "/mfa" : "/", { replace: true });
    },
    onError: (error) => setValidationError(error.message),
  });

  if (
    invitations.isSuccess &&
    invitations.data.length === 0 &&
    (auth.memberships.length > 0 || auth.platformAccess)
  ) {
    return <Navigate to={auth.platformAccess ? "/admin" : "/"} replace />;
  }

  return (
    <main className="app-ambient min-h-screen p-6 text-foreground">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="mb-3 grid size-12 place-items-center rounded-xl bg-primary/15 text-primary">
              <MailCheck className="size-6" aria-hidden="true" />
            </div>
            <h1 className="text-2xl">Access invitations</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Accept only invitations you recognize. Access is granted after acceptance.
            </p>
          </div>
          <Button variant="outline" onClick={() => void auth.signOut()}>
            <LogOut className="size-4" aria-hidden="true" />
            Sign out
          </Button>
        </div>

        {invitations.isPending ? (
          <LoadingState label="Checking invitations…" />
        ) : invitations.isError ? (
          <ErrorState
            error={invitations.error}
            retry={() => void invitations.refetch()}
          />
        ) : invitations.data.length === 0 ? (
          <EmptyState
            icon={MailCheck}
            title="No pending invitations"
            description="Ask the platform administrator to confirm the invitation email or resend it."
          />
        ) : (
          <div className="space-y-4">
            {invitations.data.map((invitation) => (
              <section
                key={invitation.id}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-5"
              >
                <div className="flex items-start gap-3">
                  <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
                    {invitation.scope === "platform" ? (
                      <ShieldCheck className="size-5" aria-hidden="true" />
                    ) : (
                      <Building2 className="size-5" aria-hidden="true" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-medium">
                      {invitation.scope === "platform"
                        ? "Platform administration"
                        : invitation.tenantName}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {invitation.roleName} · {invitation.email}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Expires {dateTime(invitation.expiresAt)}
                    </p>
                  </div>
                </div>

                {invitation.requiresPasswordSetup && (
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor={`password-${invitation.id}`}>
                        Choose a password
                      </Label>
                      <Input
                        id={`password-${invitation.id}`}
                        type="password"
                        autoComplete="new-password"
                        minLength={12}
                        value={passwords[invitation.id] ?? ""}
                        onChange={(event) =>
                          setPasswords((current) => ({
                            ...current,
                            [invitation.id]: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor={`confirm-${invitation.id}`}>
                        Confirm password
                      </Label>
                      <Input
                        id={`confirm-${invitation.id}`}
                        type="password"
                        autoComplete="new-password"
                        minLength={12}
                        value={confirmations[invitation.id] ?? ""}
                        onChange={(event) =>
                          setConfirmations((current) => ({
                            ...current,
                            [invitation.id]: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                )}

                <Button
                  className="mt-5"
                  disabled={accept.isPending}
                  busy={accept.isPending}
                  onClick={() => accept.mutate(invitation)}
                >
                  {accept.isPending ? "Accepting invitation…" : "Accept invitation"}
                </Button>
              </section>
            ))}
          </div>
        )}

        {validationError !== undefined && (
          <p className="mt-4 text-sm text-destructive" role="alert">
            {validationError}
          </p>
        )}
      </div>
    </main>
  );
}
