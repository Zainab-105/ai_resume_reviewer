"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Dropzone } from "@/components/upload/dropzone";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { MAX_JD_CHARS } from "@/lib/resume/constants";
import { cn } from "@/lib/utils";

type Stage = "idle" | "uploading" | "extracting" | "analyzing" | "done";

const STAGE_LABEL: Record<Stage, string> = {
  idle: "",
  uploading: "Uploading your resume…",
  extracting: "Reading the text…",
  analyzing: "Analysing against the rubric…",
  done: "Done — opening your review…",
};

const STAGE_ORDER: Stage[] = ["uploading", "extracting", "analyzing", "done"];

export function UploadForm({ quotaRemaining }: { quotaRemaining: number }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [showJd, setShowJd] = useState(false);
  const [jd, setJd] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);

  const busy = stage !== "idle" && stage !== "done";
  const outOfQuota = quotaRemaining <= 0;

  async function submit() {
    if (!file || busy) return;

    setError(null);
    setStage("uploading");

    try {
      const form = new FormData();
      form.set("file", file);
      if (jd.trim()) {
        form.set("job_description", jd.trim());
        if (jobTitle.trim()) form.set("job_title", jobTitle.trim());
      }

      const uploadRes = await fetch("/api/upload", { method: "POST", body: form });
      const uploaded = await uploadRes.json();

      if (!uploadRes.ok) {
        setError(uploaded.error ?? "Upload failed. Try again.");
        setStage("idle");
        return;
      }

      setStage("analyzing");

      const analyzeRes = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeId: uploaded.resumeId,
          jobTargetId: uploaded.jobTargetId,
        }),
      });
      const analyzed = await analyzeRes.json();

      if (!analyzeRes.ok) {
        setError(analyzed.error ?? "Analysis failed. Your upload was saved — try re-running it.");
        setStage("idle");
        return;
      }

      setStage("done");
      router.push(`/dashboard/reviews/${analyzed.reviewId}`);
    } catch {
      setError("Network problem. Check your connection and try again.");
      setStage("idle");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Dropzone file={file} onFile={setFile} disabled={busy} />

      <div>
        <button
          type="button"
          onClick={() => setShowJd((v) => !v)}
          disabled={busy}
          aria-expanded={showJd}
          className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50"
        >
          {showJd ? "Remove job description" : "Targeting a specific job? Add the description"}
        </button>

        {showJd ? (
          <div className="mt-3 flex flex-col gap-3">
            <Field label="Job title (optional)" htmlFor="job_title">
              <Input
                id="job_title"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="Senior Backend Engineer"
                disabled={busy}
              />
            </Field>

            <Field label="Job description" htmlFor="job_description">
              <textarea
                id="job_description"
                value={jd}
                onChange={(e) => setJd(e.target.value.slice(0, MAX_JD_CHARS))}
                rows={7}
                disabled={busy}
                placeholder="Paste the full job posting here…"
                className="w-full rounded-md border border-input bg-background p-3 text-sm placeholder:text-muted-foreground disabled:opacity-50"
              />
            </Field>

            <p className="text-xs text-muted-foreground">
              {jd.length.toLocaleString()} / {MAX_JD_CHARS.toLocaleString()} characters
            </p>
          </div>
        ) : null}
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}

      {outOfQuota ? (
        <Alert tone="info">
          You&apos;ve used all 5 analyses for today. The limit resets 24 hours after your first
          analysis.
        </Alert>
      ) : null}

      {/* Progress is announced politely so screen readers follow the stages. */}
      {busy || stage === "done" ? (
        <div aria-live="polite" className="flex flex-col gap-2">
          <p className="text-sm font-medium">{STAGE_LABEL[stage]}</p>
          <ol className="flex gap-1.5">
            {STAGE_ORDER.map((s) => {
              const reached = STAGE_ORDER.indexOf(stage) >= STAGE_ORDER.indexOf(s);
              return (
                <li
                  key={s}
                  className={cn(
                    "h-1.5 flex-1 rounded-full transition",
                    reached ? "bg-primary" : "bg-muted",
                  )}
                />
              );
            })}
          </ol>
          <p className="text-xs text-muted-foreground">
            This usually takes 15–25 seconds. Keep this tab open.
          </p>
        </div>
      ) : null}

      <Button onClick={submit} disabled={!file || busy || outOfQuota} size="lg">
        {busy ? "Working…" : "Review my resume"}
      </Button>
    </div>
  );
}
