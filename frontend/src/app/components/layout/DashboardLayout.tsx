import { useState } from "react";
import { Outlet } from "react-router";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { SupportChatWidget } from "./SupportChatWidget";
import { Sheet, SheetContent } from "../ui/sheet";
import { cn } from "../ui/utils";

export function DashboardLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="app-ambient fixed inset-0 flex h-full w-full overflow-hidden overscroll-none text-foreground select-none">
      <a
        href="#main-content"
        className="fixed left-3 top-3 z-[100] -translate-y-20 rounded-lg bg-primary px-3 py-2 text-primary-foreground transition-transform focus:translate-y-0"
      >
        Skip to main content
      </a>

      {/* Desktop sidebar with fixed viewport height and internal scrolling */}
      <div className={cn("hidden lg:block shrink-0 h-full overflow-hidden transition-all duration-300", collapsed ? "w-[72px]" : "w-[272px]")}>
        <Sidebar collapsed={collapsed} onToggleCollapse={() => setCollapsed((prev) => !prev)} />
      </div>

      {/* Mobile sidebar drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[272px] h-full border-border bg-sidebar p-0 overflow-hidden">
          <Sidebar onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 min-h-0 flex-1 h-full flex-col overflow-hidden">
        <div className="shrink-0">
          <Topbar onMenu={() => setMobileOpen(true)} />
        </div>
        <main
          id="main-content"
          tabIndex={-1}
          className="no-scrollbar flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 lg:px-6"
        >
          <div className="mx-auto max-w-[1440px]">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Global Bottom-Right Support Chat & Assistant Widget */}
      <SupportChatWidget />
    </div>
  );
}
