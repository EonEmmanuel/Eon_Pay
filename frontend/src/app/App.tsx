import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router";
import { Toaster } from "./components/ui/sonner";
import { AppActivityIndicator } from "./components/common/AppActivityIndicator";
import { AuthProvider } from "./lib/auth";
import { router } from "./router";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppActivityIndicator />
        <div className="dark">
          <RouterProvider router={router} />
          <Toaster
            theme="dark"
            position="bottom-right"
            toastOptions={{
              style: {
                background: "oklch(0.21 0.03 264)",
                border: "1px solid oklch(1 0 0 / 8%)",
                color: "oklch(0.97 0.005 260)",
              },
            }}
          />
        </div>
      </AuthProvider>
    </QueryClientProvider>
  );
}
