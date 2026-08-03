import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Building2,
  FileCheck2,
  LayoutDashboard,
  Package,
  PhoneCall,
  RefreshCcw,
  ScrollText,
  ShieldCheck,
  Users,
  UsersRound,
  Wallet,
  Zap,
} from "lucide-react";
import { NavLink } from "react-router";
import { getTenantAnalytics, tenantAnalyticsQueryKey } from "../../lib/analytics";
import { useAuth } from "../../lib/auth";
import { cn } from "../ui/utils";
import { PlatformSwitcher } from "./PlatformSwitcher";

const nav = [
  {
    section: "Operations",
    items: [
      {
        to: "/",
        label: "Overview",
        icon: LayoutDashboard,
        end: true,
        permission: "customers.read",
      },
      {
        to: "/customers",
        label: "Customers",
        icon: Users,
        permission: "customers.read",
      },
      {
        to: "/applications",
        label: "Applications",
        icon: FileCheck2,
        permission: "applications.read",
      },
      {
        to: "/inventory",
        label: "Retail Stock",
        icon: Package,
        permission: "inventory.read",
      },
    ],
  },
  {
    section: "Finance",
    items: [
      {
        to: "/contracts",
        label: "Contracts",
        icon: ScrollText,
        permission: "contracts.read",
      },
      {
        to: "/payments",
        label: "Payments & Ledger",
        icon: Wallet,
        permission: "payments.read",
      },
      {
        to: "/reconciliation",
        label: "Reconciliation",
        icon: RefreshCcw,
        permission: "payments.reconcile",
      },
      {
        to: "/collections",
        label: "Collections",
        icon: PhoneCall,
        permission: "payments.read",
      },
    ],
  },
  {
    section: "Administration",
    items: [
      {
        to: "/business-profile",
        label: "Business Profile",
        icon: Building2,
        permission: "tenant.manage",
      },
      {
        to: "/branches",
        label: "Branches",
        icon: Building2,
        permission: "branches.read",
      },
      {
        to: "/staff",
        label: "Retailer Staff",
        icon: UsersRound,
        permission: "memberships.read",
      },
    ],
  },
  {
    section: "Devices & Insight",
    items: [
      {
        to: "/devices",
        label: "Device Management",
        icon: ShieldCheck,
        permission: "devices.read",
      },
      {
        to: "/reports",
        label: "Reports",
        icon: BarChart3,
        permission: "contracts.read",
      },
    ],
  },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const auth = useAuth();
  const onboardingStatus = auth.memberships.find(
    (membership) => membership.tenantId === auth.tenantId,
  )?.onboardingStatus;
  const visibleNavigation = nav
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          auth.tenantPermissions.includes(item.permission) &&
          (onboardingStatus === undefined ||
            onboardingStatus === "active" ||
            item.to === "/business-profile"),
      ),
    }))
    .filter((group) => group.items.length > 0);
  const analytics = useQuery({
    queryKey: tenantAnalyticsQueryKey,
    queryFn: getTenantAnalytics,
    retry: false,
  });
  const badges: Record<string, number> = {
    "/applications": analytics.data?.summary.pendingApplications ?? 0,
    "/collections": analytics.data?.collections.length ?? 0,
  };
  return (
    <aside className="flex h-full w-[260px] flex-col border-r border-white/8 bg-sidebar">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-[oklch(0.78_0.15_168)] to-[oklch(0.72_0.13_205)] text-[oklch(0.18_0.03_264)]">
          <Zap className="size-5" strokeWidth={2.5} />
        </div>
        <div className="leading-tight">
          <div className="font-semibold tracking-tight">Zenith Finance</div>
          <div className="text-[11px] text-muted-foreground">Retail installments</div>
        </div>
      </div>
      <PlatformSwitcher onNavigate={onNavigate} />
      <nav className="scroll-slim mt-4 flex-1 space-y-6 overflow-y-auto px-3 py-2">
        {visibleNavigation.map((group) => (
          <div key={group.section}>
            <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {group.section}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all",
                      isActive
                        ? "bg-white/[0.06] text-foreground"
                        : "text-muted-foreground hover:bg-white/[0.03] hover:text-foreground",
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary" />
                      )}
                      <item.icon
                        className={cn(
                          "size-[18px] shrink-0",
                          isActive && "text-primary",
                        )}
                      />
                      <span className="flex-1">{item.label}</span>
                      {(badges[item.to] ?? 0) > 0 && (
                        <span className="rounded-full bg-primary/15 px-1.5 py-0.5 font-mono text-[10px] text-primary">
                          {badges[item.to]}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
      {analytics.data !== undefined && (
        <div className="m-3 rounded-xl border border-white/8 bg-white/[0.03] p-3">
          <div className="text-xs font-medium">Portfolio collection rate</div>
          <div className="mt-1 font-mono text-lg text-primary">
            {analytics.data.summary.collectionRate.toFixed(1)}%
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/8">
            <div
              className="h-full rounded-full bg-primary"
              style={{
                width: `${Math.min(100, analytics.data.summary.collectionRate)}%`,
              }}
            />
          </div>
        </div>
      )}
    </aside>
  );
}
