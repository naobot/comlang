import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

// Vite only exposes VITE_-prefixed vars to client code. The publishable key is meant to
// ship in the bundle — RLS is the real boundary, not key secrecy. The secret /
// service_role key must never appear in this repo.
const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env.local and fill it in.",
  );
}

// One client for the whole app. A second would open a second realtime socket and hold a
// separate copy of the session.
export const supabase = createClient<Database>(url, publishableKey);
