import { Lock, Wifi, WifiOff } from "lucide-react";
import { ImageWithFallback } from "../figma/ImageWithFallback";
import { cn } from "../ui/utils";

export function PhoneMockup({
  image,
  model,
  restricted,
  online,
  battery,
  className,
}: {
  image: string;
  model: string;
  restricted?: boolean;
  online?: boolean;
  battery?: number;
  className?: string;
}) {
  return (
    <div className={cn("relative mx-auto w-[190px]", className)}>
      <div className="relative rounded-[2.2rem] border border-white/12 bg-gradient-to-b from-white/10 to-white/[0.02] p-2 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.8)]">
        <div className="relative aspect-[9/19] overflow-hidden rounded-[1.7rem] bg-slate-900">
          <ImageWithFallback
            src={image}
            alt={model}
            className="size-full object-cover opacity-90"
          />
          {/* notch */}
          <div className="absolute left-1/2 top-2 h-1.5 w-16 -translate-x-1/2 rounded-full bg-black/60" />
          {/* status bar */}
          <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 pt-3 text-[10px] text-white/80">
            <span className="font-mono">9:41</span>
            <div className="flex items-center gap-1">
              {online ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}
              {typeof battery === "number" && (
                <span className="font-mono">{battery}%</span>
              )}
            </div>
          </div>
          {restricted && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[oklch(0.15_0.03_264/0.82)] backdrop-blur-sm">
              <div className="grid size-12 place-items-center rounded-full border border-[oklch(0.65_0.2_20/0.4)] bg-[oklch(0.65_0.2_20/0.18)] text-[oklch(0.78_0.19_20)]">
                <Lock className="size-5" />
              </div>
              <p className="px-6 text-center text-xs font-medium text-white">
                Device restricted — payment overdue
              </p>
            </div>
          )}
        </div>
      </div>
      <p className="mt-3 text-center text-sm font-medium text-muted-foreground">
        {model}
      </p>
    </div>
  );
}
