import {
  ChevronDown,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Settings,
  Store,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../../lib/auth";
import { Avatar, AvatarFallback } from "../ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

export function AccountMenu({ platform = false }: { platform?: boolean }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const displayName = auth.session?.user.email ?? "Signed-in user";
  const membership = auth.memberships.find(
    (candidate) => candidate.tenantId === auth.tenantId,
  );

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await auth.signOut();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.04] py-1 pl-1 pr-2 transition-colors hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          aria-label={"Open account menu for " + displayName}
        >
          <Avatar className="size-8">
            <AvatarFallback
              className={
                platform
                  ? "bg-[oklch(0.83_0.13_85)] text-xs font-semibold text-[oklch(0.18_0.03_264)]"
                  : "bg-primary text-xs font-semibold text-primary-foreground"
              }
            >
              {initials(displayName)}
            </AvatarFallback>
          </Avatar>
          <div className="hidden text-left leading-tight lg:block">
            <div className="max-w-32 truncate text-xs font-semibold">{displayName}</div>
            <div className="max-w-32 truncate text-[10px] text-muted-foreground">
              {platform
                ? "Platform administration"
                : (membership?.tenantName ?? "Organization")}
            </div>
          </div>
          <ChevronDown className="hidden size-4 text-muted-foreground lg:block" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 border-white/10 bg-sidebar">
        <DropdownMenuLabel className="min-w-0">
          <div className="truncate text-sm">My account</div>
          <div className="truncate text-xs font-normal text-muted-foreground">
            {displayName}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {platform && membership !== undefined && (
          <DropdownMenuItem onSelect={() => navigate("/")}>
            <Store className="size-4" />
            Retailer workspace
          </DropdownMenuItem>
        )}
        {!platform && auth.tenantPermissions.includes("tenant.manage") && (
          <DropdownMenuItem onSelect={() => navigate("/business-profile")}>
            <Store className="size-4" />
            Business profile
          </DropdownMenuItem>
        )}
        {!platform && auth.platformAccess && (
          <DropdownMenuItem onSelect={() => navigate("/admin")}>
            <LayoutDashboard className="size-4" />
            Platform administration
          </DropdownMenuItem>
        )}
        {platform && auth.platformPermissions.includes("platform.settings.read") && (
          <DropdownMenuItem onSelect={() => navigate("/admin/settings")}>
            <Settings className="size-4" />
            Platform settings
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={signingOut}
          onSelect={() => void signOut()}
        >
          {signingOut ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <LogOut className="size-4" />
          )}
          {signingOut ? "Signing out..." : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function initials(value: string) {
  return value
    .split(/[@.\s_-]+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
