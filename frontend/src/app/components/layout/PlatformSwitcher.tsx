import { useNavigate, useLocation } from "react-router";
import { Building2, ShieldHalf, Smartphone } from "lucide-react";
import { useAuth } from "../../lib/auth";
import { cn } from "../ui/utils";

// Shows only application surfaces authorized for the signed-in account.
export function PlatformSwitcher({ onNavigate }: { onNavigate?: () => void }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isAdmin = pathname.startsWith("/admin");
  const isApp = pathname.startsWith("/customer");

  const go = (to: string) => {
    navigate(to);
    onNavigate?.();
  };

  const options = [
    ...(auth.tenantId === undefined
      ? []
      : [
          {
            label: "Retailer",
            icon: Building2,
            active: !isAdmin && !isApp,
            to: "/",
          },
          {
            label: "Customer",
            icon: Smartphone,
            active: isApp,
            to: "/customer",
          },
        ]),
    ...(auth.platformAccess
      ? [
          {
            label: "Platform",
            icon: ShieldHalf,
            active: isAdmin,
            to: "/admin",
          },
        ]
      : []),
  ];

  return (
    <div
      className="mx-3 mt-3 grid gap-1 rounded-xl border border-white/8 bg-white/[0.03] p-1"
      style={{
        gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
      }}
    >
      {options.map((o) => (
        <button
          key={o.label}
          type="button"
          onClick={() => go(o.to)}
          aria-current={o.active ? "page" : undefined}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-all",
            o.active
              ? "bg-primary/15 text-primary shadow-[inset_0_0_0_1px_var(--primary)]"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <o.icon className="size-3.5" />
          {o.label}
        </button>
      ))}
    </div>
  );
}
