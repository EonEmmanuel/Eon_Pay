import { createRoot } from "react-dom/client";
import { supabase } from "./app/lib/supabase";
import "./styles/index.css";

async function bootstrap(): Promise<void> {
  // Resolve Supabase email-link credentials before rendering protected routes.
  if (supabase !== undefined) {
    await supabase.auth.getSession();
  }
  const { default: App } = await import("./app/App");
  createRoot(document.getElementById("root")!).render(<App />);
}

void bootstrap();
