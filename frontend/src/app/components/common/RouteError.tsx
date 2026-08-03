import { isRouteErrorResponse, useRouteError } from "react-router";
import { Button } from "../ui/button";

export function RouteError() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : "The requested page could not be displayed.";
  return (
    <main className="app-ambient grid min-h-screen place-items-center p-6 text-foreground">
      <div className="max-w-lg rounded-2xl border border-destructive/20 bg-destructive/5 p-6 text-center">
        <h1>We couldn’t open this page</h1>
        <p className="mt-2 text-muted-foreground" role="alert">
          {message}
        </p>
        <Button className="mt-4" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </div>
    </main>
  );
}
