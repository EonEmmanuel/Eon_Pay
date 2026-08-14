import { useQuery } from "@tanstack/react-query";
import { Command, Download, Menu, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { getTenantAnalytics, tenantAnalyticsQueryKey } from "../../lib/analytics";
import { useAuth } from "../../lib/auth";
import { Button } from "../ui/button";
import { AccountMenu } from "./AccountMenu";

export function Topbar({ onMenu }: { onMenu?: () => void }) {
  const navigate = useNavigate();
  const auth = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const analytics = useQuery({
    queryKey: tenantAnalyticsQueryKey,
    queryFn: getTenantAnalytics,
    retry: false,
  });

  const results = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (normalized.length < 2 || analytics.data === undefined) return [];
    return [
      ...analytics.data.customers.map((customer) => ({
        key: `customer-${customer.id}`,
        label: customer.fullName,
        detail: customer.phone,
        to: `/customers/${customer.id}`,
      })),
      ...analytics.data.contracts.map((contract) => ({
        key: `contract-${contract.id}`,
        label: contract.customerName,
        detail: `Contract ${contract.id.slice(0, 8)}`,
        to: `/contracts/${contract.id}`,
      })),
      ...analytics.data.devices.map((device) => ({
        key: `device-${device.id}`,
        label:
          device.device === null
            ? device.imei
            : `${device.device.brand} ${device.device.model}`,
        detail: `${device.customerName} · ${device.imei}`,
        to: `/devices/${device.id}`,
      })),
    ]
      .filter((result) =>
        `${result.label} ${result.detail}`.toLowerCase().includes(normalized),
      )
      .slice(0, 8);
  }, [analytics.data, search]);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  function openResult(to: string) {
    navigate(to);
    setSearch("");
  }

  function exportSummary() {
    if (analytics.data === undefined) return;
    const rows = [["metric", "value"], ...Object.entries(analytics.data.summary)];
    const content = rows
      .map((row) =>
        row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","),
      )
      .join("\n");
    const url = URL.createObjectURL(
      new Blob([content], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "portfolio-summary.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-xl lg:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onMenu}
        aria-label="Open navigation"
      >
        <Menu className="size-5 icon-dynamic" />
      </Button>

      {/* Global Search Input */}
      <div className="relative hidden max-w-md flex-1 md:block group">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground icon-dynamic group-hover:text-primary" />
        <input
          ref={inputRef}
          aria-label="Search customers, contracts, and devices"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search customers, contracts, devices..."
          className="h-9 w-full rounded-xl border border-border bg-card pl-9 pr-14 text-xs outline-none transition-all focus:border-primary/50 focus:bg-background focus:ring-1 focus:ring-primary/20"
        />
        <kbd className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-md border border-border/80 bg-background/80 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground shadow-2xs">
          <Command className="size-2.5" />K
        </kbd>

        {search.trim().length >= 2 && (
          <div className="absolute left-0 right-0 top-11 overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
            {results.length === 0 ? (
              <div className="p-4 text-xs text-muted-foreground">
                No accessible records found.
              </div>
            ) : (
              results.map((result) => (
                <button
                  key={result.key}
                  onClick={() => openResult(result.to)}
                  className="block w-full border-b border-border px-4 py-2.5 text-left text-xs last:border-0 hover:bg-accent/60"
                >
                  <div className="font-semibold text-foreground">{result.label}</div>
                  <div className="text-[11px] text-muted-foreground">{result.detail}</div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Right Top Actions */}
      <div className="ml-auto flex items-center gap-2.5">
        {auth.tenantPermissions.includes("applications.create") && (
          <Button
            size="sm"
            className="group hidden sm:flex items-center gap-1.5 bg-primary text-primary-foreground font-semibold shadow-xs hover:bg-primary/90 text-xs h-9 rounded-xl px-3.5"
            onClick={() => navigate("/applications/new")}
          >
            <Plus className="size-3.5 icon-dynamic" /> New application
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={exportSummary}
          disabled={analytics.data === undefined}
          className="group hidden md:flex items-center gap-1.5 text-xs h-9 rounded-xl border-border hover:bg-accent"
        >
          <Download className="size-3.5 icon-dynamic" /> Export summary
        </Button>
        <AccountMenu />
      </div>
    </header>
  );
}
