import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Building2,
  CreditCard,
  Hexagon,
  LayoutDashboard,
  ScrollText,
  Settings,
  ShieldCheck,
  ScanSearch,
  SlidersHorizontal,
  UsersRound,
} from "lucide-react";
import { NavLink } from "react-router";
import { getSystemHealth } from "../../lib/analytics";
import { useAuth } from "../../lib/auth";
import { listPlatformTenants, platformTenantsQueryKey } from "../../lib/platform";
import { cn } from "../ui/utils";
import { PlatformSwitcher } from "./PlatformSwitcher";

const nav = [
  {
    section: "Platform",
    items: [
      {
        to: "/admin",
        label: "Command Center",
        icon: LayoutDashboard,
        end: true,
        permission: "platform.tenants.read",
      },
      {
        to: "/admin/tenants",
        label: "Retailers",
        icon: Building2,
        permission: "platform.tenants.read",
      },
      {
        to: "/admin/billing",
        label: "Billing Readiness",
        icon: CreditCard,
        permission: "platform.billing.read",
      },
    ],
  },
  {
    section: "Governance",
    items: [
      {
        to: "/admin/kyb",
        label: "Retailer KYB",
        icon: ScanSearch,
        permission: "platform.kyb.read",
      },
      {
        to: "/admin/users",
        label: "Platform Users",
        icon: UsersRound,
        permission: "platform.users.read",
      },
      {
        to: "/admin/fleet",
        label: "Device Fleet",
        icon: ShieldCheck,
        permission: "platform.devices.read",
      },
      {
        to: "/admin/risk",
        label: "Risk & Policies",
        icon: SlidersHorizontal,
        permission: "platform.risk.read",
      },
    ],
  },
  {
    section: "Operations",
    items: [
      {
        to: "/admin/health",
        label: "System Health",
        icon: Activity,
        permission: "platform.health.read",
      },
      {
        to: "/admin/audit",
        label: "Audit Logs",
        icon: ScrollText,
        permission: "platform.audit.read",
      },
      {
        to: "/admin/settings",
        label: "Settings",
        icon: Settings,
        permission: "platform.settings.read",
      },
    ],
  },
];

export function AdminSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const auth = useAuth();
  const canReadHealth = auth.platformPermissions.includes("platform.health.read");
  const tenants = useQuery({
    queryKey: platformTenantsQueryKey,
    queryFn: listPlatformTenants,
  });
  const health = useQuery({
    queryKey: ["platform", "system-health"],
    queryFn: getSystemHealth,
    refetchInterval: 30_000,
    enabled: canReadHealth,
  });
  const down =
    health.data?.services.some((service) => service.status === "down") ?? false;
  const incomplete =
    health.data?.services.some((service) => service.status === "not_configured") ??
    false;
  return (
    <aside className="flex h-full w-[260px] flex-col border-r border-border bg-sidebar">
      <div className="flex items-center gap-2.5 px-5 pt-5">
        <div className="grid size-9 place-items-center rounded-xl bg-gold text-gold-foreground">
          <Hexagon className="size-5" strokeWidth={2.5} />
        </div>
        <div className="leading-tight">
          <div className="font-semibold tracking-tight">Zenith Platform</div>
          <div className="text-[11px] text-muted-foreground">Administration</div>
        </div>
      </div>
      <PlatformSwitcher onNavigate={onNavigate} />
      <nav className="scroll-slim mt-4 flex-1 space-y-6 overflow-y-auto px-3 py-2">
        {nav.map((group) => {
          const items = group.items.filter((item) =>
            auth.platformPermissions.includes(item.permission),
          );
          if (items.length === 0) return null;
          return (
            <div key={group.section}>
              <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {group.section}
              </div>
              <div className="space-y-0.5">
                {items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all",
                        isActive
                          ? "bg-accent text-foreground"
                          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-gold" />
                        )}
                        <item.icon
                          className={cn(
                            "size-[18px] shrink-0",
                            isActive && "text-gold",
                          )}
                        />
                        <span className="flex-1">{item.label}</span>
                        {item.to === "/admin/tenants" && tenants.data !== undefined && (
                          <span className="rounded-full bg-gold/15 px-1.5 py-0.5 font-mono text-[10px] text-gold">
                            {tenants.data.length}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </nav>
      {canReadHealth && (
        <div
          className="m-3 rounded-xl border border-border bg-muted/50 p-3"
          aria-live="polite"
        >
          {health.isPending ? (
            <>
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <span className="size-1.5 animate-pulse rounded-full bg-current" />
                Checking system health
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Connecting to the backend API...
              </p>
            </>
          ) : health.isError || health.data === undefined ? (
            <>
              <div className="flex items-center gap-2 text-xs font-medium text-destructive">
                <span className="size-1.5 rounded-full bg-current" />
                Backend API unreachable
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {health.error instanceof Error
                  ? health.error.message
                  : "The health endpoint did not return a response."}
              </p>
              <button
                type="button"
                className="mt-2 text-xs font-medium text-primary hover:underline"
                onClick={() => void health.refetch()}
              >
                Retry health check
              </button>
            </>
          ) : (
            <>
              <div
                className={`flex items-center gap-2 text-xs font-medium ${down ? "text-destructive" : incomplete ? "text-gold" : "text-primary"}`}
              >
                <span className="size-1.5 rounded-full bg-current" />
                {down
                  ? "Service outage"
                  : incomplete
                    ? "Provider setup incomplete"
                    : "All services operational"}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {
                  health.data.services.filter(
                    (service) => service.status === "operational",
                  ).length
                }{" "}
                of {health.data.services.length} checks operational
              </p>
            </>
          )}
        </div>
      )}
    </aside>
  );
}
