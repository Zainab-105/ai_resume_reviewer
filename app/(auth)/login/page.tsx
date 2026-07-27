import type { Metadata } from "next";
import Link from "next/link";

import { signIn } from "@/app/(auth)/actions";
import { AuthForm } from "@/components/auth/auth-form";
import { GoogleButton } from "@/components/auth/google-button";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  // Next.js 16: searchParams is a Promise — synchronous access was removed.
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome back</CardTitle>
        <CardDescription>Sign in to review your resume.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? <Alert tone="error">{error}</Alert> : null}

        <GoogleButton next={next} />

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          or
          <span className="h-px flex-1 bg-border" />
        </div>

        <AuthForm action={signIn} mode="sign-in" next={next} />

        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
          <Link href="/forgot-password" className="underline underline-offset-4 hover:text-foreground">
            Forgot your password?
          </Link>
          <p>
            No account?{" "}
            <Link href="/signup" className="underline underline-offset-4 hover:text-foreground">
              Create one
            </Link>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
