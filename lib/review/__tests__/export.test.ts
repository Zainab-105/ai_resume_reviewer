import assert from "node:assert/strict";
import test from "node:test";

import { exportFileName, reviewToMarkdown, type ExportableReview } from "../export.ts";

const review: ExportableReview = {
  fileName: "Jane-Doe-Resume.pdf",
  version: 2,
  createdAt: "2026-08-04T10:00:00.000Z",
  targetRole: "Senior Backend Engineer",
  overallScore: 82,
  atsScore: 98,
  subScores: { impact: 88, clarity: 85, formatting: 90, skills: 78, relevance: 82 },
  atsBreakdown: [
    {
      id: "quantified-achievements",
      label: "Quantified impact",
      weight: 15,
      ratio: 1,
      passed: true,
      detail: "5 of 5 bullets include a concrete number.",
    },
    {
      id: "date-consistency",
      label: "Consistent date formats",
      weight: 10,
      ratio: 0.8,
      passed: false,
      detail: "Dates are written 2 different ways.",
    },
  ],
  strengths: [{ text: "Quantifies outcomes", evidence: "cut deploy time 40%" }],
  weaknesses: [{ text: "Omits Node.js", severity: "critical", evidence: "SKILLS TypeScript, Go" }],
  suggestions: [
    {
      section: "Skills",
      before: "TypeScript, React",
      after: "TypeScript, Node.js, Docker",
      why: "Adds the required keywords.",
    },
  ],
  redFlags: [
    {
      id: "gap-1",
      severity: "major",
      title: "18-month gap between roles",
      detail: "Recruiters ask about unexplained gaps.",
    },
  ],
  keywordMatch: {
    matchPercent: 78,
    hits: [
      { keyword: "typescript", present: true, location: "SKILLS", required: true },
      { keyword: "node.js", present: false, location: null, required: true },
    ],
    missingRequired: ["node.js"],
  },
  scoreDelta: { overall: 4, ats: 0, previousVersion: 1, previousReviewId: "prev-id" },
};

test("every section of the review reaches the Markdown", () => {
  const output = reviewToMarkdown(review);

  for (const heading of [
    "# Resume review",
    "## Scores",
    "## ATS breakdown",
    "## Job match",
    "## Red flags",
    "## Strengths",
    "## Weaknesses",
    "## Suggested rewrites",
  ]) {
    assert.ok(output.includes(heading), `missing "${heading}"`);
  }
});

test("scores and the version delta are carried across", () => {
  const output = reviewToMarkdown(review);

  assert.ok(output.includes("82 / 100"), "overall score");
  assert.ok(output.includes("98 / 100"), "ATS score");
  assert.ok(output.includes("78% of required keywords"), "job match");
  assert.ok(output.includes("Since version 1"), "delta context");
  assert.ok(output.includes("overall +4"), "delta is signed");
});

test("both halves of a rewrite survive, since one without the other is useless", () => {
  const output = reviewToMarkdown(review);

  assert.ok(output.includes("TypeScript, React"), "before");
  assert.ok(output.includes("TypeScript, Node.js, Docker"), "after");
  assert.ok(output.includes("Adds the required keywords"), "rationale");
});

test("evidence quotes are preserved", () => {
  const output = reviewToMarkdown(review);
  assert.ok(output.includes("cut deploy time 40%"));
  assert.ok(output.includes("SKILLS TypeScript, Go"));
});

test("Markdown control characters in resume text are escaped", () => {
  // A resume line like "**Lead** dev" must not turn the report bold.
  const risky: ExportableReview = {
    ...review,
    strengths: [{ text: "Uses *emphasis* oddly", evidence: "**Lead** _developer_ [note]" }],
  };

  const output = reviewToMarkdown(risky);
  assert.ok(output.includes("\\*\\*Lead\\*\\*"), "asterisks escaped");
  assert.ok(output.includes("\\_developer\\_"), "underscores escaped");
});

test("a review missing optional sections still renders", () => {
  const sparse: ExportableReview = {
    ...review,
    subScores: null,
    keywordMatch: null,
    redFlags: [],
    scoreDelta: null,
    atsBreakdown: [],
  };

  const output = reviewToMarkdown(sparse);
  assert.ok(output.includes("## Scores"));
  assert.ok(!output.includes("## Job match"), "omitted rather than rendered empty");
  assert.ok(!output.includes("## Red flags"));
  assert.ok(output.includes("## Strengths"), "present sections still render");
});

test("null scores render as a dash rather than 'null'", () => {
  const unscored: ExportableReview = { ...review, overallScore: null, atsScore: null };
  const output = reviewToMarkdown(unscored);

  assert.ok(output.includes("— / 100"));
  assert.ok(!output.toLowerCase().includes("null"), "never leak the word null into a report");
});

test("the download name is filesystem-safe and dated", () => {
  assert.equal(exportFileName(review, "md"), "Jane-Doe-Resume-v2-review-2026-08-04.md");

  const messy = { ...review, fileName: "my resume (final) v3!.pdf", version: 1 };
  const name = exportFileName(messy, "pdf");

  assert.ok(!/[^A-Za-z0-9._-]/.test(name), `"${name}" contains unsafe characters`);
  assert.ok(name.endsWith(".pdf"));
});
