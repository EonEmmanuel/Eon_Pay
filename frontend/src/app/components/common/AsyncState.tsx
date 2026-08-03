import { AlertCircle, Inbox } from "lucide-react";
import { Button } from "../ui/button";

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      className="grid min-h-40 place-items-center text-muted-foreground"
      role="status"
    >
      <div className="text-center">
        <span
          className="mx-auto mb-3 block size-7 animate-spin rounded-full border-2 border-primary border-t-transparent"
          aria-hidden="true"
        />
        <span>{label}</span>
      </div>
    </div>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div
      className="grid min-h-40 place-items-center rounded-xl border border-destructive/20 bg-destructive/5 p-5 text-center"
      role="alert"
    >
      <div>
        <AlertCircle className="mx-auto mb-2 size-6 text-destructive" />
        <p>{error instanceof Error ? error.message : "Something went wrong."}</p>
        {retry !== undefined && (
          <Button className="mt-3" variant="outline" onClick={retry}>
            Try again
          </Button>
        )}
      </div>
    </div>
  );
}

export function EmptyState({ label }: { label: string }) {
  return (
    <div className="grid min-h-40 place-items-center text-center text-muted-foreground">
      <div>
        <Inbox className="mx-auto mb-2 size-6" aria-hidden="true" />
        <p>{label}</p>
      </div>
    </div>
  );
}
