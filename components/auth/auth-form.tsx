"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import type { AuthState } from "@/app/(auth)/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function AuthForm({
  action,
  mode,
  next,
}: {
  action: (prev: AuthState, formData: FormData) => Promise<AuthState>;
  mode: "sign-in" | "sign-up" | "reset";
  next?: string;
}) {
  const [state, formAction] = useActionState<AuthState, FormData>(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.message ? <Alert tone="success">{state.message}</Alert> : null}

      {mode === "sign-up" ? (
        <Field label="Full name" htmlFor="full_name">
          <Input id="full_name" name="full_name" autoComplete="name" placeholder="Ada Lovelace" />
        </Field>
      ) : null}

      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
        />
      </Field>

      {mode !== "reset" ? (
        <Field label="Password" htmlFor="password">
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
            placeholder="At least 8 characters"
          />
        </Field>
      ) : null}

      {mode === "sign-in" ? (
        <Submit label="Sign in" pendingLabel="Signing in…" />
      ) : mode === "sign-up" ? (
        <Submit label="Create account" pendingLabel="Creating account…" />
      ) : (
        <Submit label="Send reset link" pendingLabel="Sending…" />
      )}
    </form>
  );
}
