import assert from "node:assert/strict";
import test from "node:test";

import { matchKeywords } from "../keywords.ts";

const resume = `Jane Doe - Senior Software Engineer
jane.doe@example.com
EXPERIENCE
Staff Engineer, Acme Corp, Jan 2021 - Present
- Built microservices in TypeScript running on Kubernetes
- Owned Postgres schema design and query tuning
- Set up CI/CD with GitHub Actions
SKILLS
TypeScript, React, Postgres, Kubernetes, Docker, AWS`;

const jd = `We are looking for a Senior Backend Engineer.

Requirements:
- Strong TypeScript and Node.js experience
- Experience with Kubernetes and Docker
- PostgreSQL or similar relational databases
- Familiarity with Terraform

Nice to have:
- GraphQL experience
- Machine learning exposure`;

test("terms present in the resume are matched with their source line", () => {
  const { hits } = matchKeywords(resume, jd);
  const typescript = hits.find((h) => h.keyword === "typescript");

  assert.ok(typescript, "expected typescript to be extracted from the posting");
  assert.equal(typescript.present, true);
  assert.ok(typescript.location, "a match must report where it was found");
});

test("missing required terms are reported", () => {
  const { missingRequired } = matchKeywords(resume, jd);
  assert.ok(missingRequired.includes("terraform"), `got [${missingRequired.join(", ")}]`);
});

test("nice-to-have terms do not count toward the required match percentage", () => {
  const { hits } = matchKeywords(resume, jd);
  const graphql = hits.find((h) => h.keyword === "graphql");

  assert.ok(graphql, "graphql should still be listed");
  assert.equal(graphql.required, false, "graphql sits under 'Nice to have'");
});

test("aliases match across naming conventions", () => {
  const { hits } = matchKeywords("Deployed to k8s clusters daily.", "Requirements:\n- Kubernetes");
  const kubernetes = hits.find((h) => h.keyword === "kubernetes");

  assert.equal(kubernetes?.present, true, "k8s in the resume should satisfy Kubernetes");
});

test("word boundaries prevent substring false positives", () => {
  const { hits } = matchKeywords("I enjoy going for runs.", "Requirements:\n- Go");
  const go = hits.find((h) => h.keyword === "go");

  assert.equal(go?.present, false, '"going" must not satisfy "Go"');
});

test("match percentage is bounded and an empty posting does not divide by zero", () => {
  const { matchPercent } = matchKeywords(resume, "");
  assert.ok(matchPercent >= 0 && matchPercent <= 100, `got ${matchPercent}`);
});

test("grammar words are never extracted as required keywords", () => {
  // Regression: every non-stopword token used to become a keyword, so users
  // were told their resume was missing "or", "as", "similar" and "in".
  const { hits } = matchKeywords(resume, jd);
  const extracted = new Set(hits.map((h) => h.keyword));

  for (const word of ["as", "or", "in", "similar", "code", "databases", "experience"]) {
    assert.ok(!extracted.has(word), `"${word}" is grammar, not a skill`);
  }
});

test("real technologies are still extracted", () => {
  const { hits } = matchKeywords(resume, jd);
  const extracted = new Set(hits.map((h) => h.keyword));

  for (const tech of ["typescript", "kubernetes", "docker", "terraform"]) {
    assert.ok(extracted.has(tech), `expected "${tech}", got [${[...extracted].join(", ")}]`);
  }
});

test("lowercase technologies with a technical shape survive", () => {
  const { hits } = matchKeywords("I use k8s and node.js daily.", "Requirements:\n- node.js\n- c++");
  const extracted = new Set(hits.map((h) => h.keyword));

  assert.ok(extracted.has("node.js"), `got [${[...extracted].join(", ")}]`);
  assert.ok(extracted.has("c++"), `got [${[...extracted].join(", ")}]`);
});

test("a fully matching resume scores 100%", () => {
  const { matchPercent } = matchKeywords(
    "TypeScript Kubernetes Postgres Terraform",
    "Requirements:\n- TypeScript\n- Kubernetes\n- Postgres\n- Terraform",
  );
  assert.equal(matchPercent, 100);
});
