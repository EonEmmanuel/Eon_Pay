import { useQuery } from "@tanstack/react-query";
import { Command, Menu, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { listPlatformTenants, platformTenantsQueryKey } from "../../lib/platform";
import { Button } from "../ui/button";
import { NotificationCenter } from "./NotificationCenter";
import { AccountMenu } from "./AccountMenu";

export function AdminTopbar({ onMenu }: { onMenu?: () => void }) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const tenants = useQuery({
    queryKey: platformTenantsQueryKey,
    queryFn: listPlatformTenants,
  });
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
  const results = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (normalized.length < 2) return [];
    return (tenants.data ?? [])
      .filter((tenant) =>
        `${tenant.name} ${tenant.slug} ${tenant.id}`.toLowerCase().includes(normalized),
      )
      .slice(0, 8);
  }, [search, tenants.data]);
  function openTenant(id: string) {
    navigate(`/admin/tenants/${id}`);
    setSearch("");
  }
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-white/8 bg-[oklch(0.17_0.028_264/0.72)] px-4 backdrop-blur-xl lg:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onMenu}
        aria-label="Open navigation"
      >
        <Menu className="size-5" />
      </Button>
      <div className="relative hidden max-w-md flex-1 md:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          aria-label="Search retailers"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search retailers..."
          className="h-10 w-full rounded-xl border border-white/8 bg-white/[0.04] pl-9 pr-16 text-sm outline-none focus:border-[oklch(0.83_0.13_85/0.5)]"
        />
        <kbd className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          <Command className="size-2.5" />K
        </kbd>
        {search.trim().length >= 2 && (
          <div className="absolute left-0 right-0 top-12 overflow-hidden rounded-xl border border-white/10 bg-sidebar shadow-2xl">
            {results.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">
                No retailers found.
              </div>
            ) : (
              results.map((tenant) => (
                <button
                  key={tenant.id}
                  onClick={() => openTenant(tenant.id)}
                  className="block w-full border-b border-white/6 px-4 py-3 text-left last:border-0 hover:bg-white/[0.04]"
                >
                  <div className="text-sm font-medium">{tenant.name}</div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {tenant.slug}
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <NotificationCenter platform />
        <AccountMenu platform />
      </div>
    </header>
  );
}
