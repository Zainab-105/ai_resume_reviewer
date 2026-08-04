import assert from "node:assert/strict";
import test from "node:test";

import {
  compareAtsChecks,
  compareKeywords,
  compareStrengths,
  compareWeaknesses,
  findingSimilarity,
  SAME_FINDING_THRESHOLD,
  suggestionsAdopted,
} from "../compare.ts";

const weakness = (text: string, severity: "critical" | "major" | "minor" = "major") => ({
  text,
  severity,
  evidence: "some quoted line",
});

/** Realistic rewordings the model produces between runs. */
const SAME_ISSUE = [
  [
    "Omits Node.js completely despite it being a key required skill for the target role",
    "Missing Node.js, which the target role lists as a core requirement",
  ],
  [
    "Dates are written in two different formats",
    "Dates are still written in two different formats",
  ],
  [
    "Fails to use the exact keyword phrase Infrastructure as Code despite using Terraform",
    "Does not use the phrase infrastructure as code even though Terraform is mentioned",
  ],
  [
    "Summary line is brief and misses core backend stack details",
    "The summary is too short and omits the main backend technologies",
  ],
];

const DIFFERENT_ISSUES = [
  [
    "Omits Node.js completely despite it being a key required skill",
    "Dates are formatted inconsistently across the work history section",
  ],
  [
    "Summary line is brief and misses core backend stack",
    "No links to public work or a portfolio are provided",
  ],
  ["Missing Docker experience", "Employment gap of 30 months between roles"],
];

test("rewordings of one issue score above the threshold", () => {
  for (const [a, b] of SAME_ISSUE) {
    const score = findingSimilarity(a, b);
    assert.ok(
      score >= SAME_FINDING_THRESHOLD,
      `"${a.slice(0, 40)}..." vs "${b.slice(0, 40)}..." scored ${score.toFixed(3)}`,
    );
  }
});

test("unrelated issues score below the threshold", () => {
  for (const [a, b] of DIFFERENT_ISSUES) {
    const score = findingSimilarity(a, b);
    assert.ok(
      score < SAME_FINDING_THRESHOLD,
      `"${a.slice(0, 40)}..." vs "${b.slice(0, 40)}..." scored ${score.toFixed(3)}`,
    );
  }
});

test("the threshold sits in open space between the two populations", () => {
  // Guards the tuning itself: if a future change narrows this gap, the
  // matching is no longer trustworthy even if every case above still passes.
  const worstSame = Math.min(...SAME_ISSUE.map(([a, b]) => findingSimilarity(a, b)));
  const bestDifferent = Math.max(...DIFFERENT_ISSUES.map(([a, b]) => findingSimilarity(a, b)));

  assert.ok(
    worstSame > bestDifferent,
    `populations overlap: worst same ${worstSame.toFixed(3)} <= best different ${bestDifferent.toFixed(3)}`,
  );
  assert.ok(
    SAME_FINDING_THRESHOLD > bestDifferent && SAME_FINDING_THRESHOLD <= worstSame,
    `threshold ${SAME_FINDING_THRESHOLD} is not between ${bestDifferent.toFixed(3)} and ${worstSame.toFixed(3)}`,
  );
});

test("a fixed weakness is reported as resolved, not resolved-and-reintroduced", () => {
  const before = [
    weakness("Omits Node.js despite it being required for the role", "critical"),
    weakness("Dates are written in two different formats", "minor"),
  ];
  const after = [weakness("Dates are still written in two different formats", "minor")];

  const { resolved, introduced, persisting } = compareWeaknesses(before, after);

  assert.equal(resolved.length, 1, "the Node.js issue was fixed");
  assert.ok(resolved[0].text.includes("Node.js"));
  assert.equal(persisting.length, 1, "the date issue persists");
  assert.equal(introduced.length, 0, "nothing new was introduced");
});

test("a newly introduced weakness is reported as introduced", () => {
  const before = [weakness("Dates are inconsistent")];
  const after = [
    weakness("Dates are inconsistent"),
    weakness("The summary now exceeds four lines and buries the lede"),
  ];

  const { resolved, introduced, persisting } = compareWeaknesses(before, after);

  assert.equal(resolved.length, 0);
  assert.equal(persisting.length, 1);
  assert.equal(introduced.length, 1);
  assert.ok(introduced[0].text.includes("summary"));
});

