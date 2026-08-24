import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Bell,
  Building2,
  ChevronDown,
  FileCheck2,
  LayoutGrid,
  LogOut,
  Moon,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  PhoneCall,
  RefreshCcw,
  ScrollText,
  Settings,
  Shield,
  ShieldCheck,
  Smartphone,
  Store,
  Sun,
  TrendingUp,
  Users,
  UsersRound,
  Wallet,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { getTenantAnalytics, tenantAnalyticsQueryKey } from "../../lib/analytics";
import { useAuth } from "../../lib/auth";
import { useTheme } from "../../lib/theme-provider";
import { AccountMenu } from "./AccountMenu";
import { NotificationCenter } from "./NotificationCenter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { cn } from "../ui/utils";

// Complete original navigation sections and tabs with dedicated motion classes
const nav = [
  {
    section: "Operations",
    items: [
      {
        to: "/overview",
        label: "Overview",
        icon: LayoutGrid,
        animClass: "anim-grid",
        end: true,
        permission: "customers.read",
      },
      {
        to: "/customers",
        label: "Customers",
        icon: Users,
        animClass: "anim-users",
        permission: "customers.read",
      },
      {
        to: "/applications",
        label: "Applications",
        icon: FileCheck2,
        animClass: "anim-doc",
        permission: "applications.read",
      },
      {
        to: "/inventory",
        label: "Financed Inventory",
        icon: Package,
        animClass: "anim-box",
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
        animClass: "anim-doc",
        permission: "contracts.read",
      },
      {
        to: "/payments",
        label: "Payments & Ledger",
        icon: Wallet,
        animClass: "anim-wallet",
        permission: "payments.read",
      },
      {
        to: "/reconciliation",
        label: "Reconciliation",
        icon: RefreshCcw,
        animClass: "anim-refresh",
        permission: "payments.reconcile",
      },
      {
        to: "/collections",
        label: "Collections",
        icon: PhoneCall,
        animClass: "anim-phone",
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
        animClass: "anim-building",
        permission: "tenant.manage",
      },
      {
        to: "/branches",
        label: "Branches",
        icon: Store,
        animClass: "anim-building",
        permission: "branches.read",
      },
      {
        to: "/staff",
        label: "Retailer Staff",
        icon: UsersRound,
        animClass: "anim-users",
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
        animClass: "anim-shield",
        permission: "devices.read",
      },
      {
        to: "/reports",
        label: "Reports",
        icon: BarChart3,
        animClass: "anim-chart",
        permission: "contracts.read",
      },
    ],
  },
];

