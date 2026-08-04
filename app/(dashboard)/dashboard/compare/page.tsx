import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, CircleAlert, Minus, Plus, TrendingDown, TrendingUp } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Strength, Weakness } from "@/lib/ai/schema";
import type { AtsCheck } from "@/lib/resume/ats";
import type { KeywordMatch } from "@/lib/resume/keywords";
import {
  compareAtsChecks,
  compareKeywords,
  compareStrengths,
  compareWeaknesses,
} from "@/lib/review/compare";
import { one } from "@/lib/supabase/relations";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Compare reviews" };

const SEVERITY: Record<string, string> = {
  critical: "bg-danger/15 text-danger",
  major: "bg-warning/20 text-warning",
  minor: "bg-muted text-muted-foreground",
};

function ScoreMove({ label, before, after }: { label: string; before: number | null; after: number | null }) {
  if (before === null || after === null) return null;

  const delta = after - before;
  const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const tone = delta > 0 ? "text-success" : delta < 0 ? "text-danger" : "text-muted-foreground";

  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="flex items-baseline gap-2">
        <span className="text-lg tabular-nums text-muted-foreground">{before}</span>
        <ArrowRight aria-hidden className="size-3.5 text-muted-foreground" />
        <span className="text-2xl font-semibold tabular-nums">{after}</span>
        <span className={cn("inline-flex items-center gap-0.5 text-sm font-medium", tone)}>
          <Icon aria-hidden className="size-3.5" />
          <span className="sr-only">{delta > 0 ? "up by " : delta < 0 ? "down by " : "unchanged"}</span>
          {delta !== 0 ? (
            <span className="tabular-nums">
              {delta > 0 ? "+" : ""}
              {delta}
            </span>
          ) : null}
        </span>
      </p>
    </div>
  );
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const { a, b } = await searchParams;
  const supabase = await createClient();

  // RLS scopes this to the caller, so an id they do not own simply is not here.
  const { data: reviews } = await supabase
    .from("reviews")
    .select(
      "id, created_at, status, overall_score, ats_score, ats_breakdown, strengths, weaknesses, keyword_match, resumes(file_name, version)",
    )
    .eq("status", "complete")
    .order("created_at", { ascending: false })
    .limit(50);

  const available = reviews ?? [];

  if (available.length < 2) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">Compare reviews</h1>
        <Card>
          <CardContent className="p-6">
            <CardDescription className="mb-4">
              You need at least two completed reviews to compare. Upload an edited version of your
              resume to see what changed.
            </CardDescription>
            <Link
              href="/dashboard"
              className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Upload a resume
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Default to the two most recent, oldest of the pair on the left.
  const older = available.find((r) => r.id === a) ?? available[1];
  const newer = available.find((r) => r.id === b) ?? available[0];

  const sameReview = older.id === newer.id;

  const olderResume = one<{ file_name: string; version: number | null }>(older.resumes);
  const newerResume = one<{ file_name: string; version: number | null }>(newer.resumes);

  const weaknessChange = compareWeaknesses(
    (older.weaknesses ?? []) as Weakness[],
    (newer.weaknesses ?? []) as Weakness[],
  );
  const strengthChange = compareStrengths(
    (older.strengths ?? []) as Strength[],
    (newer.strengths ?? []) as Strength[],
  );
  const atsChanges = compareAtsChecks(
    (older.ats_breakdown ?? []) as AtsCheck[],
    (newer.ats_breakdown ?? []) as AtsCheck[],
  );
  const keywordChange = compareKeywords(
    older.keyword_match as KeywordMatch | null,
    newer.keyword_match as KeywordMatch | null,
  );

  const label = (
    resume: { file_name: string; version: number | null } | null,
    review: { created_at: string },
  ) =>
    `${resume?.file_name ?? "Resume"}${resume?.version && resume.version > 1 ? ` (v${resume.version})` : ""} · ${new Date(review.created_at).toLocaleDateString()}`;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">Compare reviews</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        What changed between two reviews — which problems you fixed, and which appeared.
      </p>

      <form method="get" className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="a" className="text-sm font-medium">
            Earlier review
          </label>
          <select
            id="a"
            name="a"
            defaultValue={older.id}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {available.map((review) => (
              <option key={review.id} value={review.id}>
                {label(one<{ file_name: string; version: number | null }>(review.resumes), review)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="b" className="text-sm font-medium">
            Later review
          </label>
          <select
            id="b"
            name="b"
            defaultValue={newer.id}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {available.map((review) => (
              <option key={review.id} value={review.id}>
                {label(one<{ file_name: string; version: number | null }>(review.resumes), review)}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Compare
        </button>
      </form>

      {sameReview ? (
        <Alert tone="info">Pick two different reviews to see what changed between them.</Alert>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Scores</CardTitle>
              <CardDescription>
                {label(olderResume, older)} → {label(newerResume, newer)}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-8">
              <ScoreMove label="Overall" before={older.overall_score} after={newer.overall_score} />
              <ScoreMove label="ATS" before={older.ats_score} after={newer.ats_score} />
              {keywordChange ? (
                <ScoreMove
                  label="Job match %"
                  before={keywordChange.beforePercent}
                  after={keywordChange.afterPercent}
                />
              ) : null}
            </CardContent>
          </Card>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Check aria-hidden className="size-4 text-success" />
                  Fixed ({weaknessChange.resolved.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {weaknessChange.resolved.length ? (
                  weaknessChange.resolved.map((w, i) => (
                    <div key={i} className="text-sm">
                      <p className="line-through decoration-success/50">{w.text}</p>
                      <span
                        className={cn(
                          "mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                          SEVERITY[w.severity],
                        )}
                      >
                        was {w.severity}
                      </span>
                    </div>
                  ))
                ) : (
                  <CardDescription>
                    No weaknesses from the earlier review were resolved.
                  </CardDescription>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Plus aria-hidden className="size-4 text-danger" />
                  New problems ({weaknessChange.introduced.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {weaknessChange.introduced.length ? (
                  weaknessChange.introduced.map((w, i) => (
                    <div key={i} className="text-sm">
                      <p>{w.text}</p>
                      <span
                        className={cn(
                          "mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                          SEVERITY[w.severity],
                        )}
                      >
                        {w.severity}
                      </span>
                    </div>
                  ))
                ) : (
                  <CardDescription>No new weaknesses appeared. </CardDescription>
                )}
              </CardContent>
            </Card>
          </div>

          {weaknessChange.persisting.length ? (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CircleAlert aria-hidden className="size-4 text-warning" />
                  Still unresolved ({weaknessChange.persisting.length})
                </CardTitle>
                <CardDescription>Present in both reviews.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {weaknessChange.persisting.map(({ after }, i) => (
                  <p key={i} className="text-sm">
                    {after.text}
                    <span
                      className={cn(
                        "ml-2 rounded-full px-2 py-0.5 text-xs font-medium",
                        SEVERITY[after.severity],
                      )}
                    >
                      {after.severity}
                    </span>
                  </p>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {atsChanges.length ? (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>ATS checks that moved</CardTitle>
                <CardDescription>Unchanged checks are omitted.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {atsChanges.map((change) => (
                  <div key={change.id} className="flex items-center justify-between gap-4 text-sm">
                    <span>{change.label}</span>
                    <span className="flex items-center gap-2 tabular-nums">
                      <span className="text-muted-foreground">
                        {change.beforeEarned}/{change.weight}
                      </span>
                      <ArrowRight aria-hidden className="size-3 text-muted-foreground" />
                      <span className="font-medium">
                        {change.afterEarned}/{change.weight}
                      </span>
                      <span
                        className={cn(
                          "font-medium",
                          change.delta > 0 ? "text-success" : "text-danger",
                        )}
                      >
                        <span className="sr-only">
                          {change.delta > 0 ? "improved by " : "regressed by "}
                        </span>
                        {change.delta > 0 ? "+" : ""}
                        {change.delta}
                      </span>
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {keywordChange && (keywordChange.gained.length || keywordChange.lost.length) ? (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Keyword changes</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                {keywordChange.gained.length ? (
                  <p>
                    <span className="font-medium text-success">Added:</span>{" "}
                    {keywordChange.gained.join(", ")}
                  </p>
                ) : null}
                {keywordChange.lost.length ? (
                  <p>
                    <span className="font-medium text-danger">No longer present:</span>{" "}
                    {keywordChange.lost.join(", ")}
                  </p>
                ) : null}
                {keywordChange.stillMissing.length ? (
                  <p className="text-muted-foreground">
                    Still missing: {keywordChange.stillMissing.slice(0, 15).join(", ")}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {strengthChange.gained.length ? (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-base">New strengths ({strengthChange.gained.length})</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {strengthChange.gained.map((s, i) => (
                  <div key={i}>
                    <p className="text-sm">{s.text}</p>
                    <blockquote className="mt-1 border-l-2 border-border pl-3 text-sm italic text-muted-foreground">
                      {s.evidence}
                    </blockquote>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <div className="mt-6 flex gap-4 text-sm">
            <Link
              href={`/dashboard/reviews/${older.id}`}
              className="underline underline-offset-4 hover:text-foreground"
            >
              Open the earlier review
            </Link>
            <Link
              href={`/dashboard/reviews/${newer.id}`}
              className="underline underline-offset-4 hover:text-foreground"
            >
              Open the later review
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
