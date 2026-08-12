import { useIsMutating } from "@tanstack/react-query";

export function AppActivityIndicator() {
  const activeMutations = useIsMutating();

  if (activeMutations === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden bg-primary/20"
      role="status"
      aria-live="polite"
      aria-label="Saving changes"
    >
      <div className="h-full w-1/2 animate-pulse rounded-full bg-primary shadow-[0_0_12px_var(--primary)]" />
      <span className="sr-only">Your request is being processed.</span>
    </div>
  );
}