export function Sidebar({
  onNavigate,
  collapsed = false,
  onToggleCollapse,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const auth = useAuth();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [signingOut, setSigningOut] = useState(false);

  // Optional keyboard shortcut Cmd+B / Ctrl+B to toggle sidebar collapse
  useEffect(() => {
    if (!onToggleCollapse) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        onToggleCollapse();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onToggleCollapse]);

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

  const collectionRate = analytics.data?.summary.collectionRate ?? 93.4;
  const userDisplayName = auth.session?.user.email ?? "klementaits.supreme";
  const organizationName =
    auth.memberships.find((m) => m.tenantId === auth.tenantId)?.tenantName ?? "LongLife";

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await auth.signOut();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <aside
      className={cn(
        "flex h-full max-h-screen flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-300 overflow-hidden select-none",
        collapsed ? "w-[72px]" : "w-[272px]",
      )}
    >
      {/* Brand Header with Modern Collapse Toggle (Pinned Top) */}
      <div
        className={cn(
          "shrink-0 flex items-center pt-5 pb-3",
          collapsed ? "flex-col gap-2.5 px-2 items-center" : "justify-between px-5",
        )}
      >
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={collapsed ? onToggleCollapse : undefined}
            title={collapsed ? "Click to expand sidebar" : undefined}
            className="group grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm transition-transform hover:scale-110 active:scale-95"
          >
            <Zap className="size-5.5 anim-zap" strokeWidth={2.5} />
          </button>
          {!collapsed && (
            <div className="leading-tight truncate">
              <div className="font-bold tracking-tight text-foreground text-base">Zenith Finance</div>
              <div className="text-xs text-muted-foreground">Retail installments</div>
            </div>
          )}
        </div>
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="group grid size-8.5 shrink-0 place-items-center rounded-xl border border-border/70 bg-card/60 text-muted-foreground transition-all duration-200 hover:border-primary/40 hover:bg-sidebar-accent hover:text-foreground hover:scale-105 active:scale-95 shadow-2xs"
            title={collapsed ? "Expand sidebar (⌘B)" : "Collapse sidebar (⌘B)"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4.5 text-primary anim-doc" />
            ) : (
              <PanelLeftClose className="size-4.5 anim-doc group-hover:text-primary" />
            )}
          </button>
        )}
      </div>

      {/* Small Compact Role Selector Pill (Pinned Top) */}
      <div className={cn("shrink-0 py-2", collapsed ? "px-2 flex justify-center" : "px-5")}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "group inline-flex items-center gap-1.5 rounded-lg border border-border bg-card text-xs font-medium text-foreground transition-all hover:bg-muted/60 hover:border-primary/40",
                collapsed ? "p-2 justify-center" : "px-3 py-1.5",
              )}
              title="Retailer workspace"
            >
              <Store className="size-3.5 text-emerald-500 shrink-0 anim-building" />
              {!collapsed && <span>Retailer</span>}
              {!collapsed && <ChevronDown className="size-3.5 text-muted-foreground ml-0.5" />}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={collapsed ? "center" : "start"} className="w-52 border-border bg-popover">
            <DropdownMenuItem onClick={() => navigate("/overview")} className="gap-2 text-xs cursor-pointer">
              <span className="size-2 rounded-full bg-primary" />
              Retailer Workspace
            </DropdownMenuItem>
            {auth.platformAccess && (
              <DropdownMenuItem onClick={() => navigate("/admin")} className="gap-2 text-xs cursor-pointer">
                <span className="size-2 rounded-full bg-muted-foreground" />
                Platform Administration
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => navigate("/customer")} className="gap-2 text-xs cursor-pointer">
              <span className="size-2 rounded-full bg-muted-foreground" />
              Customer Portal
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Middle Scrollable Section: Navigation Groups ONLY */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain no-scrollbar">
        {/* Navigation Groups */}
        <nav className="space-y-3 px-3.5 py-2">
          {visibleNavigation.map((group) => (
            <div key={group.section}>
              {!collapsed && (
                <div className="px-3 pb-1.5 pt-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/85">
                  {group.section}
                </div>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      cn(
                        "group relative flex items-center rounded-xl text-[13.5px] font-medium transition-all duration-150",
                        collapsed ? "justify-center p-2.5" : "gap-3 px-3.5 py-2",
                        isActive
                          ? "bg-sidebar-accent font-semibold text-foreground shadow-xs"
                          : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <item.icon
                          className={cn(
                            "size-4.5 shrink-0",
                            item.animClass,
                            isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                          )}
                        />
                        {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                        {!collapsed && (badges[item.to] ?? 0) > 0 && (
                          <span className="rounded-full bg-primary/15 px-2 py-0.5 font-mono text-[11px] font-semibold text-primary">
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
      </div>

      {/* Portfolio Collection Rate Mini-Widget (Pinned & NEVER Scrollable) */}
      {!collapsed && (
        <div className="shrink-0 border-t border-border/50 p-3 bg-sidebar">
          <div className="rounded-2xl border border-border bg-card p-3.5 shadow-2xs transition-all hover:border-primary/30">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground">Portfolio collection rate</span>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-mono text-xl font-bold tracking-tight text-primary">
                {collectionRate.toFixed(1)}%
              </span>
              <span className="flex items-center text-[10px] font-semibold text-primary">
                <TrendingUp className="mr-0.5 size-3 anim-chart" />
                +4.7pp <span className="ml-1 text-muted-foreground font-normal">vs last month</span>
              </span>
            </div>

            {/* Matching Mini Area Chart Trend */}
            <div className="my-2 h-8 w-full min-w-0">
              <ResponsiveContainer width="100%" height={32} minWidth={0} minHeight={0}>
                <AreaChart
                  data={[
                    { r: 84 },
                    { r: 85 },
                    { r: 88 },
                    { r: 87 },
                    { r: 90 },
                    { r: 89 },
                    { r: 93.4 },
                  ]}
                  margin={{ top: 2, right: 2, left: 2, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="sidebarRateGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#00DF81" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#00DF81" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="r"
                    stroke="#00DF81"
                    strokeWidth={2}
                    fill="url(#sidebarRateGrad)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Target Progress Bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Target: 90%</span>
                <span className="font-semibold text-foreground">{Math.min(100, Math.round(collectionRate))}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${Math.min(100, collectionRate)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar Footer Bar (Pinned Bottom) */}
      <div
        className={cn(
          "shrink-0 border-t border-border py-3 transition-all",
          collapsed
            ? "flex flex-col items-center gap-2.5 px-2"
            : "flex items-center justify-between px-4.5",
        )}
      >
        {/* Theme Toggle Button */}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label="Toggle light/dark theme"
          title="Toggle light/dark theme"
          className="group grid size-8.5 shrink-0 place-items-center rounded-lg text-muted-foreground transition-all hover:bg-sidebar-accent hover:text-foreground"
        >
          {theme === "dark" ? (
            <Sun className="size-4.5 anim-sun text-muted-foreground group-hover:text-amber-400" />
          ) : (
            <Sun className="size-4.5 anim-sun text-muted-foreground group-hover:text-amber-500" />
          )}
        </button>

        {/* Action Group: Bell Notifications and Gear Settings */}
        <div className={cn("flex items-center", collapsed ? "flex-col gap-2.5" : "gap-2.5")}>
          {/* Notifications Popover Center */}
          <NotificationCenter
            side={collapsed ? "right" : "top"}
            align={collapsed ? "center" : "end"}
          />

          {/* Account & Platform Settings Popover */}
          <AccountMenu
            side={collapsed ? "right" : "top"}
            align={collapsed ? "center" : "end"}
            trigger={
              <button
                type="button"
                className="group grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition-all hover:bg-sidebar-accent hover:text-foreground hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/40"
                aria-label="Platform & Account Settings"
                title="Platform & Account Settings"
              >
                <Settings className="size-4 anim-gear text-muted-foreground group-hover:text-foreground" />
              </button>
            }
          />
        </div>
      </div>
    </aside>
  );
}
