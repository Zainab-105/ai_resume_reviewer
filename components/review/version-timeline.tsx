import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface TimelineEntry {
  reviewId: string;
  version: number;
  overall: number | null;
  ats: number | null;
  createdAt: string;
}

/**
 * Every scored version of this resume line, oldest first, so progress reads
 * left to right. Rendered only when there is more than one version — a
 * one-point chart says nothing.
 */
export function VersionTimeline({
  entries,
  currentReviewId,
}: {
  entries: TimelineEntry[];
  currentReviewId: string;
}) {
  if (entries.length < 2) return null;

  const scored = entries.filter((e) => e.ats !== null || e.overall !== null);
  if (scored.length < 2) return null;

  const values = scored.flatMap((e) => [e.overall, e.ats].filter((v): v is number => v !== null));
  const min = Math.min(...values);
  const max = Math.max(...values);
  // Keep a floor on the range so a 2-point spread doesn't render as a cliff.
  const span = Math.max(max - min, 10);
  const height = (value: number) => 15 + ((value - min) / span) * 70;

  const first = scored[0];
  const last = scored[scored.length - 1];
  const overallChange =
    first.overall !== null && last.overall !== null ? last.overall - first.overall : null;

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Progress across {scored.length} versions</CardTitle>
        {overallChange !== null ? (
          <p className="text-sm text-muted-foreground">
            Overall score has moved {overallChange > 0 ? "up" : overallChange < 0 ? "down" : "by"}{" "}
            <span
              className={cn(
                "font-medium",
                overallChange > 0
                  ? "text-success"
                  : overallChange < 0
                    ? "text-danger"
                    : "text-foreground",
              )}
            >
              {overallChange > 0 ? "+" : ""}
              {overallChange}
            </span>{" "}
            since version {first.version}.
          </p>
        ) : null}
      </CardHeader>

      <CardContent>
        <div className="scroll-x">
          <ol
            className="flex min-w-fit items-end gap-4"
            style={{ height: "120px" }}
          >
            {scored.map((entry) => {
              const isCurrent = entry.reviewId === currentReviewId;

              return (
                <li key={entry.reviewId} className="flex h-full flex-col justify-end">
                  <Link
                    href={`/dashboard/reviews/${entry.reviewId}`}
                    aria-current={isCurrent ? "page" : undefined}
                    className="group flex h-full flex-col justify-end gap-1"
                  >
                    <span className="text-center text-xs tabular-nums text-muted-foreground">
                      {entry.overall ?? "—"}
                    </span>
                    <span className="flex items-end gap-1">
                      {/* Two bars per version: overall and ATS. */}
                      <span
                        className={cn(
                          "w-5 rounded-t transition",
                          isCurrent ? "bg-primary" : "bg-primary/40 group-hover:bg-primary/70",
                        )}
                        style={{ height: `${entry.overall !== null ? height(entry.overall) : 4}px` }}
                      />
                      <span
                        className={cn(
                          "w-5 rounded-t transition",
                          isCurrent ? "bg-success" : "bg-success/40 group-hover:bg-success/70",
                        )}
                        style={{ height: `${entry.ats !== null ? height(entry.ats) : 4}px` }}
                      />
                    </span>
                    <span
                      className={cn(
                        "text-center text-xs",
                        isCurrent ? "font-semibold text-foreground" : "text-muted-foreground",
                      )}
                    >
                      v{entry.version}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-sm bg-primary" />
            Overall
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-sm bg-success" />
            ATS
          </span>
        </div>

        {/* The chart is decorative on its own; this table is the accessible
            source of the same numbers. */}
        <table className="sr-only">
          <caption>Scores by resume version</caption>
          <thead>
            <tr>
              <th scope="col">Version</th>
              <th scope="col">Overall score</th>
              <th scope="col">ATS score</th>
            </tr>
          </thead>
          <tbody>
            {scored.map((entry) => (
              <tr key={entry.reviewId}>
                <th scope="row">Version {entry.version}</th>
                <td>{entry.overall ?? "not scored"}</td>
                <td>{entry.ats ?? "not scored"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
