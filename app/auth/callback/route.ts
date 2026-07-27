import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * OAuth / email-confirmation callback. Exchanges the PKCE code for a session,
 * then forwards the user on.
 *
 * Route Handlers are uncached by default in Next.js 16, which is what we want
 * here — do not add `dynamic = 'force-static'`.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next") ?? "/dashboard";

  // Reject absolute URLs so `?next=` cannot be turned into an open redirect.
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/dashboard";

  if (!code) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("Sign-in link was invalid or expired.")}`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("Could not complete sign-in. Try again.")}`,
    );
  }

  // Behind a proxy, prefer the forwarded host so the redirect stays on the
  // public domain rather than the internal one.
  const forwardedHost = request.headers.get("x-forwarded-host");
  const base =
    process.env.NODE_ENV === "development" || !forwardedHost
      ? origin
      : `https://${forwardedHost}`;

  return NextResponse.redirect(`${base}${next}`);
}
