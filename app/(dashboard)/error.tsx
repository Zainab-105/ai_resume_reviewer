"use client";

import { useEffect } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-20">
      <Alert tone="error">
        <p className="font-medium">Something went wrong loading this page.</p>
        {/* Never render error.message — it can leak server internals. */}
        <p className="mt-1 text-muted-foreground">
          Try again. If it keeps happening, sign out and back in.
          {error.digest ? ` (ref: ${error.digest})` : null}
        </p>
      </Alert>
      <Button className="mt-4" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
