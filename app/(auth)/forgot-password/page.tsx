import type { Metadata } from "next";
import Link from "next/link";

import { requestPasswordReset } from "@/app/(auth)/actions";
import { AuthForm } from "@/components/auth/auth-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Reset your password</CardTitle>
        <CardDescription>We&apos;ll email you a link to set a new one.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <AuthForm action={requestPasswordReset} mode="reset" />
        <p className="text-sm text-muted-foreground">
          <Link href="/login" className="underline underline-offset-4 hover:text-foreground">
            Back to sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
