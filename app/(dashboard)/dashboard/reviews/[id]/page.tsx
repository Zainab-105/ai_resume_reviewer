import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Check, CircleAlert, Minus, X } from "lucide-react";

import { ScoreBar, ScoreGauge } from "@/components/review/score-gauge";
import { SuggestionCard } from "@/components/review/suggestion-card";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Strength, Suggestion, SubScores, Weakness } from "@/lib/ai/schema";
import type { AtsCheck } from "@/lib/resume/ats";
import type { KeywordMatch } from "@/lib/resume/keywords";
import type { RedFlag, RedFlagSeverity } from "@/lib/resume/red-flags";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Review" };

const SEVERITY: Record<RedFlagSeverity, { label: string; className: string }> = {
  critical: { label: "Critical", className: "bg-danger/15 text-danger" },
  major: { label: "Major", className: "bg-warning/20 text-warning" },
  minor: { label: "Minor", className: "bg-muted text-muted-foreground" },
};

export default async function ReviewPage({
  params,
}: {
  // Next.js 16: params is a Promise.
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // RLS restricts this to the owner, so a wrong id is simply not found.
  const { data: review } = await supabase
    .from("reviews")
    .select(
      "id, status, created_at, overall_score, ats_score, sub_scores, ats_breakdown, strengths, weaknesses, suggestions, red_flags, keyword_match, error_message, resumes(file_name, page_count, word_count)",
    )
    .eq("id", id)
    .single();

  if (!review) notFound();

  const resume = (review.resumes as unknown as { file_name: string }[] | null)?.[0];

  if (review.status === "failed") {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        <Alert tone="error">
          <p className="font-medium">This analysis didn&apos;t complete.</p>
          <p className="mt-1 text-muted-foreground">
            The deterministic ATS checks below still ran. Upload the resume again to retry the
            written feedback.
          </p>
        </Alert>
        <AtsBreakdown checks={(review.ats_breakdown ?? []) as AtsCheck[]} score={review.ats_score} />
      </div>
    );
  }

  const subScores = review.sub_scores as SubScores | null;
  const strengths = (review.strengths ?? []) as Strength[];
  const weaknesses = (review.weaknesses ?? []) as Weakness[];
  const suggestions = (review.suggestions ?? []) as Suggestion[];
  const redFlags = (review.red_flags ?? []) as RedFlag[];
  const keywords = review.keyword_match as KeywordMatch | null;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{resume?.file_name ?? "Resume"}</h1>
          <p className="text-sm text-muted-foreground">
            Reviewed {new Date(review.created_at).toLocaleDateString()}
          </p>
        </div>
        <Link
          href="/dashboard/reviews"
          className="text-sm underline underline-offset-4 hover:text-foreground"
        >
          All reviews
        </Link>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-8 p-6 sm:flex-row sm:items-center">
          <div className="flex justify-center gap-8">
            <ScoreGauge score={review.overall_score ?? 0} label="Overall" />
            <ScoreGauge score={review.ats_score ?? 0} label="ATS" />
          </div>

          {subScores ? (
            <div className="flex flex-1 flex-col gap-2.5">
              <ScoreBar label="Impact" score={subScores.impact} />
              <ScoreBar label="Clarity" score={subScores.clarity} />
              <ScoreBar label="Formatting" score={subScores.formatting} />
              <ScoreBar label="Skills coverage" score={subScores.skills} />
              <ScoreBar label="Relevance" score={subScores.relevance} />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <AtsBreakdown checks={(review.ats_breakdown ?? []) as AtsCheck[]} score={review.ats_score} />

      {keywords?.hits?.length ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Job match — {keywords.matchPercent}% of required keywords</CardTitle>
          </CardHeader>
          <CardContent>
            {keywords.missingRequired.length ? (
              <Alert tone="error" className="mb-4">
                <p className="font-medium">Missing required keywords</p>
                <p className="mt-1">{keywords.missingRequired.slice(0, 20).join(", ")}</p>
              </Alert>
            ) : (
              <Alert tone="success" className="mb-4">
                Every required keyword appears somewhere in your resume.
              </Alert>
            )}

            {/* Wide table scrolls inside its own container so the page never does. */}
            <div className="scroll-x">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th scope="col" className="py-2 pr-4 font-medium">Keyword</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Required</th>
                    <th scope="col" className="py-2 pr-4 font-medium">In resume</th>
                    <th scope="col" className="py-2 font-medium">Found in</th>
                  </tr>
                </thead>
                <tbody>
                  {keywords.hits.slice(0, 40).map((hit) => (
                    <tr key={hit.keyword} className="border-b border-border/50">
                      <td className="py-2 pr-4 font-medium">{hit.keyword}</td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {hit.required ? "Required" : "Preferred"}
                      </td>
                      <td className="py-2 pr-4">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1",
                            hit.present ? "text-success" : "text-danger",
                          )}
                        >
                          {hit.present ? (
                            <Check aria-hidden className="size-3.5" />
                          ) : (
                            <X aria-hidden className="size-3.5" />
                          )}
                          {hit.present ? "Yes" : "No"}
                        </span>
                      </td>
                      <td className="max-w-xs truncate py-2 text-muted-foreground">
                        {hit.location ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {redFlags.length ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Red flags</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {redFlags.map((flag) => (
              <div key={flag.id} className="flex items-start gap-3">
                <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
                <div>
                  <p className="text-sm font-medium">
                    {flag.title}{" "}
                    <span
                      className={cn(
                        "ml-1 rounded-full px-2 py-0.5 text-xs font-medium",
                        SEVERITY[flag.severity].className,
                      )}
                    >
                      {SEVERITY[flag.severity].label}
                    </span>
                  </p>
                  <p className="text-sm text-muted-foreground">{flag.detail}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Strengths</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {strengths.map((s, i) => (
              <div key={i}>
                <p className="flex items-start gap-2 text-sm">
                  <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
                  {s.text}
                </p>
                <blockquote className="mt-1.5 border-l-2 border-border pl-3 text-sm italic text-muted-foreground">
                  {s.evidence}
                </blockquote>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Weaknesses</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {weaknesses.map((w, i) => (
              <div key={i}>
                <p className="flex items-start gap-2 text-sm">
                  <CircleAlert
                    aria-hidden
                    className={cn(
                      "mt-0.5 size-4 shrink-0",
                      w.severity === "critical"
                        ? "text-danger"
                        : w.severity === "major"
                          ? "text-warning"
                          : "text-muted-foreground",
                    )}
                  />
                  <span>
                    {w.text}{" "}
                    <span
                      className={cn(
                        "ml-1 rounded-full px-2 py-0.5 text-xs font-medium",
                        SEVERITY[w.severity].className,
                      )}
                    >
                      {SEVERITY[w.severity].label}
                    </span>
                  </span>
                </p>
                <blockquote className="mt-1.5 border-l-2 border-border pl-3 text-sm italic text-muted-foreground">
                  {w.evidence}
                </blockquote>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <section className="mt-6">
        <h2 className="mb-3 text-lg font-semibold tracking-tight">
          Suggested rewrites ({suggestions.length})
        </h2>
        <div className="flex flex-col gap-3">
          {suggestions.map((s, i) => (
            <SuggestionCard key={i} suggestion={s} />
          ))}
        </div>
      </section>
    </div>
  );
}

function AtsBreakdown({ checks, score }: { checks: AtsCheck[]; score: number | null }) {
  if (!checks.length) return null;

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>ATS breakdown — {score ?? 0}/100</CardTitle>
        <p className="text-sm text-muted-foreground">
          These eight checks run in code, not by the AI, so the same resume always scores the same.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {checks.map((check) => {
          const earned = Math.round(check.ratio * check.weight);
          const partial = !check.passed && check.ratio > 0;

          return (
            <div key={check.id} className="flex items-start gap-3">
              {check.passed ? (
                <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
              ) : partial ? (
                <Minus aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
              ) : (
                <X aria-hidden className="mt-0.5 size-4 shrink-0 text-danger" />
              )}
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline justify-between gap-2 text-sm font-medium">
                  <span>{check.label}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {earned}/{check.weight}
                  </span>
                </p>
                <p className="text-sm text-muted-foreground">{check.detail}</p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
