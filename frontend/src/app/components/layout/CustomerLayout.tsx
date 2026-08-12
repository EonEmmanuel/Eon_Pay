import { Outlet, useNavigate, useLocation } from "react-router";
import { Building2, ShieldHalf, Smartphone, Sparkles } from "lucide-react";
import { MobileStatusBar } from "../mobile/MobileStatusBar";
import { MobileTabBar } from "../mobile/MobileTabBar";
import { cn } from "../ui/utils";

// Compact platform switcher shown beside the phone frame on desktop.
function DesktopSwitcher() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const opts = [
    { label: "Retailer", icon: Building2, to: "/", active: false },
    { label: "Platform", icon: ShieldHalf, to: "/admin", active: false },
    {
      label: "Customer",
      icon: Smartphone,
      to: "/customer",
      active: pathname.startsWith("/customer"),
    },
  ];
  return (
    <div className="hidden flex-col gap-1 lg:flex">
      {opts.map((o) => (
        <button
          key={o.label}
          onClick={() => navigate(o.to)}
          className={cn(
            "flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all",
            o.active
              ? "border-primary/40 bg-primary/12 text-primary"
              : "border-border bg-muted/50 text-muted-foreground hover:text-foreground",
          )}
        >
          <o.icon className="size-4" /> {o.label}
        </button>
      ))}
    </div>
  );
}

export function CustomerLayout() {
  const navigate = useNavigate();

  return (
    <div className="app-ambient flex min-h-screen w-full items-center justify-center gap-10 overflow-hidden p-0 text-foreground lg:p-8">
      <a
        href="#main-content"
        className="sr-only z-[100] rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to main content
      </a>
      <div className="hidden max-w-xs lg:block">
        <h2 className="text-gradient-emerald text-2xl font-bold tracking-tight">
          Zenith Pay
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The borrower app — track your plan, pay installments, and manage your financed
          device from anywhere.
        </p>
        <div className="mt-6">
          <DesktopSwitcher />
        </div>
        <button
          onClick={() => navigate("/onboarding")}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
        >
          <Sparkles className="size-4" /> Start new application
        </button>
      </div>

      {/* Phone frame on desktop, full-bleed on mobile */}
      <div className="relative h-screen w-full lg:h-[860px] lg:w-[400px] lg:shrink-0">
        <div className="relative flex h-full w-full flex-col overflow-hidden bg-[oklch(0.15_0.026_264)] lg:rounded-[2.6rem] lg:border-[10px] lg:border-[oklch(0.24_0.02_264)] lg:shadow-[0_50px_120px_-40px_rgba(0,0,0,0.9)]">
          {/* notch */}
          <div className="pointer-events-none absolute left-1/2 top-0 z-20 hidden h-6 w-36 -translate-x-1/2 rounded-b-2xl bg-[oklch(0.24_0.02_264)] lg:block" />
          <MobileStatusBar />
          <main
            id="main-content"
            tabIndex={-1}
            className="scroll-slim flex-1 overflow-y-auto overflow-x-hidden px-5 pb-6 pt-2"
          >
            <Outlet />
          </main>
          <MobileTabBar />
        </div>
      </div>
    </div>
  );
}
