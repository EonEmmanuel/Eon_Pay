import { Signal, Wifi, BatteryFull } from "lucide-react";

export function MobileStatusBar() {
  return (
    <div className="flex shrink-0 items-center justify-between px-6 pt-3 pb-1 text-[11px] text-foreground/80">
      <span className="font-mono font-medium">9:41</span>
      <div className="flex items-center gap-1.5">
        <Signal className="size-3.5" />
        <Wifi className="size-3.5" />
        <BatteryFull className="size-4" />
      </div>
    </div>
  );
}
