import { useState, type FormEvent } from "react";
import { Navigate } from "react-router";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

export function Login() {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  if (!auth.loading && auth.session !== null) {
    const destination = auth.platformAccess
      ? auth.platformMfaRequired && !auth.platformMfaSatisfied
        ? "/mfa"
        : "/admin"
      : "/";
    return <Navigate to={destination} replace />;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(undefined);
    try {
      await auth.signIn(email, password);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Sign in failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="app-ambient grid min-h-screen place-items-center p-6 text-foreground">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl"
      >
        <h1 className="text-2xl">Sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Use your organization’s secure Supabase account.
        </p>
        <div className="mt-6 space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
        </div>
        {error !== undefined && (
          <p className="mt-4 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <Button className="mt-5 w-full" type="submit" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </main>
  );
}
