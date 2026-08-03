import { GlassCard } from "./GlassCard";
import { TrendChip } from "./TrendChip";
import { MiniSparkline } from "./MiniSparkline";
import { cn } from "../ui/utils";
import type { LucideIcon } from "lucide-react";

export function KpiCard({
  label,
  value,
  delta,
  series,
  icon: Icon,
  id,
  color = "var(--chart-1)",
  invertTrend = false,
  accent,
}: {
  label: string;
  value: string;
  delta: number;
  series: number[];
  icon: LucideIcon;
  id: string;
  color?: string;
  invertTrend?: boolean;
  accent?: "emerald" | "gold";
}) {
  return (
    <GlassCard className="p-4" glow={undefined}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span
              className={cn(
                "grid size-8 place-items-center rounded-lg border border-white/10",
                accent === "gold" ? "text-[oklch(0.86_0.12_85)]" : "text-primary",
              )}
              style={{ background: `color-mix(in oklch, ${color} 14%, transparent)` }}
            >
              <Icon className="size-4" />
            </span>
            <span className="text-xs font-medium tracking-wide uppercase">{label}</span>
          </div>
          <div className="mt-3 font-mono text-[1.6rem] font-semibold tracking-tight tabular-nums text-foreground">
            {value}
          </div>
        </div>
        <TrendChip delta={delta} invert={invertTrend} />
      </div>
      <div className="mt-1 -mx-1">
        <MiniSparkline data={series} color={color} id={id} />
      </div>
    </GlassCard>
  );
}
