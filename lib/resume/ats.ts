/**
 * Deterministic ATS rubric.
 *
 * Every check here runs in plain TypeScript against the extracted resume text.
 * The model never sets these numbers — it only receives the results as facts to
 * comment on. LLMs cannot count reliably, and a hallucinated ATS score is worse
 * than no score at all.
 *
 * The rubric is published in the README, so it must stay explainable: each
 * check returns the evidence it used.
 */

export type AtsCheckId =
  | "parsable-text"
  | "contact-block"
  | "section-headings"
  | "single-column"
  | "date-consistency"
  | "bullet-usage"
  | "quantified-achievements"
  | "file-hygiene";

export interface AtsCheck {
  id: AtsCheckId;
  label: string;
  weight: number;
  passed: boolean;
  /** Fraction of `weight` earned, 0–1. Some checks award partial credit. */
  ratio: number;
  detail: string;
}

export interface AtsResult {
  score: number;
  checks: AtsCheck[];
}

export interface AtsInput {
  text: string;
  pageCount: number;
  fileName: string;
}

const SECTION_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: "Experience", pattern: /^\s*(work\s+)?experience|employment(\s+history)?$/im },
  { label: "Education", pattern: /^\s*education(\s+(and|&)\s+training)?$/im },
  { label: "Skills", pattern: /^\s*(technical\s+)?skills|competencies$/im },
  { label: "Projects", pattern: /^\s*(personal\s+|selected\s+)?projects$/im },
  { label: "Summary", pattern: /^\s*(professional\s+)?(summary|profile|objective|about)$/im },
];

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE = /(\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/;
const BULLET = /^\s*[-•▪◦*·‣–—]\s+/;

/**
 * Date formats we recognise, in the order we test them. A resume should stick
 * to one — mixing "Jan 2021" with "01/2021" reads as sloppy to a human and
 * parses inconsistently for a machine.
 */
const DATE_FORMATS: { name: string; pattern: RegExp }[] = [
  {
    name: "Mon YYYY",
    pattern:
      /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{4}\b/gi,
  },
  { name: "MM/YYYY", pattern: /\b\d{1,2}\/\d{4}\b/g },
  { name: "YYYY-MM", pattern: /\b\d{4}-\d{1,2}\b/g },
  { name: "YYYY", pattern: /\b(19|20)\d{2}\b/g },
];

function lines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function check(
  id: AtsCheckId,
  label: string,
  weight: number,
  ratio: number,
  detail: string,
): AtsCheck {
  const clamped = Math.max(0, Math.min(1, ratio));
  return { id, label, weight, ratio: clamped, passed: clamped >= 0.999, detail };
}

/** 20 pts — an ATS that cannot read the text layer scores everything else zero. */
function parsableText(text: string): AtsCheck {
  const chars = text.length;
  const ratio = chars >= 400 ? 1 : chars / 400;
  return check(
    "parsable-text",
    "Machine-readable text",
    20,
    ratio,
    chars >= 400
      ? `Extracted ${chars.toLocaleString()} characters of selectable text.`
      : `Only ${chars} characters of text were extractable — an ATS may see an almost empty document.`,
  );
}

/** 10 pts — no contact details means no callback, however good the rest is. */
function contactBlock(text: string): AtsCheck {
  const hasEmail = EMAIL.test(text);
  const hasPhone = PHONE.test(text);
  const found = [hasEmail && "an email address", hasPhone && "a phone number"].filter(
    Boolean,
  ) as string[];

  return check(
    "contact-block",
    "Contact details",
    10,
    (Number(hasEmail) + Number(hasPhone)) / 2,
    found.length === 2
      ? "Found both an email address and a phone number."
      : found.length === 1
        ? `Found ${found[0]}, but not the other. Add both near the top.`
        : "No email address or phone number detected. Add both near the top of page one.",
  );
}

/** 15 pts — standard headings are how an ATS splits the document into fields. */
function sectionHeadings(text: string): AtsCheck {
  const found = SECTION_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(
    ({ label }) => label,
  );

  return check(
    "section-headings",
    "Standard section headings",
    15,
    Math.min(found.length, 3) / 3,
    found.length
      ? `Found ${found.length} standard heading${found.length === 1 ? "" : "s"}: ${found.join(", ")}.`
      : "No standard section headings found. Use plain headings like Experience, Education and Skills.",
  );
}

/**
 * 10 pts — multi-column layouts and tables scramble reading order. Heuristic:
 * runs of consecutive lines that each contain several wide whitespace gaps.
 */
function singleColumn(text: string): AtsCheck {
  const all = lines(text);
  let run = 0;
  let worstRun = 0;

  for (const line of all) {
    const columnGaps = (line.match(/\s{3,}/g) ?? []).length;
    if (columnGaps >= 3) {
      run += 1;
      worstRun = Math.max(worstRun, run);
    } else {
      run = 0;
    }
  }

  const suspicious = worstRun >= 3;
  return check(
    "single-column",
    "Single-column layout",
    10,
    suspicious ? 0 : 1,
    suspicious
      ? `Detected ${worstRun} consecutive lines that look like table or multi-column content. Applicant tracking systems often read these out of order — switch to a single-column layout.`
      : "Layout reads as a single column, which parses reliably.",
  );
}

/** 10 pts — one date format throughout. */
function dateConsistency(text: string): AtsCheck {
  const counts = DATE_FORMATS.map(({ name, pattern }) => ({
    name,
    count: (text.match(pattern) ?? []).length,
  }));

  // "YYYY" also matches inside "Jan 2021", so only count bare years that the
  // more specific formats did not already claim.
  const specific = counts.filter((c) => c.name !== "YYYY");
  const specificTotal = specific.reduce((sum, c) => sum + c.count, 0);
  const bareYears = Math.max(0, (counts.find((c) => c.name === "YYYY")?.count ?? 0) - specificTotal);

  const tally = [...specific, { name: "YYYY", count: bareYears }].filter((c) => c.count > 0);
  const total = tally.reduce((sum, c) => sum + c.count, 0);

  if (total === 0) {
    return check(
      "date-consistency",
      "Consistent date formats",
      10,
      0,
      "No dates detected. Every role and degree needs a start and end date.",
    );
  }

  const dominant = tally.reduce((a, b) => (b.count > a.count ? b : a));
  const share = dominant.count / total;

  return check(
    "date-consistency",
    "Consistent date formats",
    10,
    share >= 0.8 ? 1 : share,
    share >= 0.8
      ? `${Math.round(share * 100)}% of dates use the same format (${dominant.name}).`
      : `Dates are written ${tally.length} different ways. Pick one format — ${dominant.name} is already your most common — and use it everywhere.`,
  );
}

/** 10 pts — bullets parse far more reliably than prose paragraphs. */
function bulletUsage(text: string): AtsCheck {
  const count = lines(text).filter((l) => BULLET.test(l)).length;
  return check(
    "bullet-usage",
    "Bulleted achievements",
    10,
    Math.min(count, 5) / 5,
    count >= 5
      ? `Found ${count} bulleted lines.`
      : `Only ${count} bulleted line${count === 1 ? "" : "s"}. Break dense paragraphs into bullets — aim for at least 5.`,
  );
}

/** 15 pts — the single strongest signal separating a weak resume from a strong one. */
function quantifiedAchievements(text: string): AtsCheck {
  const bullets = lines(text).filter((l) => BULLET.test(l));
  // A number that carries meaning: a percentage, money, a multiplier, or a
  // magnitude of at least two digits. Bare "1" or "3" usually isn't an outcome.
  const quantified = bullets.filter((l) =>
    /(\d+\s?%|[$£€]\s?\d|\b\d+(\.\d+)?\s?[kmb]\b|\b\d{2,}\b|\b\d+x\b)/i.test(l),
  );

  const count = quantified.length;
  return check(
    "quantified-achievements",
    "Quantified impact",
    15,
    Math.min(count, 3) / 3,
    count >= 3
      ? `${count} of ${bullets.length} bullets include a concrete number.`
      : `Only ${count} bullet${count === 1 ? "" : "s"} include a number. Quantify outcomes — "cut deploy time 40%" beats "improved deployments".`,
  );
}

/** 10 pts — length and filename hygiene. */
function fileHygiene(pageCount: number, fileName: string): AtsCheck {
  const lengthOk = pageCount > 0 && pageCount <= 2;
  const nameOk = /^[A-Za-z0-9._-]+\.pdf$/i.test(fileName);

  const problems: string[] = [];
  if (!lengthOk) problems.push(`it runs to ${pageCount} pages (aim for 1–2)`);
  if (!nameOk) problems.push("the filename contains spaces or special characters");

  return check(
    "file-hygiene",
    "File hygiene",
    10,
    (Number(lengthOk) + Number(nameOk)) / 2,
    problems.length
      ? `Fix: ${problems.join("; ")}. Name the file something like Jane-Doe-Resume.pdf.`
      : `${pageCount} page${pageCount === 1 ? "" : "s"}, clean filename.`,
  );
}

export function scoreAts({ text, pageCount, fileName }: AtsInput): AtsResult {
  const checks = [
    parsableText(text),
    contactBlock(text),
    sectionHeadings(text),
    singleColumn(text),
    dateConsistency(text),
    bulletUsage(text),
    quantifiedAchievements(text),
    fileHygiene(pageCount, fileName),
  ];

  const earned = checks.reduce((sum, c) => sum + c.weight * c.ratio, 0);
  const total = checks.reduce((sum, c) => sum + c.weight, 0);

  return { score: Math.round((earned / total) * 100), checks };
}

/** Compact rendering of the rubric result, for injection into the prompt. */
export function atsFactsForPrompt(result: AtsResult): string {
  const rows = result.checks
    .map((c) => `- ${c.label}: ${Math.round(c.ratio * c.weight)}/${c.weight} — ${c.detail}`)
    .join("\n");

  return `ATS score: ${result.score}/100 (computed deterministically, not by you)\n${rows}`;
}
