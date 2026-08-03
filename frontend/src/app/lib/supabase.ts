import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY;

export const authConfigurationError =
  url === undefined || publishableKey === undefined
    ? "VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are required."
    : undefined;

export const supabase =
  url === undefined || publishableKey === undefined
    ? undefined
    : createClient(url, publishableKey, {
        auth: {
          flowType: "implicit",
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });
