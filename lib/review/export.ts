/**
 * Rendering a review as portable text.
 *
 * One shaping function feeds both the Markdown copy and the PDF, so the two
 * cannot drift apart in what they include.
 */

import type { Strength, Suggestion, SubScores, Weakness } from "@/lib/ai/schema";
import type { AtsCheck } from "@/lib/resume/ats";
import type { KeywordMatch } from "@/lib/resume/keywords";
import type { ScoreDelta } from "@/lib/resume/line-matching";
import type { RedFlag } from "@/lib/resume/red-flags";

export interface ExportableReview {
  fileName: string;
  version: number | null;
  createdAt: string;
  targetRole: string | null;
  overallScore: number | null;
  atsScore: number | null;
  subScores: SubScores | null;
  atsBreakdown: AtsCheck[];
  strengths: Strength[];
  weaknesses: Weakness[];
  suggestions: Suggestion[];
  redFlags: RedFlag[];
  keywordMatch: KeywordMatch | null;
  scoreDelta: ScoreDelta | null;
}

const SEVERITY_LABEL: Record<string, string> = {
  critical: "Critical",
  major: "Major",
  minor: "Minor",
};

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

/**
 * Escapes the Markdown characters that actually cause trouble inside body
 * text, so a resume line like "**Lead** developer" does not turn the report
 * bold.
 *
 * Deliberately narrow. Escaping every control character mangles ordinary
 * resume content — "Node.js" becomes "Node\.js" and "C++" becomes "C\+\+",
 * which is unreadable and breaks the copy-paste this feature exists for.
 * Characters like `.`, `+` and `-` only have meaning at the start of a line,
 * and every interpolation here is mid-line or inside a table cell.
 */
function md(text: string): string {
  return text.replace(/([\\`*_[\]|])/g, "\\$1");
}

export function reviewToMarkdown(review: ExportableReview): string {
  const out: string[] = [];

  out.push(`# Resume review — ${review.fileName}`);

  const meta = [
    review.version && review.version > 1 ? `Version ${review.version}` : null,
    review.targetRole ? `Target role: ${review.targetRole}` : null,
    `Reviewed ${new Date(review.createdAt).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    })}`,
  ].filter(Boolean);
  out.push(`_${meta.join(" · ")}_`);

  // --- Scores ---------------------------------------------------------------
  out.push("\n## Scores\n");
  out.push(`| Metric | Score |`);
  out.push(`| --- | ---: |`);
  out.push(`| Overall | ${review.overallScore ?? "—"} / 100 |`);
  out.push(`| ATS | ${review.atsScore ?? "—"} / 100 |`);

  if (review.keywordMatch) {
    out.push(`| Job match | ${review.keywordMatch.matchPercent}% of required keywords |`);
  }

  if (review.subScores) {
    out.push(`| Impact | ${review.subScores.impact} |`);
    out.push(`| Clarity | ${review.subScores.clarity} |`);
    out.push(`| Formatting | ${review.subScores.formatting} |`);
    out.push(`| Skills coverage | ${review.subScores.skills} |`);
    out.push(`| Relevance | ${review.subScores.relevance} |`);
  }

  if (review.scoreDelta && (review.scoreDelta.overall !== null || review.scoreDelta.ats !== null)) {
    // "ATS 0" reads as a score rather than a change, so say it in words.
    const describe = (label: string, value: number | null) =>
      value === null ? null : value === 0 ? `${label} unchanged` : `${label} ${signed(value)}`;

    const parts = [
      describe("overall", review.scoreDelta.overall),
      describe("ATS", review.scoreDelta.ats),
    ].filter(Boolean);

    out.push(`\nSince version ${review.scoreDelta.previousVersion}: ${parts.join(", ")}.`);
  }

  // --- ATS rubric -----------------------------------------------------------
  if (review.atsBreakdown.length) {
    out.push("\n## ATS breakdown\n");
    out.push("These checks are computed in code, not by the AI, so the same resume always scores the same.\n");
    out.push(`| Check | Score | Detail |`);
    out.push(`| --- | ---: | --- |`);
    for (const check of review.atsBreakdown) {
      const earned = Math.round(check.ratio * check.weight);
      out.push(`| ${md(check.label)} | ${earned}/${check.weight} | ${md(check.detail)} |`);
    }
  }

  // --- Keywords -------------------------------------------------------------
  if (review.keywordMatch?.hits?.length) {
    const { matchPercent, missingRequired, hits } = review.keywordMatch;
    out.push(`\n## Job match — ${matchPercent}% of required keywords\n`);

    if (missingRequired.length) {
      out.push(`**Missing required keywords:** ${missingRequired.map(md).join(", ")}\n`);
    } else {
      out.push("Every required keyword appears somewhere in the resume.\n");
    }

    out.push(`| Keyword | Required | In resume |`);
    out.push(`| --- | --- | --- |`);
    for (const hit of hits.slice(0, 40)) {
      out.push(
        `| ${md(hit.keyword)} | ${hit.required ? "Required" : "Preferred"} | ${hit.present ? "Yes" : "No"} |`,
      );
    }
  }

  // --- Red flags ------------------------------------------------------------
  if (review.redFlags.length) {
    out.push("\n## Red flags\n");
    for (const flag of review.redFlags) {
      out.push(`- **${md(flag.title)}** (${SEVERITY_LABEL[flag.severity] ?? flag.severity}) — ${md(flag.detail)}`);
    }
  }

  // --- Strengths ------------------------------------------------------------
  if (review.strengths.length) {
    out.push("\n## Strengths\n");
    for (const strength of review.strengths) {
      out.push(`- ${md(strength.text)}`);
      out.push(`  > ${md(strength.evidence)}`);
    }
  }

  // --- Weaknesses -----------------------------------------------------------
  if (review.weaknesses.length) {
    out.push("\n## Weaknesses\n");
    for (const weakness of review.weaknesses) {
      out.push(`- **${SEVERITY_LABEL[weakness.severity] ?? weakness.severity}** — ${md(weakness.text)}`);
      out.push(`  > ${md(weakness.evidence)}`);
    }
  }

  // --- Suggestions ----------------------------------------------------------
  if (review.suggestions.length) {
    out.push("\n## Suggested rewrites\n");
    review.suggestions.forEach((suggestion, index) => {
      out.push(`### ${index + 1}. ${md(suggestion.section)}\n`);
      out.push(`**Before**\n`);
      out.push(`> ${md(suggestion.before)}\n`);
      out.push(`**After**\n`);
      out.push(`> ${md(suggestion.after)}\n`);
      out.push(`${md(suggestion.why)}\n`);
    });
  }

  out.push("\n---\n");
  out.push("_Generated by AI Resume Reviewer. The ATS score is computed from a published rubric; the written feedback is AI-generated and quotes the resume as evidence._");

  return out.join("\n");
}

/** A filesystem-safe download name, e.g. `Jane-Doe-Resume-review-2026-08-04.md`. */
export function exportFileName(review: ExportableReview, extension: "md" | "pdf"): string {
  const base = review.fileName
    .replace(/\.pdf$/i, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");

  const date = new Date(review.createdAt).toISOString().slice(0, 10);
  const version = review.version && review.version > 1 ? `-v${review.version}` : "";

  return `${base || "resume"}${version}-review-${date}.${extension}`;
}
