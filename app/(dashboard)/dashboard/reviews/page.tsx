import type { Metadata } from "next";
import Link from "next/link";
import { Trash2 } from "lucide-react";

import { deleteReview } from "@/app/(dashboard)/dashboard/reviews/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Review history" };

export default async function ReviewsPage() {
  const supabase = await createClient();

  const { data: reviews } = await supabase
    .from("reviews")
    .select("id, created_at, overall_score, ats_score, status, resumes(file_name), job_targets(title)")
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
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Review history</h1>

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
              const fileName =
                (review.resumes as unknown as { file_name: string }[] | null)?.[0]?.file_name ??
                "Resume";
              const target =
                (review.job_targets as unknown as { title: string | null }[] | null)?.[0]?.title;

              return (
                <tr key={review.id} className="border-b border-border/50 last:border-0">
                  <td className="p-3">
                    <Link
                      href={`/dashboard/reviews/${review.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {fileName}
                    </Link>
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
                  <td className="p-3 text-right tabular-nums">{review.overall_score ?? "—"}</td>
                  <td className="p-3 text-right tabular-nums">{review.ats_score ?? "—"}</td>
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
