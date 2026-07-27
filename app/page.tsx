import Link from "next/link";
import { Gauge, ScanSearch, Sparkles, Target } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const features = [
  {
    Icon: Gauge,
    title: "ATS score you can audit",
    body: "Eight published checks — parsable text, contact block, section headings, date consistency, quantified bullets and more — computed in code, not guessed by a model.",
  },
  {
    Icon: Sparkles,
    title: "Before / after rewrites",
    body: "Not “add more metrics”. You get the actual line: “Managed the team” becomes “Led 6 engineers, cut deploy time 40%”.",
  },
  {
    Icon: Target,
    title: "Matched to the job",
    body: "Paste a job description and see exactly which required keywords you hit, which you miss, and what to fix before you apply.",
  },
  {
    Icon: ScanSearch,
    title: "Evidence for every claim",
    body: "Each strength and weakness quotes the line of your resume it came from, so you can check the feedback instead of trusting it.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <section className="mx-auto flex w-full max-w-6xl flex-col items-start gap-6 px-4 py-20 sm:py-28">
        <span className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
          Free · 5 reviews per day
        </span>
        <h1 className="max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          Find out why your resume is getting rejected.
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          Upload a PDF, optionally paste the job you&apos;re targeting, and get an ATS score,
          scored strengths and weaknesses, and concrete rewrites — in under 30 seconds.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/signup"
            className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-6 font-medium text-primary-foreground transition hover:opacity-90"
          >
            Review my resume
          </Link>
          <Link
            href="/login"
            className="inline-flex h-12 items-center justify-center rounded-md border border-border px-6 font-medium transition hover:bg-muted"
          >
            Sign in
          </Link>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-24">
        <div className="grid gap-4 sm:grid-cols-2">
          {features.map(({ Icon, title, body }) => (
            <Card key={title}>
              <CardHeader>
                <Icon aria-hidden className="size-5 text-primary" />
                <CardTitle>{title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>{body}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
