import {
  Building2,
  ChevronRight,
  CreditCard,
  ExternalLink,
  FileCode2,
  FileText,
  HelpCircle,
  Laptop,
  LifeBuoy,
  LoaderCircle,
  LogOut,
  Moon,
  Settings,
  Shield,
  ShieldCheck,
  Sun,
  User,
  UserCircle,
  X,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useAuth } from "../../lib/auth";
import { useTheme } from "../../lib/theme-provider";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { cn } from "../ui/utils";

export function AccountMenu({
  platform = false,
  trigger,
  align = "end",
  side = "bottom",
}: {
  platform?: boolean;
  trigger?: React.ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
}) {
  const auth = useAuth();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [signingOut, setSigningOut] = useState(false);

  // Modals for Docs and Terms
  const [docsOpen, setDocsOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);

  const displayEmail =
    auth.session?.user?.email || "lementalistsupreme019@gmail.com";
  const membership = auth.memberships.find(
    (candidate) => candidate.tenantId === auth.tenantId,
  );
  const orgName = platform
    ? "Platform Admin"
    : (membership?.tenantName || "Financial_Service");
  const orgInitial = orgName ? orgName[0].toUpperCase() : "F";

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await auth.signOut();
      toast.success("Successfully logged out");
    } catch (err: any) {
      toast.error(err?.message || "Failed to log out");
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {trigger ? (
            trigger
          ) : (
            <button
              type="button"
              className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 py-1 pl-1.5 pr-2.5 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              aria-label={"Open account menu for " + displayEmail}
            >
              <div className="grid size-7 place-items-center rounded-full bg-foreground text-background font-bold text-xs">
                {orgInitial}
              </div>
              <div className="hidden text-left leading-tight lg:block">
                <div className="max-w-28 truncate text-xs font-semibold text-foreground">
                  {orgName}
                </div>
                <div className="max-w-28 truncate text-[10px] text-muted-foreground">
                  {displayEmail}
                </div>
              </div>
              <ChevronRight className="hidden size-3.5 text-muted-foreground lg:block" />
            </button>
          )}
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align={align}
          side={side}
          sideOffset={8}
          className="w-[280px] rounded-2xl border border-border bg-popover/98 p-1 text-xs shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150 text-popover-foreground select-none"
        >
          {/* User Email Header */}
          <div className="px-3 pt-2.5 pb-1 text-[11px] font-normal text-muted-foreground truncate">
            {displayEmail}
          </div>

          {/* Organization Card Banner */}
          <div
            onClick={() => navigate("/business-profile")}
            className="mx-1 my-1 flex cursor-pointer items-center justify-between rounded-xl p-2 transition-colors hover:bg-accent/70"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="grid size-9 shrink-0 place-items-center rounded-full bg-foreground text-background font-bold text-sm shadow-xs">
                {orgInitial}
              </div>
              <div className="min-w-0 leading-snug">
                <div className="font-bold text-xs text-foreground truncate">
                  {orgName}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Organization
                </div>
              </div>
            </div>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </div>

          <DropdownMenuSeparator className="my-1 bg-border/60" />

          {/* Settings Section */}
          <div className="space-y-0.5 px-1 py-0.5">
            <DropdownMenuItem
              onClick={() => navigate("/business-profile")}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium cursor-pointer transition-colors hover:bg-accent text-foreground"
            >
              <Building2 className="size-4 text-muted-foreground" />
              <span>Organization Settings</span>
            </DropdownMenuItem>

            <DropdownMenuItem
              onClick={() => navigate("/staff")}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium cursor-pointer transition-colors hover:bg-accent text-foreground"
            >
              <UserCircle className="size-4 text-muted-foreground" />
              <span>Account Settings</span>
            </DropdownMenuItem>
          </div>

          <DropdownMenuSeparator className="my-1 bg-border/60" />

          {/* Theme Switcher Row with 3 Segments (Light, Dark, System) */}
          <div className="flex items-center justify-between px-2.5 py-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Theme
            </span>
            <div className="flex items-center gap-0.5 rounded-lg border border-border/80 bg-muted/40 p-0.5">
              <button
                type="button"
                onClick={() => setTheme("light")}
                title="Light mode"
                className={cn(
                  "grid size-6 place-items-center rounded-md transition-all",
                  theme === "light"
                    ? "bg-card text-foreground shadow-xs border border-border/60"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Sun className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setTheme("dark")}
                title="Dark mode"
                className={cn(
                  "grid size-6 place-items-center rounded-md transition-all",
                  theme === "dark"
                    ? "bg-card text-foreground shadow-xs border border-border/60"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Moon className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setTheme("system")}
                title="System default"
                className={cn(
                  "grid size-6 place-items-center rounded-md transition-all",
                  theme === "system"
                    ? "bg-card text-foreground shadow-xs border border-border/60"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Laptop className="size-3.5" />
              </button>
            </div>
          </div>

          <DropdownMenuSeparator className="my-1 bg-border/60" />

          {/* Info, Docs & Help */}
          <div className="space-y-0.5 px-1 py-0.5">
            <DropdownMenuItem
              onClick={() => setTermsOpen(true)}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium cursor-pointer transition-colors hover:bg-accent text-foreground"
            >
              <ShieldCheck className="size-4 text-muted-foreground" />
              <span>Terms & Policies</span>
            </DropdownMenuItem>

            <DropdownMenuItem
              onClick={() => setDocsOpen(true)}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium cursor-pointer transition-colors hover:bg-accent text-foreground"
            >
              <FileCode2 className="size-4 text-muted-foreground" />
              <span>Developer docs</span>
            </DropdownMenuItem>

            <DropdownMenuItem
              onClick={() => {
                const triggerBtn = document.querySelector(
                  'button[title="EonPay Support Assistant"]',
                ) as HTMLButtonElement | null;
                if (triggerBtn) {
                  triggerBtn.click();
                } else {
                  toast.info("EonPay Official Support is ready to assist.");
                }
              }}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium cursor-pointer transition-colors hover:bg-accent text-foreground"
            >
              <LifeBuoy className="size-4 text-muted-foreground" />
              <span>Help</span>
            </DropdownMenuItem>
          </div>

          <DropdownMenuSeparator className="my-1 bg-border/60" />

          {/* Logout Action */}
          <div className="px-1 py-0.5">
            <DropdownMenuItem
              disabled={signingOut}
              onClick={() => void handleSignOut()}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 cursor-pointer transition-colors hover:bg-rose-500/10 focus:bg-rose-500/10 focus:text-rose-500"
            >
              {signingOut ? (
                <LoaderCircle className="size-4 animate-spin text-rose-500" />
              ) : (
                <LogOut className="size-4 text-rose-500" />
              )}
              <span>{signingOut ? "Logging out..." : "Logout"}</span>
            </DropdownMenuItem>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 1. Developer Docs Dialog */}
      <Dialog open={docsOpen} onOpenChange={setDocsOpen}>
        <DialogContent className="rounded-3xl border-border bg-popover max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <FileCode2 className="size-4 text-primary" /> Developer Documentation
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              REST APIs, Webhooks, and Knox telemetry endpoints for EonPay.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-1.5">
              <div className="font-mono font-bold text-foreground text-[11px]">API Base URL:</div>
              <div className="font-mono text-[11px] text-muted-foreground bg-card p-2 rounded-lg border border-border/60 select-all">
                https://api.eonpay.africa/v1
              </div>
            </div>
            <div className="space-y-2 text-muted-foreground leading-relaxed">
              <p>
                <strong>Authentication:</strong> Pass your Tenant Bearer token in the <code>Authorization</code> header.
              </p>
              <p>
                <strong>Webhooks:</strong> Configured for real-time mobile money settlement callbacks and Knox lock status events with SHA-256 HMAC verification.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              size="sm"
              onClick={() => {
                setDocsOpen(false);
                toast.success("API keys & docs reference copied to clipboard");
              }}
              className="w-full rounded-xl text-xs"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 2. Terms & Policies Dialog */}
      <Dialog open={termsOpen} onOpenChange={setTermsOpen}>
        <DialogContent className="rounded-3xl border-border bg-popover max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" /> Terms & Privacy Policies
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Regulatory compliance, consumer credit terms, and ISO/IEC 27001 data protection standards.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2.5 py-2 text-xs leading-relaxed text-muted-foreground max-h-60 overflow-y-auto no-scrollbar">
            <p>
              <strong>1. Data Governance:</strong> All customer national identification documents and Didit biometric verifications are encrypted in compliance with GDPR and CEMAC banking regulations.
            </p>
            <p>
              <strong>2. Knox Telemetry:</strong> Device Owner agents enforce loan security policies strictly in accordance with retailer finance contracts.
            </p>
            <p>
              <strong>3. Audited Ledgers:</strong> All transactions, reversals, and underwriting decisions produce immutable cryptographic audit trails.
            </p>
          </div>
          <DialogFooter>
            <Button
              size="sm"
              onClick={() => setTermsOpen(false)}
              className="w-full rounded-xl text-xs"
            >
              Understood
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
