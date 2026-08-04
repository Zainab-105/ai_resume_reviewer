/**
 * Comparing two reviews.
 *
 * The hard part is matching findings across runs. The model rewords the same
 * issue every time — "Omits Node.js despite it being required" and "Missing
 * Node.js, a core requirement" are one problem, not two. Exact string matching
 * would report every finding as simultaneously resolved and newly introduced,
 * which is worse than showing nothing.
 *
 * So findings are matched by content overlap, with a threshold tuned to be
 * forgiving: a missed match shows a real issue twice, while a false match
 * hides an issue the user still has.
 */

import type { AtsCheck } from "@/lib/resume/ats";
import type { Strength, Suggestion, Weakness } from "@/lib/ai/schema";
import type { KeywordMatch } from "@/lib/resume/keywords";

/**
 * Above this, two findings are treated as the same underlying issue.
 *
 * Measured on realistic pairs: reworded versions of one issue score 0.29–1.00,
 * while unrelated issues score exactly 0.00 — they share no domain terms at
 * all once filler is stripped. With that much daylight the threshold sits low,
 * favouring recall: a missed match shows one real issue twice, whereas a false
 * match tells someone they fixed a problem they still have.
 */
export const SAME_FINDING_THRESHOLD = 0.2;

const FILLER = new Set([
  "the", "and", "for", "with", "that", "this", "from", "have", "has", "are",
  "was", "were", "its", "your", "you", "not", "but", "all", "can", "will",
  "which", "their", "there", "these", "those", "such", "into", "than", "then",
  "resume", "candidate", "section", "line", "lines", "bullet", "bullets",
]);

function tokens(text: string): Set<string> {
  return new Set(
    (text.toLowerCase().match(/[a-z][a-z0-9'+.#-]{2,}/g) ?? []).filter((w) => !FILLER.has(w)),
  );
}

/**
 * Overlap coefficient — shared tokens over the *smaller* set.
 *
 * Jaccard was the obvious choice but divides by the union, so a finding the
 * model expanded from eight words to twenty scores low despite naming the same
 * problem: "Omits Node.js despite it being required" vs "Missing Node.js,
 * which the target role lists as a core requirement" scored 0.21 under Jaccard
 * and 0.6 here. Since a finding is a short phrase whose length varies freely
 * between runs, penalising the union is measuring the wrong thing.
 */
export function findingSimilarity(a: string, b: string): number {
  const setA = tokens(a);
  const setB = tokens(b);
  if (!setA.size || !setB.size) return 0;

  let shared = 0;
  for (const token of setA) if (setB.has(token)) shared += 1;

  return shared / Math.min(setA.size, setB.size);
}

export interface WeaknessComparison {
  resolved: Weakness[];
  introduced: Weakness[];
  persisting: { before: Weakness; after: Weakness }[];
}

/**
 * Greedy best-match pairing. Each old finding claims its closest unclaimed
 * new finding above the threshold; leftovers on each side are resolved or
 * introduced respectively.
 */
export function compareWeaknesses(before: Weakness[], after: Weakness[]): WeaknessComparison {
  const claimed = new Set<number>();
  const persisting: { before: Weakness; after: Weakness }[] = [];
  const resolved: Weakness[] = [];

  for (const old of before) {
    let bestIndex = -1;
    let bestScore = 0;

    after.forEach((candidate, index) => {
      if (claimed.has(index)) return;
      const score = findingSimilarity(old.text, candidate.text);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });

    if (bestIndex >= 0 && bestScore >= SAME_FINDING_THRESHOLD) {
      claimed.add(bestIndex);
      persisting.push({ before: old, after: after[bestIndex] });
    } else {
      resolved.push(old);
    }
  }

  const introduced = after.filter((_, index) => !claimed.has(index));

  return { resolved, introduced, persisting };
}

export interface AtsCheckChange {
  id: string;
  label: string;
  weight: number;
  beforeEarned: number;
  afterEarned: number;
  delta: number;
}

/** Per-check movement, so a flat total doesn't hide offsetting changes. */
export function compareAtsChecks(before: AtsCheck[], after: AtsCheck[]): AtsCheckChange[] {
  const beforeById = new Map(before.map((c) => [c.id, c]));

  return after
    .map((check) => {
      const previous = beforeById.get(check.id);
      const beforeEarned = previous ? Math.round(previous.ratio * previous.weight) : 0;
      const afterEarned = Math.round(check.ratio * check.weight);

      return {
        id: check.id,
        label: check.label,
        weight: check.weight,
        beforeEarned,
        afterEarned,
        delta: afterEarned - beforeEarned,
      };
    })
    .filter((change) => change.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

export interface KeywordChange {
  gained: string[];
  lost: string[];
  stillMissing: string[];
  beforePercent: number | null;
  afterPercent: number | null;
}

export function compareKeywords(
  before: KeywordMatch | null,
  after: KeywordMatch | null,
): KeywordChange | null {
  // Only comparable when both runs targeted a job description.
  if (!before?.hits?.length || !after?.hits?.length) return null;

  const beforePresent = new Set(before.hits.filter((h) => h.present).map((h) => h.keyword));
  const afterPresent = new Set(after.hits.filter((h) => h.present).map((h) => h.keyword));

  const gained = [...afterPresent].filter((k) => !beforePresent.has(k)).sort();
  const lost = [...beforePresent].filter((k) => !afterPresent.has(k)).sort();

  return {
    gained,
    lost,
    stillMissing: after.missingRequired ?? [],
    beforePercent: before.matchPercent ?? null,
    afterPercent: after.matchPercent ?? null,
  };
}

export interface StrengthComparison {
  kept: Strength[];
  gained: Strength[];
  lost: Strength[];
}

export function compareStrengths(before: Strength[], after: Strength[]): StrengthComparison {
  const claimed = new Set<number>();
  const kept: Strength[] = [];
  const lost: Strength[] = [];

  for (const old of before) {
    let bestIndex = -1;
    let bestScore = 0;

    after.forEach((candidate, index) => {
      if (claimed.has(index)) return;
      const score = findingSimilarity(old.text, candidate.text);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });

    if (bestIndex >= 0 && bestScore >= SAME_FINDING_THRESHOLD) {
      claimed.add(bestIndex);
      kept.push(after[bestIndex]);
    } else {
      lost.push(old);
    }
  }

  return { kept, gained: after.filter((_, i) => !claimed.has(i)), lost };
}

/**
 * Whether the suggestions from the earlier review appear to have been acted
 * on: did the "after" text the model proposed actually make it into the new
 * resume?
 */
export function suggestionsAdopted(
  suggestions: Suggestion[],
  newResumeText: string,
): { adopted: Suggestion[]; ignored: Suggestion[] } {
  const adopted: Suggestion[] = [];
  const ignored: Suggestion[] = [];

  for (const suggestion of suggestions) {
    // A proposed rewrite is rarely pasted verbatim, so look for substantial
    // overlap with the new text rather than an exact match.
    const proposed = tokens(suggestion.after);
    const current = tokens(newResumeText);

    let shared = 0;
    for (const token of proposed) if (current.has(token)) shared += 1;

    const coverage = proposed.size ? shared / proposed.size : 0;
    if (coverage >= 0.75) adopted.push(suggestion);
    else ignored.push(suggestion);
  }

  return { adopted, ignored };
}
