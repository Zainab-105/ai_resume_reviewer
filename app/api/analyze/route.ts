import { NextResponse } from "next/server";
import { z } from "zod";

import { PROMPT_VERSION } from "@/lib/ai/prompt";
import { generateReview } from "@/lib/ai/provider";
import { scoreAts } from "@/lib/resume/ats";
import { DAILY_ANALYSIS_QUOTA, MAX_JD_CHARS } from "@/lib/resume/constants";
import { matchKeywords } from "@/lib/resume/keywords";
import { detectRedFlags } from "@/lib/resume/red-flags";
import { createClient } from "@/lib/supabase/server";

/** Analysis is slow; Vercel's default would cut it off. */
export const maxDuration = 60;

const bodySchema = z.object({
  resumeId: z.string().uuid(),
  jobTargetId: z.string().uuid().nullish(),
  targetRole: z.string().max(120).nullish(),
  seniority: z.string().max(60).nullish(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "You need to be signed in." }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }
  const { resumeId, jobTargetId, targetRole, seniority } = parsed.data;

  // Quota is enforced in Postgres, never from a client-side counter.
  const { data: usedToday, error: quotaError } = await supabase.rpc("analyses_used_today");
  if (quotaError) {
    console.error("[analyze] quota check failed", { message: quotaError.message });
    return NextResponse.json({ error: "Could not verify your quota. Try again." }, { status: 500 });
  }
  if ((usedToday ?? 0) >= DAILY_ANALYSIS_QUOTA) {
    return NextResponse.json(
      {
        error: `You've used all ${DAILY_ANALYSIS_QUOTA} analyses for today. The limit resets 24 hours after your first one.`,
        reason: "quota-exceeded",
      },
      { status: 429 },
    );
  }

  // RLS also scopes this, but filtering by user_id makes the intent explicit.
  const { data: resume, error: resumeError } = await supabase
    .from("resumes")
    .select("id, file_name, page_count, extracted_text")
    .eq("id", resumeId)
    .eq("user_id", user.id)
    .single();

  if (resumeError || !resume?.extracted_text) {
    return NextResponse.json({ error: "That resume could not be found." }, { status: 404 });
  }

  let jobDescription: string | null = null;
  if (jobTargetId) {
    const { data: target } = await supabase
      .from("job_targets")
      .select("raw_text")
      .eq("id", jobTargetId)
      .eq("user_id", user.id)
      .single();
    jobDescription = target?.raw_text?.slice(0, MAX_JD_CHARS) ?? null;
  }

  const resumeText = resume.extracted_text;
  const fileName = resume.file_name;
  const pageCount = resume.page_count ?? 1;

  // Everything deterministic runs first, so the model receives facts, not guesses.
  const ats = scoreAts({ text: resumeText, pageCount, fileName });
  const redFlags = detectRedFlags(resumeText, fileName);
  const keywords = jobDescription ? matchKeywords(resumeText, jobDescription) : null;

  const result = await generateReview({
    resumeText,
    fileName,
    ats,
    redFlags,
    keywords,
    jobDescription,
    targetRole: targetRole ?? null,
    seniority: seniority ?? null,
  });

  if (!result.ok) {
    // Record the failure so it shows up in history rather than vanishing.
    await supabase.from("reviews").insert({
      user_id: user.id,
      resume_id: resumeId,
      job_target_id: jobTargetId ?? null,
      status: "failed",
      ats_score: ats.score,
      ats_breakdown: ats.checks,
      red_flags: redFlags,
      prompt_version: PROMPT_VERSION,
      error_message: result.reason,
    });

    return NextResponse.json({ error: result.message, reason: result.reason }, { status: 502 });
  }

  const { review, model, tokensIn, tokensOut, latencyMs } = result;

  const { data: inserted, error: insertError } = await supabase
    .from("reviews")
    .insert({
      user_id: user.id,
      resume_id: resumeId,
      job_target_id: jobTargetId ?? null,
      status: "complete",
      target_role: targetRole ?? null,
      seniority: seniority ?? null,
      overall_score: review.overall_score,
      ats_score: ats.score,
      sub_scores: review.sub_scores,
      ats_breakdown: ats.checks,
      strengths: review.strengths,
      weaknesses: review.weaknesses,
      suggestions: review.suggestions,
      red_flags: redFlags,
      keyword_match: keywords,
      model,
      prompt_version: PROMPT_VERSION,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      latency_ms: latencyMs,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    console.error("[analyze] review insert failed", { message: insertError?.message });
    return NextResponse.json({ error: "Could not save the review." }, { status: 500 });
  }

  // Only count usage once the analysis actually succeeded — a provider outage
  // should not burn the user's daily allowance.
  const { error: usageError } = await supabase
    .from("usage_events")
    .insert({ user_id: user.id, kind: "analysis" });

  if (usageError) {
    console.error("[analyze] usage event insert failed", { message: usageError.message });
  }

  console.info("[analyze] complete", {
    userId: user.id,
    reviewId: inserted.id,
    model,
    tokensIn,
    tokensOut,
    latencyMs,
    atsScore: ats.score,
    overallScore: review.overall_score,
    hasJobTarget: Boolean(jobTargetId),
  });

  return NextResponse.json({ reviewId: inserted.id });
}
