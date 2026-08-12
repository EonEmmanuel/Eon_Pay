import type { ReactNode } from "react";
import { cn } from "../ui/utils";

export type StatusTone = "success" | "warning" | "danger" | "info" | "gold" | "neutral";

const toneMap: Record<StatusTone, string> = {
  success:
    "bg-success/15 text-success border-success/30",
  warning:
    "bg-warning/15 text-warning border-warning/30",
  danger:
    "bg-danger/15 text-danger border-danger/30",
  info: "bg-info/15 text-info border-info/30",
  gold: "bg-gold/15 text-gold border-gold/30",
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
