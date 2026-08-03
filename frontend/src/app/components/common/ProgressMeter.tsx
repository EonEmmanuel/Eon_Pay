import { cn } from "../ui/utils";

export function ProgressMeter({
  value,
  className,
  tone = "emerald",
  showLabel = true,
}: {
  value: number; // 0-100
  className?: string;
  tone?: "emerald" | "gold" | "danger";
  showLabel?: boolean;
}) {
  const grad =
    tone === "gold"
      ? "linear-gradient(90deg, oklch(0.83 0.13 85), oklch(0.88 0.1 95))"
      : tone === "danger"
        ? "linear-gradient(90deg, oklch(0.6 0.2 20), oklch(0.7 0.18 30))"
        : "linear-gradient(90deg, oklch(0.72 0.15 168), oklch(0.74 0.13 205))";
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/8">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${Math.min(100, Math.max(0, value))}%`,
            background: grad,
            boxShadow: "0 0 12px -2px currentColor",
          }}
        />
      </div>
      {showLabel && (
        <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
          {Math.round(value)}%
        </span>
      )}
    </div>
  );
}
