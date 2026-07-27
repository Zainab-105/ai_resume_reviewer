import Link from "next/link";
import { FileSearch } from "lucide-react";

import { signOut } from "@/app/(auth)/actions";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { getUser } from "@/lib/supabase/server";

export async function SiteNav() {
  const user = await getUser();

  return (
    <header className="border-b border-border">
      <nav className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4">
        <Link href={user ? "/dashboard" : "/"} className="inline-flex items-center gap-2 font-semibold">
          <FileSearch aria-hidden className="size-5 text-primary" />
          <span>Resume Reviewer</span>
        </Link>

        <div className="flex items-center gap-1.5">
          <ThemeToggle />

          {user ? (
            <>
              <Link
                href="/dashboard/reviews"
                className="hidden h-8 items-center rounded-md px-3 text-sm font-medium hover:bg-muted sm:inline-flex"
              >
                History
              </Link>
              <form action={signOut}>
                <Button type="submit" variant="outline" size="sm">
                  Sign out
                </Button>
              </form>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="inline-flex h-8 items-center rounded-md px-3 text-sm font-medium hover:bg-muted"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Get started
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
