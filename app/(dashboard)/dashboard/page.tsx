import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FileUp } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // proxy.ts already guards this route; this is defence in depth.
  if (!user) redirect("/login?next=/dashboard");

  const [{ data: reviews }, { data: usedToday }] = await Promise.all([
    supabase
      .from("reviews")
      .select("id, created_at, overall_score, ats_score, status, resumes(file_name)")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase.rpc("analyses_used_today"),
  ]);

  const used = typeof usedToday === "number" ? usedToday : 0;
  const remaining = Math.max(0, 5 - used);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Upload a resume to get an ATS score and concrete rewrites.
          </p>
        </div>
        <span className="rounded-full border border-border px-3 py-1 text-sm text-muted-foreground">
          {remaining} of 5 analyses left today
        </span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload a resume</CardTitle>
          <CardDescription>PDF, up to 5&nbsp;MB.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border px-6 py-12 text-center">
            <FileUp aria-hidden className="size-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Upload lands here on day 2.</p>
          </div>
        </CardContent>
      </Card>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Recent reviews</h2>
          {reviews?.length ? (
            <Link
              href="/dashboard/reviews"
              className="text-sm underline underline-offset-4 hover:text-foreground"
            >
              View all
            </Link>
          ) : null}
        </div>

        {reviews?.length ? (
          <ul className="flex flex-col gap-2">
            {reviews.map((review) => (
              <li key={review.id}>
                <Link
                  href={`/dashboard/reviews/${review.id}`}
                  className="flex items-center justify-between gap-4 rounded-md border border-border px-4 py-3 text-sm hover:bg-muted"
                >
                  <span className="truncate">
                    {/* Supabase types the embedded relation as an array. */}
                    {(review.resumes as unknown as { file_name: string }[] | null)?.[0]?.file_name ??
                      "Resume"}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {review.overall_score ?? "—"} overall · {review.ats_score ?? "—"} ATS
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Card>
            <CardContent className="p-6">
              <CardDescription>
                No reviews yet. Upload your first resume to get started.
              </CardDescription>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
