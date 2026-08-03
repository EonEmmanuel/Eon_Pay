import { GlassCard } from "./GlassCard";
import { cn } from "../ui/utils";

export function SectionCard({
  title,
  subtitle,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <GlassCard className={cn("p-0 overflow-hidden", className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 border-b border-white/8 px-5 py-4">
          <div>
            {title && <h3 className="font-semibold text-foreground">{title}</h3>}
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
            )}
          </div>
          {action}
        </div>
      )}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </GlassCard>
  );
}
