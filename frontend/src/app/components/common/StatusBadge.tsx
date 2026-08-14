import type { ReactNode } from "react";
import { cn } from "../ui/utils";

export type StatusTone = "success" | "warning" | "danger" | "info" | "gold" | "neutral";

const toneMap: Record<StatusTone, string> = {
  success:
    "bg-emerald-500/15 text-emerald-600 dark:text-[#00DF81] border-emerald-500/30",
  warning:
    "bg-amber-500/15 text-amber-600 dark:text-[#F59E0B] border-amber-500/30",
  danger:
    "bg-rose-500/15 text-rose-600 dark:text-[#EF4444] border-rose-500/30",
  info: "bg-sky-500/15 text-sky-600 dark:text-[#38BDF8] border-sky-500/30",
  gold: "bg-amber-500/15 text-amber-600 dark:text-[#F59E0B] border-amber-500/30",
  neutral: "bg-muted/60 text-muted-foreground border-border",
};

export function StatusBadge({
  tone = "neutral",
  children,
  className,
  dot = true,
}: {
  tone?: StatusTone;
  children: ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        toneMap[tone],
        className,
      )}
    >
      {dot && (
        <span className="size-1.5 rounded-full bg-current shadow-[0_0_8px_currentColor]" />
      )}
      {children}
    </span>
  );
}
