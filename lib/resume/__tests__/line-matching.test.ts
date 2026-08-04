import assert from "node:assert/strict";
import test from "node:test";

import {
  SAME_LINE_THRESHOLD,
  contentSimilarity,
  matchLine,
  normaliseFileName,
  scoreDelta,
} from "../line-matching.ts";

const v1 = `Jane Doe - Senior Software Engineer
jane.doe@example.com | 555-123-4567
SUMMARY
Backend engineer with 7 years building distributed systems.
EXPERIENCE
Staff Engineer, Acme Corp, Jan 2021 - Present
- Led 6 engineers and cut deploy time 40%
- Scaled the payments API to 12000 requests per second
- Reduced p99 latency from 800ms to 120ms
EDUCATION
BS Computer Science, State University, 2018
SKILLS
TypeScript, React, Postgres, Kubernetes, Go, AWS`;

// The same resume after acting on the review: bullets rewritten, keywords added.
const v2 = `Jane Doe - Senior Backend Engineer
jane.doe@example.com | 555-123-4567
SUMMARY
Senior backend engineer with 7 years building distributed systems in production.
EXPERIENCE
Staff Engineer, Acme Corp, Jan 2021 - Present
- Led 6 engineers to containerize services with Docker, cutting deploy time 40%
- Scaled the payments API to 12000 requests per second using Terraform on AWS
- Reduced p99 latency from 800ms to 120ms
EDUCATION
BS Computer Science, State University, 2018
SKILLS
TypeScript, React, Postgres, Kubernetes, Docker, Terraform, Go, AWS`;

// A different person entirely.
const other = `Marcus Chen - Product Designer
marcus@example.com
SUMMARY
Product designer focused on accessibility and design systems.
EXPERIENCE
Senior Designer, Globex, Mar 2019 - Present
- Ran 30 usability sessions with assistive technology users
- Lifted activation 18% through onboarding redesign
EDUCATION
BA Graphic Design, Art College, 2017
SKILLS
Figma, prototyping, user research, WCAG`;

test("an edited version of the same resume scores above the threshold", () => {
  const similarity = contentSimilarity(v1, v2);
  assert.ok(
    similarity >= SAME_LINE_THRESHOLD,
    `expected >= ${SAME_LINE_THRESHOLD}, got ${similarity.toFixed(3)}`,
  );
});

test("a different person's resume scores well below the threshold", () => {
  const similarity = contentSimilarity(v1, other);
  assert.ok(
    similarity < SAME_LINE_THRESHOLD,
    `expected < ${SAME_LINE_THRESHOLD}, got ${similarity.toFixed(3)}`,
  );
});

test("similarity is symmetric and self-similarity is 1", () => {
  assert.equal(contentSimilarity(v1, v1), 1);
  assert.equal(
    contentSimilarity(v1, other).toFixed(6),
    contentSimilarity(other, v1).toFixed(6),
  );
});

test("empty text never matches, so it cannot merge into someone's line", () => {
  assert.equal(contentSimilarity("", v1), 0);
  assert.equal(contentSimilarity("", ""), 0);
});

test("filename normalisation strips version and status noise", () => {
  assert.equal(normaliseFileName("Jane-Resume-v3 (final).pdf"), "jane-resume");
  assert.equal(normaliseFileName("jane_resume_FINAL_v2.pdf"), "jane-resume");
  assert.equal(normaliseFileName("Jane Resume.pdf"), "jane-resume");
  assert.equal(normaliseFileName("resume copy 2.pdf"), "resume");
});

test("an edited resume is matched to its existing line", () => {
  const match = matchLine(v2, "Jane-Doe-Resume-v2.pdf", [
    { lineId: "line-1", label: "Jane Doe Resume", extractedText: v1, fileName: "Jane-Doe-Resume.pdf" },
  ]);

  assert.equal(match?.lineId, "line-1");
});

test("a different resume starts a new line even with an identical filename", () => {
  const match = matchLine(other, "Jane-Doe-Resume.pdf", [
    { lineId: "line-1", label: "Jane Doe Resume", extractedText: v1, fileName: "Jane-Doe-Resume.pdf" },
  ]);

  assert.equal(match, null, "a filename collision must not merge different documents");
});

test("the most similar line wins when several exist", () => {
  const match = matchLine(v2, "resume.pdf", [
    { lineId: "designer", label: "Design CV", extractedText: other, fileName: "marcus.pdf" },
    { lineId: "engineer", label: "Jane Doe Resume", extractedText: v1, fileName: "jane.pdf" },
  ]);

  assert.equal(match?.lineId, "engineer");
});

test("no candidates means a new line", () => {
  assert.equal(matchLine(v1, "resume.pdf", []), null);
});

test("score delta reports improvement and regression", () => {
  const delta = scoreDelta(
    { overall: 84, ats: 92 },
    { overall: 71, ats: 98, version: 1, reviewId: "review-1" },
  );

  assert.equal(delta.overall, 13, "overall improved");
  assert.equal(delta.ats, -6, "ATS regressed and must not be hidden");
  assert.equal(delta.previousVersion, 1);
  assert.equal(delta.previousReviewId, "review-1");
});

test("score delta is null when a previous score is missing", () => {
  const delta = scoreDelta(
    { overall: 80, ats: 90 },
    { overall: null, ats: null, version: 1, reviewId: "review-1" },
  );

  assert.equal(delta.overall, null);
  assert.equal(delta.ats, null);
});
