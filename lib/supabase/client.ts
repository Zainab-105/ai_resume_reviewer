import { createBrowserClient } from "@supabase/ssr";

import { env } from "@/lib/env";

/**
 * Supabase client for Client Components. Only ever reads public env vars.
 */
export function createClient() {
  return createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
