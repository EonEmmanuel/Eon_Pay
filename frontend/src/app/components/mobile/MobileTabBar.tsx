import { NavLink } from "react-router";
import { Home, CreditCard, ScrollText, Smartphone, User } from "lucide-react";
import { cn } from "../ui/utils";

const tabs = [
  { to: "/customer", label: "Home", icon: Home, end: true },
  { to: "/customer/pay", label: "Pay", icon: CreditCard },
  { to: "/customer/contract", label: "Plan", icon: ScrollText },
  { to: "/customer/device", label: "Device", icon: Smartphone },
  { to: "/customer/profile", label: "Profile", icon: User },
];

export function MobileTabBar() {
  return (
    <nav className="shrink-0 border-t border-white/8 bg-[oklch(0.17_0.028_264/0.9)] px-2 pb-2 pt-1.5 backdrop-blur-xl">
      <div className="flex items-center justify-between">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              cn(
                "flex flex-1 flex-col items-center gap-1 rounded-xl py-1.5 text-[10px] font-medium transition-colors",
                isActive ? "text-primary" : "text-muted-foreground",
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={cn(
                    "grid size-8 place-items-center rounded-xl transition-colors",
                    isActive && "bg-primary/15",
                  )}
                >
                  <t.icon className="size-[18px]" />
                </span>
                {t.label}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
