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
      ? "var(--gold)"
      : tone === "danger"
        ? "var(--danger)"
        : "var(--primary)";
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
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
