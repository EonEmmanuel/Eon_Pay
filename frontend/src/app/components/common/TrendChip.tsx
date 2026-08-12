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
          ? "bg-success/15 text-success"
          : "bg-danger/15 text-danger",
      )}
    >
      {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      {Math.abs(delta)}%
    </span>
  );
}
