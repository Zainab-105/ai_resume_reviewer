import Link from "next/link";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";

import type { ScoreDelta } from "@/lib/resume/line-matching";
import { cn } from "@/lib/utils";

function Change({ label, value }: { label: string; value: number | null }) {
  if (value === null) return null;

  const Icon = value > 0 ? TrendingUp : value < 0 ? TrendingDown : Minus;
  const tone = value > 0 ? "text-success" : value < 0 ? "text-danger" : "text-muted-foreground";
  const word = value > 0 ? "up" : value < 0 ? "down" : "unchanged";

  return (
    <span className={cn("inline-flex items-center gap-1 text-sm font-medium", tone)}>
      <Icon aria-hidden className="size-4" />
      {/* The sign is spelled out for screen readers — an arrow icon and a
          colour are not enough on their own. */}
      <span className="sr-only">{`${label} ${word} by `}</span>
      <span className="tabular-nums">
        {value > 0 ? "+" : ""}
        {value}
      </span>
      <span aria-hidden>{label}</span>
    </span>
  );
}

export function ScoreDeltaBanner({
  delta,
  version,
}: {
  delta: ScoreDelta;
  version: number | null;
}) {
  // Nothing meaningful to say if neither score could be compared.
  if (delta.overall === null && delta.ats === null) return null;

  const improved = (delta.overall ?? 0) > 0 || (delta.ats ?? 0) > 0;
  const worsened = (delta.overall ?? 0) < 0 || (delta.ats ?? 0) < 0;

  return (
    <div
      className={cn(
        "mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3",
        improved && !worsened
          ? "border-success/40 bg-success/10"
          : worsened && !improved
            ? "border-danger/40 bg-danger/10"
            : "border-border bg-muted/40",
      )}
    >
      <div className="flex flex-wrap items-center gap-4">
        <p className="text-sm font-medium">
          {version ? `Version ${version}` : "This version"} vs. version {delta.previousVersion}
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <Change label="overall" value={delta.overall} />
          <Change label="ATS" value={delta.ats} />
        </div>
      </div>

      <Link
        href={`/dashboard/reviews/${delta.previousReviewId}`}
        className="text-sm underline underline-offset-4 hover:text-foreground print:hidden"
      >
        See the previous version
      </Link>
    </div>
  );
}
