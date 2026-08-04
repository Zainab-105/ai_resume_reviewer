/**
 * Deciding whether an upload is a new version of an existing resume or a
 * different resume altogether.
 *
 * Filenames are unreliable — "resume-v2-final.pdf" and "resume.pdf" are the
 * same document, while two people's resumes can share a filename. So the
 * primary signal is content similarity, with the filename as a tiebreaker.
 *
 * Deliberately conservative: wrongly splitting a line costs the user a
 * "compare" they have to do manually, but wrongly *merging* two different
 * resumes corrupts their history. When unsure, start a new line.
 */

/** Above this, two uploads are treated as versions of the same resume. */
export const SAME_LINE_THRESHOLD = 0.55;

/** Words too common to carry a signal about document identity. */
const COMMON = new Set([
  "the", "and", "for", "with", "was", "were", "this", "that", "from", "have",
  "has", "had", "not", "but", "all", "can", "will", "would", "their", "they",
  "you", "your", "our", "its", "who", "into", "over", "than", "then", "them",
  "these", "those", "such", "also", "been", "being", "each", "other", "more",
  "most", "some", "any", "may", "out", "use", "used", "using", "work", "team",
]);

function tokenise(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z0-9'+.#-]{2,}/g) ?? []).filter(
    (word) => !COMMON.has(word),
  );
}

/**
 * Jaccard similarity over token sets. Chosen over edit distance because a
 * resume edit reorders and rewrites bullets — set overlap survives that,
 * character-level distance does not.
 */
export function contentSimilarity(a: string, b: string): number {
  const setA = new Set(tokenise(a));
  const setB = new Set(tokenise(b));

  if (setA.size === 0 || setB.size === 0) return 0;

  let shared = 0;
  for (const token of setA) {
    if (setB.has(token)) shared += 1;
  }

  return shared / (setA.size + setB.size - shared);
}

/** Strips version noise so "Jane-Resume-v3 (final).pdf" reduces to "jane-resume". */
export function normaliseFileName(fileName: string): string {
  return fileName
    .replace(/\.pdf$/i, "")
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/-?\(?\bv?\d+\)?\b/g, "")
    .replace(/-?\b(final|draft|copy|new|old|latest|updated?|rev(ised)?)\b/g, "")
    // Removing words can leave empty brackets behind ("resume-(final)" ->
    // "resume-()"), so clear leftover punctuation last.
    .replace(/[()[\]{}]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^[-\s]+|[-\s]+$/g, "")
    .trim();
}

export interface LineCandidate {
  lineId: string;
  label: string;
  extractedText: string;
  fileName: string;
}

export interface LineMatch {
  lineId: string;
  label: string;
  similarity: number;
}

/**
 * Picks the best existing line for an upload, or null to start a new one.
 * Only the caller's own lines should ever be passed in.
 */
export function matchLine(
  text: string,
  fileName: string,
  candidates: LineCandidate[],
): LineMatch | null {
  if (!candidates.length) return null;

  const normalisedUpload = normaliseFileName(fileName);

  const scored = candidates
    .map((candidate) => {
      const similarity = contentSimilarity(text, candidate.extractedText);
      // A matching filename nudges a borderline case over the line, but cannot
      // by itself merge two documents with different content.
      const filenameMatches = normaliseFileName(candidate.fileName) === normalisedUpload;
      return {
        lineId: candidate.lineId,
        label: candidate.label,
        similarity: filenameMatches ? Math.min(1, similarity + 0.1) : similarity,
      };
    })
    .sort((a, b) => b.similarity - a.similarity);

  const best = scored[0];
  return best.similarity >= SAME_LINE_THRESHOLD ? best : null;
}

export interface ScoreDelta {
  overall: number | null;
  ats: number | null;
  previousVersion: number;
  previousReviewId: string;
}

/** Positive means improvement. Null when the previous run has no score. */
export function scoreDelta(
  current: { overall: number | null; ats: number | null },
  previous: { overall: number | null; ats: number | null; version: number; reviewId: string },
): ScoreDelta {
  return {
    overall:
      current.overall !== null && previous.overall !== null
        ? current.overall - previous.overall
        : null,
    ats: current.ats !== null && previous.ats !== null ? current.ats - previous.ats : null,
    previousVersion: previous.version,
    previousReviewId: previous.reviewId,
  };
}
