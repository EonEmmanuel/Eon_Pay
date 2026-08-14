import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router";
import { Toaster } from "./components/ui/sonner";
import { AppActivityIndicator } from "./components/common/AppActivityIndicator";
import { AuthProvider } from "./lib/auth";
import { ThemeProvider, useTheme } from "./lib/theme-provider";
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

function ThemedApp() {
  const { theme } = useTheme();
  return (
    <div className={theme}>
      <RouterProvider router={router} />
      <Toaster
        theme={theme}
        position="bottom-right"
      />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider defaultTheme="light">
          <AppActivityIndicator />
          <ThemedApp />
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
