import { KeyRound, LogOut, ShieldCheck } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";

interface FactorSetup {
  factorId: string;
  qrCode?: string;
  secret?: string;
  enrolled: boolean;
}

export function PlatformMfa() {
  const auth = useAuth();
  const navigate = useNavigate();
  const refreshAccess = auth.refreshAccess;
  const [setup, setSetup] = useState<FactorSetup>();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    async function prepare() {
      if (supabase === undefined) {
        throw new Error("Supabase Auth is not configured.");
      }
      const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assurance.error !== null) throw assurance.error;
      if (assurance.data.currentLevel === "aal2") {
        await refreshAccess();
        navigate("/admin", { replace: true });
        return;
      }

      const listed = await supabase.auth.mfa.listFactors();
      if (listed.error !== null) throw listed.error;
      const verified = listed.data.totp.find((factor) => factor.status === "verified");
      if (verified !== undefined) {
        if (active) {
          setSetup({ factorId: verified.id, enrolled: true });
        }
        return;
      }

      const enrolled = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Platform administration",
      });
      if (enrolled.error !== null) throw enrolled.error;
      if (active) {
        setSetup({
          factorId: enrolled.data.id,
          qrCode: enrolled.data.totp.qr_code,
          secret: enrolled.data.totp.secret,
          enrolled: false,
        });
      }
    }

    void prepare()
      .catch((value: unknown) => {
        if (active) {
          setError(
            value instanceof Error
              ? value.message
              : "Multi-factor authentication setup failed.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [navigate, refreshAccess]);

  if (!auth.loading && !auth.platformAccess) {
    return <Navigate to="/" replace />;
  }
  if (
    !auth.loading &&
    auth.platformAccess &&
    (!auth.platformMfaRequired || auth.platformMfaSatisfied)
  ) {
    return <Navigate to="/admin" replace />;
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    if (supabase === undefined || setup === undefined) return;
    setVerifying(true);
    setError(undefined);
    try {
      const result = await supabase.auth.mfa.challengeAndVerify({
        factorId: setup.factorId,
        code: code.trim(),
      });
      if (result.error !== null) throw result.error;
      const refreshed = await supabase.auth.refreshSession();
      if (refreshed.error !== null) throw refreshed.error;
      await auth.refreshAccess();
      navigate("/admin", { replace: true });
    } catch (value) {
      setError(
        value instanceof Error ? value.message : "Verification code was rejected.",
      );
    } finally {
      setVerifying(false);
    }
  }

  return (
    <main className="app-ambient grid min-h-screen place-items-center p-6 text-foreground">
      <section className="w-full max-w-md rounded-2xl border border-border bg-muted/50 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-3 grid size-11 place-items-center rounded-xl bg-primary/15 text-primary">
              <ShieldCheck className="size-5" aria-hidden="true" />
            </div>
            <h1 className="text-2xl">Secure platform access</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Platform administration requires a time-based authenticator code.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Sign out"
            onClick={() => void auth.signOut()}
          >
            <LogOut className="size-4" />
          </Button>
        </div>

        {loading ? (
          <div className="mt-6 flex items-center gap-3 text-sm text-muted-foreground">
            <span className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            Preparing secure verification...
          </div>
        ) : setup !== undefined ? (
          <form className="mt-6 space-y-5" onSubmit={verify}>
            {!setup.enrolled && setup.qrCode !== undefined && (
              <div className="space-y-3">
                <p className="text-sm">
                  Scan this QR code with your authenticator app, then enter the
                  six-digit code.
                </p>
                <div className="mx-auto w-fit rounded-xl bg-white p-3">
                  <img
                    src={setup.qrCode}
                    alt="Authenticator enrollment QR code"
                    className="size-48"
                  />
                </div>
                {setup.secret !== undefined && (
                  <details className="rounded-lg border border-border p-3 text-sm">
                    <summary className="cursor-pointer text-muted-foreground">
                      Cannot scan the QR code?
                    </summary>
                    <code className="mt-2 block break-all">{setup.secret}</code>
                  </details>
                )}
              </div>
            )}
            {setup.enrolled && (
              <p className="text-sm text-muted-foreground">
                Open the authenticator app already linked to this account.
              </p>
            )}
            <div>
              <Label htmlFor="mfa-code">Authenticator code</Label>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="mfa-code"
                  value={code}
                  onChange={(event) =>
                    setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  className="pl-9 font-mono tracking-[0.35em]"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  minLength={6}
                  maxLength={6}
                  required
                  autoFocus
                />
              </div>
            </div>
            <Button
              className="w-full"
              type="submit"
              disabled={verifying || code.length !== 6}
              busy={verifying}
            >
              {verifying ? "Verifying..." : "Verify and continue"}
            </Button>
          </form>
        ) : null}

        {error !== undefined && (
          <p className="mt-4 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
