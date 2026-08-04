import type { Metadata } from "next";
import Link from "next/link";
import { Trash2 } from "lucide-react";

import { deleteReview } from "@/app/(dashboard)/dashboard/reviews/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription } from "@/components/ui/card";
import type { ScoreDelta } from "@/lib/resume/line-matching";
import { one } from "@/lib/supabase/relations";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Review history" };

/** Change against the previous version of the same resume, or nothing. */
function DeltaTag({ value }: { value: number | null }) {
  if (value === null || value === 0) return null;

  const improved = value > 0;
  return (
    <span
      className={cn("ml-1.5 text-xs font-medium", improved ? "text-success" : "text-danger")}
    >
      <span className="sr-only">{improved ? " up by " : " down by "}</span>
      <span aria-hidden>{improved ? "▲" : "▼"}</span>
      {Math.abs(value)}
    </span>
  );
}

export default async function ReviewsPage() {
  const supabase = await createClient();

  const { data: reviews } = await supabase
    .from("reviews")
    .select(
      "id, created_at, overall_score, ats_score, status, score_delta, resumes(file_name, version), job_targets(title)",
    )
    .order("created_at", { ascending: false });

  if (!reviews?.length) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-10">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">Review history</h1>
        <Card>
          <CardContent className="p-6">
            <CardDescription className="mb-4">
              No reviews yet. Upload a resume to get your first one.
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

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Review history</h1>
        {reviews.filter((r) => r.status === "complete").length >= 2 ? (
          <Link
            href="/dashboard/compare"
            className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm font-medium hover:bg-muted"
          >
            Compare two reviews
          </Link>
        ) : null}
      </div>

      <div className="scroll-x rounded-lg border border-border">
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th scope="col" className="p-3 font-medium">Resume</th>
              <th scope="col" className="p-3 font-medium">Target</th>
              <th scope="col" className="p-3 font-medium">Date</th>
              <th scope="col" className="p-3 text-right font-medium">Overall</th>
              <th scope="col" className="p-3 text-right font-medium">ATS</th>
              <th scope="col" className="p-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {reviews.map((review) => {
              const resume = one<{ file_name: string; version: number | null }>(review.resumes);
              const fileName = resume?.file_name ?? "Resume";
              const target = one<{ title: string | null }>(review.job_targets)?.title;
              const delta = review.score_delta as ScoreDelta | null;

              return (
                <tr key={review.id} className="border-b border-border/50 last:border-0">
                  <td className="p-3">
                    <Link
                      href={`/dashboard/reviews/${review.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {fileName}
                    </Link>
                    {resume?.version && resume.version > 1 ? (
                      <span className="ml-2 text-xs text-muted-foreground">v{resume.version}</span>
                    ) : null}
                    {review.status === "failed" ? (
                      <span className="ml-2 rounded-full bg-danger/15 px-2 py-0.5 text-xs text-danger">
                        Failed
                      </span>
                    ) : null}
                  </td>
                  <td className="p-3 text-muted-foreground">{target ?? "—"}</td>
                  <td className="p-3 text-muted-foreground">
                    {new Date(review.created_at).toLocaleDateString()}
                  </td>
                  <td className="p-3 text-right tabular-nums">
                    {review.overall_score ?? "—"}
                    <DeltaTag value={delta?.overall ?? null} />
                  </td>
                  <td className="p-3 text-right tabular-nums">
                    {review.ats_score ?? "—"}
                    <DeltaTag value={delta?.ats ?? null} />
                  </td>
                  <td className="p-3 text-right">
                    <form action={deleteReview}>
                      <input type="hidden" name="id" value={review.id} />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete the review for ${fileName}`}
                      >
                        <Trash2 aria-hidden className="size-4" />
                      </Button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
