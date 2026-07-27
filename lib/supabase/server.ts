import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { env } from "@/lib/env";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 *
 * Next.js 16: `cookies()` is async — synchronous access was removed entirely,
 * so this function must be awaited at every call site.
 *
 * Create a fresh client per request; never hoist one to module scope.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies. Safe to ignore: proxy.ts
          // refreshes the session on every request and writes cookies there.
        }
      },
    },
  });
}

/**
 * Returns the authenticated user, or null.
 *
 * Uses `getUser()` rather than `getSession()` — `getSession()` trusts the
 * cookie contents, while `getUser()` revalidates the token with the Supabase
 * Auth server. Never gate access on `getSession()` server-side.
 */
export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