test("each old finding claims at most one new finding", () => {
  // Two similar new findings must not both pair with the same old one.
  const before = [weakness("Missing Docker experience")];
  const after = [weakness("Missing Docker experience"), weakness("Missing Docker and Kubernetes")];

  const { persisting, introduced } = compareWeaknesses(before, after);

  assert.equal(persisting.length, 1);
  assert.equal(introduced.length, 1, "the second must be reported as new, not swallowed");
});

test("empty inputs are handled at both ends", () => {
  assert.deepEqual(compareWeaknesses([], []), { resolved: [], introduced: [], persisting: [] });

  const fromNothing = compareWeaknesses([], [weakness("A new problem appeared")]);
  assert.equal(fromNothing.introduced.length, 1);

  const toNothing = compareWeaknesses([weakness("An old problem")], []);
  assert.equal(toNothing.resolved.length, 1);
});

test("ATS check comparison reports only what moved", () => {
  const check = (id: string, label: string, weight: number, ratio: number) => ({
    id: id as never,
    label,
    weight,
    ratio,
    passed: ratio >= 0.999,
    detail: "",
  });

  const before = [
    check("quantified-achievements", "Quantified impact", 15, 0.33),
    check("bullet-usage", "Bulleted achievements", 10, 1),
  ];
  const after = [
    check("quantified-achievements", "Quantified impact", 15, 1),
    check("bullet-usage", "Bulleted achievements", 10, 1),
  ];

  const changes = compareAtsChecks(before, after);

  assert.equal(changes.length, 1, "an unchanged check is noise");
  assert.equal(changes[0].id, "quantified-achievements");
  assert.equal(changes[0].delta, 10, "5/15 -> 15/15");
});

test("a regressed ATS check is surfaced, not hidden", () => {
  const check = (id: string, ratio: number) => ({
    id: id as never,
    label: "File hygiene",
    weight: 10,
    ratio,
    passed: ratio >= 0.999,
    detail: "",
  });

  const changes = compareAtsChecks([check("file-hygiene", 1)], [check("file-hygiene", 0.5)]);

  assert.equal(changes[0].delta, -5);
});

test("keyword comparison reports gains, losses and what is still missing", () => {
  const match = (present: string[], missing: string[], percent: number) => ({
    matchPercent: percent,
    hits: present.map((k: string) => ({
      keyword: k,
      present: true,
      location: "x",
      required: true,
    })),
    missingRequired: missing,
  });

  const change = compareKeywords(
    match(["typescript"], ["docker", "terraform"], 33),
    match(["typescript", "docker"], ["terraform"], 66),
  );

  assert.deepEqual(change?.gained, ["docker"]);
  assert.deepEqual(change?.lost, []);
  assert.deepEqual(change?.stillMissing, ["terraform"]);
  assert.equal(change?.beforePercent, 33);
  assert.equal(change?.afterPercent, 66);
});

test("keyword comparison is null when either review had no job description", () => {
  const match = { matchPercent: 50, hits: [{ keyword: "x", present: true, location: null, required: true }], missingRequired: [] };
  assert.equal(compareKeywords(null, match), null);
  assert.equal(compareKeywords(match, null), null);
});

test("strengths gained and lost are tracked separately", () => {
  const strength = (text: string) => ({ text, evidence: "quoted" });

  const { kept, gained, lost } = compareStrengths(
    [strength("Quantifies outcomes consistently across roles")],
    [
      strength("Quantifies outcomes consistently in every role"),
      strength("Now demonstrates infrastructure ownership with Terraform"),
    ],
  );

  assert.equal(kept.length, 1);
  assert.equal(gained.length, 1);
  assert.equal(lost.length, 0);
});

test("a suggestion is counted adopted only if its wording reached the resume", () => {
  const suggestion = {
    section: "Skills",
    before: "TypeScript, React",
    after: "TypeScript, Node.js, PostgreSQL, Docker, Terraform",
    why: "adds required keywords",
  };

  const applied = suggestionsAdopted(
    [suggestion],
    "SKILLS\nTypeScript, Node.js, PostgreSQL, Docker, Terraform, AWS",
  );
  assert.equal(applied.adopted.length, 1);

  const notApplied = suggestionsAdopted([suggestion], "SKILLS\nTypeScript, React");
  assert.equal(notApplied.ignored.length, 1);
});
