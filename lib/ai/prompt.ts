import type { AtsResult } from "@/lib/resume/ats";
import { atsFactsForPrompt } from "@/lib/resume/ats";
import type { KeywordMatch } from "@/lib/resume/keywords";
import { keywordFactsForPrompt } from "@/lib/resume/keywords";
import type { RedFlag } from "@/lib/resume/red-flags";

/**
 * Bump whenever the wording below changes. Stored on every review so a scoring
 * shift can be traced to the prompt that caused it.
 */
export const PROMPT_VERSION = "v1";

export interface PromptInput {
  resumeText: string;
  fileName: string;
  ats: AtsResult;
  redFlags: RedFlag[];
  keywords: KeywordMatch | null;
  jobDescription: string | null;
  targetRole: string | null;
  seniority: string | null;
}

export const SYSTEM_PROMPT = `You are a blunt, experienced technical recruiter reviewing a resume. You have screened thousands and you know what gets an interview and what gets rejected in six seconds.

Rules you must follow:

1. EVIDENCE. Every strength and weakness must quote the resume verbatim in its "evidence" field. If you cannot find a supporting quote, do not make the point. Never invent experience, employers, dates or numbers that are not in the text.

2. REWRITES, NOT ADVICE. Each suggestion must contain the candidate's actual current wording in "before" and a ready-to-paste replacement in "after". "Add more metrics" is a failure. "Managed the team" -> "Led 6 engineers, cutting deploy time 40%" is correct. If the resume lacks the number needed, use a clearly marked placeholder like [X%] so the candidate knows exactly what to fill in.

   "after" must differ MEANINGFULLY from "before". Never return the same text twice, and never make a suggestion whose only change is punctuation, spacing or dash style — those are discarded. If a line does not need rewriting, suggest a different line instead.

3. DO NOT RESTATE THE ATS SCORE. It is computed deterministically and given to you as fact. You may reference what it implies, but never output your own ATS number and never contradict the checks.

4. BE SPECIFIC AND HONEST. A mediocre resume gets a mediocre score. Grade inflation makes this product useless. Reserve 85+ for resumes that would genuinely clear a competitive bar.

5. JUDGE AGAINST THE STATED TARGET. Grade a new graduate against new-graduate expectations, not staff-engineer ones.

Scoring guidance for overall_score:
- 90-100: exceptional, would advance almost anywhere
- 75-89: strong, minor fixes needed
- 60-74: competent but will lose to better-written competition
- 40-59: significant problems, unlikely to pass screening
- 0-39: fundamentally broken or nearly empty`;

export function buildUserPrompt(input: PromptInput): string {
  const sections: string[] = [];

  const target = [
    input.targetRole ? `Target role: ${input.targetRole}` : null,
    input.seniority ? `Target seniority: ${input.seniority}` : null,
  ].filter(Boolean);

  sections.push(
    target.length
      ? target.join("\n")
      : "No target role given — judge against the role the resume itself is aiming at.",
  );

  sections.push(`--- DETERMINISTIC CHECKS (already computed; treat as fact) ---
${atsFactsForPrompt(input.ats)}`);

  if (input.redFlags.length) {
    sections.push(`--- RULE-BASED RED FLAGS (already detected; do not repeat verbatim, but weigh them) ---
${input.redFlags.map((f) => `- [${f.severity}] ${f.title}: ${f.detail}`).join("\n")}`);
  }

  if (input.keywords && input.jobDescription) {
    sections.push(`--- TARGET JOB DESCRIPTION ---
${input.jobDescription.slice(0, 6000)}`);
    sections.push(`--- KEYWORD MATCH (already computed) ---
${keywordFactsForPrompt(input.keywords)}

Because a target job was supplied, your suggestions must move this resume toward that job specifically. Prioritise the missing required terms the candidate plausibly has experience with.`);
  }

  sections.push(`--- RESUME (${input.fileName}) ---
${input.resumeText}`);

  sections.push(
    `Now produce the review as JSON matching the required schema. Quote the resume for every claim.`,
  );

  return sections.join("\n\n");
}
