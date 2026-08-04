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
        <Button
          variant="ghost"
          size="sm"
          onClick={copy}
          aria-label="Copy the rewritten line"
          className="print:hidden"
        >
          {copied ? <Check aria-hidden className="size-3.5" /> : <Copy aria-hidden className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>

      {/*
        Print does not render background colours by default, so before/after
        would become two identical grey blocks on paper. The labels below are
        screen-hidden and print-visible, carrying the distinction in text.
      */}
      {/*
        Print stacks the two blocks instead of sitting them side by side. The
        three-column template loses its middle column when the arrow is hidden,
        which squeezes "before" into a one-word-per-line strip on paper.
      */}
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center print:!grid-cols-1">
        <p className="rounded-md bg-danger/10 p-3 text-sm line-through decoration-danger/40 print:border print:border-border print:no-underline">
          <span className="hidden text-xs font-semibold uppercase tracking-wide print:mb-1 print:block print:no-underline">
            Before
          </span>
          {suggestion.before}
        </p>
        <ArrowRight
          aria-hidden
          className="hidden size-4 shrink-0 text-muted-foreground sm:block print:hidden"
        />
        <p className="rounded-md bg-success/10 p-3 text-sm font-medium print:border print:border-border">
          <span className="hidden text-xs font-semibold uppercase tracking-wide print:mb-1 print:block">
            After
          </span>
          {suggestion.after}
        </p>
      </div>

      <p className="mt-3 text-sm text-muted-foreground">{suggestion.why}</p>
    </div>
  );
}
