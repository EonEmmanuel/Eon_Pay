import type { ReactNode } from "react";
import { cn } from "../ui/utils";

export type StatusTone = "success" | "warning" | "danger" | "info" | "gold" | "neutral";

const toneMap: Record<StatusTone, string> = {
  success:
    "bg-[oklch(0.76_0.15_162/0.15)] text-[oklch(0.82_0.15_162)] border-[oklch(0.76_0.15_162/0.3)]",
  warning:
    "bg-[oklch(0.83_0.14_82/0.15)] text-[oklch(0.86_0.13_85)] border-[oklch(0.83_0.14_82/0.3)]",
  danger:
    "bg-[oklch(0.65_0.2_20/0.15)] text-[oklch(0.74_0.19_20)] border-[oklch(0.65_0.2_20/0.32)]",
  info: "bg-[oklch(0.72_0.13_220/0.15)] text-[oklch(0.78_0.12_220)] border-[oklch(0.72_0.13_220/0.3)]",
  gold: "bg-[oklch(0.83_0.13_85/0.14)] text-[oklch(0.86_0.12_85)] border-[oklch(0.83_0.13_85/0.3)]",
  neutral: "bg-white/5 text-muted-foreground border-white/10",
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
