import type { Session } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Navigate, useLocation } from "react-router";
import { ApiError, apiRequest } from "./api";
import { authConfigurationError, supabase } from "./supabase";
import type { TenantOnboardingStatus } from "./organization";

export interface Membership {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  status: "active";
  onboardingStatus?: TenantOnboardingStatus;
}

interface TenantAccessResponse {
  allowed: true;
  permissions: string[];
  mfaRequired?: boolean;
  mfaSatisfied?: boolean;
}

interface PlatformAccessResponse {
  allowed: true;
  permissions: string[];
  mfaRequired?: boolean;
  mfaSatisfied?: boolean;
}

interface AuthContextValue {
  session: Session | null;
  memberships: Membership[];
  tenantId?: string;
  platformAccess: boolean;
  platformPermissions: readonly string[];
  platformMfaRequired: boolean;
  platformMfaSatisfied: boolean;
  tenantPermissions: readonly string[];
  loading: boolean;
  membershipError?: string;
  platformError?: string;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  selectTenant(tenantId: string): void;
  refreshAccess(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function errorMessage(value: unknown, fallback: string): string {
  return value instanceof Error ? value.message : fallback;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [tenantId, setTenantId] = useState<string>();
  const [platformAccess, setPlatformAccess] = useState(false);
  const [platformPermissions, setPlatformPermissions] = useState<string[]>([]);
  const [platformMfaRequired, setPlatformMfaRequired] = useState(false);
  const [platformMfaSatisfied, setPlatformMfaSatisfied] = useState(false);
  const [tenantPermissions, setTenantPermissions] = useState<string[]>([]);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [accessLoading, setAccessLoading] = useState(false);
  const [membershipError, setMembershipError] = useState<string>();
  const [platformError, setPlatformError] = useState<string>();
  const accessGeneration = useRef(0);
  const authenticatedUserId = useRef<string | undefined>(undefined);

  const resetAccess = useCallback(() => {
    accessGeneration.current += 1;
    setMemberships([]);
    setTenantId(undefined);
    setPlatformAccess(false);
    setPlatformPermissions([]);
    setPlatformMfaRequired(false);
    setPlatformMfaSatisfied(false);
    setTenantPermissions([]);
    setMembershipError(undefined);
    setPlatformError(undefined);
    setAccessLoading(false);
    authenticatedUserId.current = undefined;
  }, []);

  const refreshAccess = useCallback(async () => {
    const generation = accessGeneration.current + 1;
    accessGeneration.current = generation;
    setAccessLoading(true);
    setMembershipError(undefined);
    setPlatformError(undefined);

    const [membershipResult, platformResult] = await Promise.allSettled([
      apiRequest<Membership[]>("/auth/memberships", { tenant: false }),
      apiRequest<PlatformAccessResponse>("/auth/platform-access", {
        tenant: false,
      }),
    ]);

    if (generation !== accessGeneration.current) {
      return;
    }

    if (membershipResult.status === "fulfilled") {
      const values = membershipResult.value;
      setMemberships(values);
      const stored = window.localStorage.getItem("selected-tenant-id");
      const selected =
        values.find((membership) => membership.tenantId === stored)?.tenantId ??
        values[0]?.tenantId;
      if (selected === undefined) {
        window.localStorage.removeItem("selected-tenant-id");
        setTenantId(undefined);
      } else {
        window.localStorage.setItem("selected-tenant-id", selected);
        setTenantId(selected);
      }
    } else {
      setMemberships([]);
      setTenantId(undefined);
      setMembershipError(
        errorMessage(membershipResult.reason, "Could not load memberships."),
      );
    }

    if (platformResult.status === "fulfilled") {
      setPlatformAccess(platformResult.value.allowed);
      setPlatformPermissions(platformResult.value.permissions);
      setPlatformMfaRequired(platformResult.value.mfaRequired === true);
      setPlatformMfaSatisfied(platformResult.value.mfaSatisfied !== false);
    } else if (
      platformResult.reason instanceof ApiError &&
      platformResult.reason.status === 403
    ) {
      setPlatformAccess(false);
      setPlatformPermissions([]);
      setPlatformMfaRequired(false);
      setPlatformMfaSatisfied(false);
    } else {
      setPlatformAccess(false);
      setPlatformPermissions([]);
      setPlatformMfaRequired(false);
      setPlatformMfaSatisfied(false);
      setPlatformError(
        errorMessage(platformResult.reason, "Could not verify platform access."),
      );
    }

    setAccessLoading(false);
  }, []);

  useEffect(() => {
    if (supabase === undefined) {
      setMembershipError(authConfigurationError);
      setPlatformError(authConfigurationError);
      setSessionLoading(false);
      return;
    }

    void supabase.auth.getSession().then(({ data, error }) => {
      if (data.session !== null) {
        setAccessLoading(true);
      }
      authenticatedUserId.current = data.session?.user.id;
      setSession(data.session);
      if (error !== null) {
        setMembershipError(error.message);
        setPlatformError(error.message);
      }
      setSessionLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      const nextUserId = nextSession?.user.id;
      if (nextUserId !== undefined && nextUserId !== authenticatedUserId.current) {
        setAccessLoading(true);
      }
      authenticatedUserId.current = nextUserId;
      setSession(nextSession);
      setSessionLoading(false);
      if (nextSession === null) {
        resetAccess();
      }
    });
    return () => data.subscription.unsubscribe();
  }, [resetAccess]);

  const sessionUserId = session?.user.id;
  useEffect(() => {
    if (sessionUserId !== undefined) {
      void refreshAccess();
    }
  }, [refreshAccess, sessionUserId]);

  useEffect(() => {
    if (sessionUserId === undefined || tenantId === undefined) {
      setTenantPermissions([]);
      return;
    }
    let active = true;
    setTenantPermissions([]);
    void apiRequest<TenantAccessResponse>("/auth/tenant-access")
      .then((result) => {
        if (active) setTenantPermissions(result.permissions);
      })
      .catch(() => {
        if (active) setTenantPermissions([]);
      });
    return () => {
      active = false;
    };
  }, [sessionUserId, tenantId]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      memberships,
      tenantId,
      platformAccess,
      platformPermissions,
      platformMfaRequired,
      platformMfaSatisfied,
      tenantPermissions,
      loading: sessionLoading || accessLoading,
      membershipError,
      platformError,
      async signIn(email, password) {
        if (supabase === undefined) {
          throw new Error(authConfigurationError);
        }
        setAccessLoading(true);
        const result = await supabase.auth.signInWithPassword({ email, password });
        if (result.error !== null) {
          setAccessLoading(false);
          throw result.error;
        }
      },
      async signOut() {
        if (supabase !== undefined) {
          await supabase.auth.signOut();
        }
        window.localStorage.removeItem("selected-tenant-id");
        resetAccess();
      },
      selectTenant(nextTenantId) {
        if (!memberships.some((membership) => membership.tenantId === nextTenantId)) {
          return;
        }
        window.localStorage.setItem("selected-tenant-id", nextTenantId);
        setTenantPermissions([]);
        setTenantId(nextTenantId);
      },
      refreshAccess,
    }),
    [
      accessLoading,
      membershipError,
      memberships,
      platformAccess,
      platformError,
      platformPermissions,
      platformMfaRequired,
      platformMfaSatisfied,
      tenantPermissions,
      refreshAccess,
      resetAccess,
      session,
      sessionLoading,
      tenantId,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }
  return context;
}

function useSessionRequirement(): {
  auth: AuthContextValue;
  fallback?: ReactNode;
} {
  const auth = useAuth();
  const location = useLocation();
  if (auth.loading) {
    return {
      auth,
      fallback: <FullPageStatus message="Checking your secure session…" />,
    };
  }
  if (auth.session === null) {
    return {
      auth,
      fallback: <Navigate to="/login" replace state={{ from: location.pathname }} />,
    };
  }
  return { auth };
}

export function RequireAuthenticated({ children }: { children: ReactNode }) {
  const { fallback } = useSessionRequirement();
  if (fallback !== undefined) {
    return fallback;
  }
  return children;
}

export function RequireTenantAccess({ children }: { children: ReactNode }) {
  const { auth, fallback } = useSessionRequirement();
  const location = useLocation();
  if (fallback !== undefined) {
    return fallback;
  }
  if (auth.membershipError !== undefined) {
    return <FullPageStatus message={auth.membershipError} error />;
  }
  if (auth.tenantId === undefined) {
    return <Navigate to="/accept-invitation" replace />;
  }
  const selectedMembership = auth.memberships.find(
    (membership) => membership.tenantId === auth.tenantId,
  );
  if (
    selectedMembership?.onboardingStatus !== undefined &&
    selectedMembership.onboardingStatus !== "active" &&
    location.pathname !== "/business-profile"
  ) {
    return <Navigate to="/business-profile" replace />;
  }
  return children;
}

export function RequirePlatformAccess({ children }: { children: ReactNode }) {
  const { auth, fallback } = useSessionRequirement();
  if (fallback !== undefined) {
    return fallback;
  }
  if (auth.platformError !== undefined) {
    return <FullPageStatus message={auth.platformError} error />;
  }
  if (!auth.platformAccess) {
    return (
      <FullPageStatus
        message="Your account does not have platform administration access."
        error
      />
    );
  }
  if (auth.platformMfaRequired && !auth.platformMfaSatisfied) {
    return <Navigate to="/mfa" replace />;
  }
  return children;
}

export function RequireTenantPermission({
  permission,
  children,
}: {
  permission: string;
  children: ReactNode;
}) {
  const auth = useAuth();
  return (
    <RequireTenantAccess>
      {auth.tenantPermissions.includes(permission) ? (
        children
      ) : (
        <FullPageStatus
          message="Your retailer role does not permit access to this page."
          error
        />
      )}
    </RequireTenantAccess>
  );
}
export function RequirePlatformPermission({
  permission,
  children,
}: {
  permission: string;
  children: ReactNode;
}) {
  const auth = useAuth();
  return (
    <RequirePlatformAccess>
      {auth.platformPermissions.includes(permission) ? (
        children
      ) : (
        <FullPageStatus
          message="Your platform role does not permit access to this page."
          error
        />
      )}
    </RequirePlatformAccess>
  );
}
function FullPageStatus({
  message,
  error = false,
}: {
  message: string;
  error?: boolean;
}) {
  return (
    <main
      className="app-ambient grid min-h-screen place-items-center p-6 text-foreground"
      aria-live="polite"
    >
      <div
        className="max-w-md rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-center"
        role={error ? "alert" : "status"}
      >
        {!error && (
          <span
            className="mx-auto mb-4 block size-8 animate-spin rounded-full border-2 border-primary border-t-transparent"
            aria-hidden="true"
          />
        )}
        <p>{message}</p>
      </div>
    </main>
  );
}
