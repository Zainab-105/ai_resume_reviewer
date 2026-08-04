import assert from "node:assert/strict";
import test from "node:test";

import { isRealRewrite, reviewOutputSchema, toGeminiSchema } from "../schema.ts";

const valid = {
  overall_score: 78,
  overall_rationale: "Strong delivery record, but the summary buries the best material.",
  sub_scores: { impact: 80, clarity: 70, formatting: 85, skills: 75, relevance: 72 },
  strengths: [
    { text: "Quantifies outcomes consistently across roles.", evidence: "cut deploy time 40%" },
    { text: "Shows clear scope growth into leadership.", evidence: "Led 6 engineers" },
    { text: "Stack matches modern backend expectations.", evidence: "TypeScript, Postgres, Go" },
  ],
  weaknesses: [
    { text: "The summary states no specialism.", severity: "major", evidence: "Backend engineer" },
    { text: "Second role has only one bullet.", severity: "minor", evidence: "Built internal tools" },
    { text: "No links to public work.", severity: "minor", evidence: "linkedin.com/in/janedoe" },
  ],
  suggestions: Array.from({ length: 5 }, (_, i) => ({
    section: `Experience — role ${i + 1}`,
    before: "Managed the team",
    after: "Led 6 engineers, cutting deploy time 40%",
    why: "Names the scope and the measurable outcome.",
  })),
};

test("valid model output passes the contract", () => {
  assert.equal(reviewOutputSchema.safeParse(valid).success, true);
});

test("out-of-range scores are rejected", () => {
  assert.equal(reviewOutputSchema.safeParse({ ...valid, overall_score: 140 }).success, false);
  assert.equal(reviewOutputSchema.safeParse({ ...valid, overall_score: -1 }).success, false);
});

test("too few strengths is rejected, so a thin review cannot be persisted", () => {
  const thin = { ...valid, strengths: valid.strengths.slice(0, 2) };
  assert.equal(reviewOutputSchema.safeParse(thin).success, false);
});

test("a strength without evidence is rejected", () => {
  const noEvidence = {
    ...valid,
    strengths: [{ text: "Great communicator with strong delivery." }, ...valid.strengths],
  };
  assert.equal(reviewOutputSchema.safeParse(noEvidence).success, false);
});

test("an invalid severity value is rejected", () => {
  const bad = {
    ...valid,
    weaknesses: [{ text: "Something is wrong here.", severity: "catastrophic", evidence: "x y z" }],
  };
  assert.equal(reviewOutputSchema.safeParse(bad).success, false);
});

test("a rewrite identical to the original is rejected", () => {
  assert.equal(
    isRealRewrite({ before: "Managed the team", after: "Managed the team" }),
    false,
  );
});

test("a rewrite differing only in dash style or spacing is rejected", () => {
  // Observed in production: "Mar 2018 - Dec 2020" -> "Mar 2018 – Dec 2020".
  assert.equal(
    isRealRewrite({ before: "Mar 2018 - Dec 2020", after: "Mar 2018 – Dec 2020" }),
    false,
  );
  assert.equal(
    isRealRewrite({ before: "Led  the team.", after: "Led the team" }),
    false,
  );
});

test("a genuine rewrite is kept", () => {
  assert.equal(
    isRealRewrite({
      before: "Managed the team",
      after: "Led 6 engineers, cutting deploy time 40%",
    }),
    true,
  );
});

test("Gemini schema strips keywords the API rejects", () => {
  const schema = toGeminiSchema(reviewOutputSchema);
  const serialised = JSON.stringify(schema);

  for (const banned of ["$schema", "additionalProperties", "exclusiveMinimum", "exclusiveMaximum"]) {
    assert.ok(!serialised.includes(banned), `schema still contains ${banned}`);
  }

  const root = schema as { type?: string; properties?: Record<string, unknown> };
  assert.equal(root.type, "object");
  for (const key of ["overall_score", "sub_scores", "strengths", "weaknesses", "suggestions"]) {
    assert.ok(root.properties?.[key], `schema is missing ${key}`);
  }
});
