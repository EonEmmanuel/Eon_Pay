import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "../ui/utils";

export function TrendChip({
  delta,
  invert = false,
}: {
  delta: number;
  invert?: boolean;
}) {
  const up = delta >= 0;
  // For metrics where "down is good" (e.g. overdue), invert the color logic.
  const good = invert ? !up : up;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums",
        good
          ? "bg-[oklch(0.76_0.15_162/0.14)] text-[oklch(0.82_0.15_162)]"
          : "bg-[oklch(0.65_0.2_20/0.14)] text-[oklch(0.74_0.19_20)]",
      )}
    >
      {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      {Math.abs(delta)}%
    </span>
  );
}
