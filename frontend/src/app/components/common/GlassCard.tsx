import { cn } from "../ui/utils";
import { motion } from "motion/react";

export function GlassCard({
  className,
  children,
  glow,
  hover = true,
  ...props
}: React.ComponentProps<typeof motion.div> & {
  glow?: "emerald" | "gold";
  hover?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "glass-panel rounded-2xl p-5",
        glow === "emerald" && "glow-emerald",
        glow === "gold" && "glow-gold",
        hover && "transition-colors duration-300 hover:border-white/15",
        className,
      )}
      {...props}
    >
      {children}
    </motion.div>
  );
}
