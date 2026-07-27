"use client";

import { useState } from "react";
import { ArrowRight, Check, Copy } from "lucide-react";

import type { Suggestion } from "@/lib/ai/schema";
import { Button } from "@/components/ui/button";

export function SuggestionCard({ suggestion }: { suggestion: Suggestion }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(suggestion.after);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is blocked in some contexts; the text is on screen regardless.
    }
  }

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {suggestion.section}
        </p>
        <Button variant="ghost" size="sm" onClick={copy} aria-label="Copy the rewritten line">
          {copied ? <Check aria-hidden className="size-3.5" /> : <Copy aria-hidden className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <p className="rounded-md bg-danger/10 p-3 text-sm line-through decoration-danger/40">
          {suggestion.before}
        </p>
        <ArrowRight
          aria-hidden
          className="hidden size-4 shrink-0 text-muted-foreground sm:block"
        />
        <p className="rounded-md bg-success/10 p-3 text-sm font-medium">{suggestion.after}</p>
      </div>

      <p className="mt-3 text-sm text-muted-foreground">{suggestion.why}</p>
    </div>
  );
}
