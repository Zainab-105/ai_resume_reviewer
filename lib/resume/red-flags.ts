/**
 * Rule-based red flags. Costs no tokens and never hallucinates, so these run
 * before the model and get handed to it as established facts.
 */

export type RedFlagSeverity = "critical" | "major" | "minor";

export interface RedFlag {
  id: string;
  severity: RedFlagSeverity;
  title: string;
  detail: string;
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

const UNPROFESSIONAL_EMAIL =
  /\b[A-Za-z0-9._%+-]*(sexy|hotmail69|babe|cutie|gangsta|weed|420|69|xxx|luv|princess|beast|savage)[A-Za-z0-9._%+-]*@/i;

const FIRST_PERSON = /\b(I|I'm|I've|my|me)\b/g;
const THIRD_PERSON_SELF = /\b(he|she|they)\s+(is|was|has|led|built|managed)\b/gi;

const BUZZWORDS = [
  "synergy", "synergies", "rockstar", "ninja", "guru", "wizard",
  "results-driven", "detail-oriented", "team player", "go-getter",
  "self-starter", "think outside the box", "hard worker", "hardworking",
  "passionate", "dynamic", "proactive", "value-add", "best of breed",
];

/** Parses "Mon YYYY" / "MM/YYYY" / "YYYY" into a comparable month index. */
function parseMonthYear(raw: string): number | null {
  const monthName = raw.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{4})\b/i,
  );
  if (monthName) {
    const month = MONTHS[monthName[1].toLowerCase()];
    return Number(monthName[2]) * 12 + month;
  }

  const numeric = raw.match(/\b(\d{1,2})\/(\d{4})\b/);
  if (numeric) return Number(numeric[2]) * 12 + (Number(numeric[1]) - 1);

  const year = raw.match(/\b(19|20)(\d{2})\b/);
  if (year) return Number(`${year[1]}${year[2]}`) * 12;

  return null;
}

/**
 * Finds date ranges like "Jan 2021 - Present" and reports gaps between
 * consecutive roles. Only gaps over six months are worth surfacing.
 */
function employmentGaps(text: string): RedFlag[] {
  const rangePattern =
    /((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{4}|\d{1,2}\/\d{4}|\b(?:19|20)\d{2}\b)\s*(?:-|–|—|to)\s*(present|current|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{4}|\d{1,2}\/\d{4}|\b(?:19|20)\d{2}\b)/gi;

  const nowMonths = new Date().getUTCFullYear() * 12 + new Date().getUTCMonth();
  const ranges: { start: number; end: number }[] = [];

  for (const match of text.matchAll(rangePattern)) {
    const start = parseMonthYear(match[1]);
    const endRaw = match[2];
    const end = /present|current/i.test(endRaw) ? nowMonths : parseMonthYear(endRaw);
    if (start !== null && end !== null && end >= start) ranges.push({ start, end });
  }

  if (ranges.length < 2) return [];

  ranges.sort((a, b) => a.start - b.start);

  // Merge overlaps first — concurrent roles are not gaps.
  const merged: { start: number; end: number }[] = [ranges[0]];
  for (const range of ranges.slice(1)) {
    const last = merged[merged.length - 1];
    if (range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }

  const flags: RedFlag[] = [];
  for (let i = 1; i < merged.length; i += 1) {
    const gap = merged[i].start - merged[i - 1].end;
    if (gap > 6) {
      flags.push({
        id: `gap-${i}`,
        severity: gap > 18 ? "major" : "minor",
        title: `${gap}-month gap between roles`,
        detail:
          "Recruiters ask about unexplained gaps. If it was study, caring, contracting or a career break, name it on the resume so it isn't a question mark.",
      });
    }
  }

  return flags.slice(0, 3);
}

export function detectRedFlags(text: string, fileName: string): RedFlag[] {
  const flags: RedFlag[] = [];
  const lineList = text.split("\n").map((l) => l.trim()).filter(Boolean);

  const email = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  if (!email) {
    flags.push({
      id: "no-email",
      severity: "critical",
      title: "No email address",
      detail: "There is no way to contact you. Add a professional email near the top.",
    });
  } else if (UNPROFESSIONAL_EMAIL.test(email[0])) {
    flags.push({
      id: "unprofessional-email",
      severity: "major",
      title: "Unprofessional email address",
      detail: `"${email[0]}" undercuts an otherwise serious application. Use firstname.lastname@ instead.`,
    });
  }

  const firstPerson = (text.match(FIRST_PERSON) ?? []).length;
  const thirdPerson = (text.match(THIRD_PERSON_SELF) ?? []).length;

  if (firstPerson > 0 && thirdPerson > 0) {
    flags.push({
      id: "person-mix",
      severity: "major",
      title: "Mixed first and third person",
      detail:
        "The resume switches between \"I led\" and \"She led\". Standard practice is implied first person with no pronouns: \"Led a team of six\".",
    });
  } else if (firstPerson >= 5) {
    flags.push({
      id: "first-person",
      severity: "minor",
      title: "Heavy use of \"I\" and \"my\"",
      detail: `Found ${firstPerson} first-person pronouns. Drop them: "I managed the rollout" becomes "Managed the rollout".`,
    });
  } else if (thirdPerson >= 3) {
    flags.push({
      id: "third-person",
      severity: "minor",
      title: "Written in third person",
      detail: "Referring to yourself by name or pronoun reads as dated. Use implied first person.",
    });
  }

  const buzzHits = BUZZWORDS.filter((word) =>
    new RegExp(`\\b${word.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "i").test(text),
  );
  if (buzzHits.length >= 3) {
    flags.push({
      id: "buzzwords",
      severity: "minor",
      title: `${buzzHits.length} filler phrases`,
      detail: `Found: ${buzzHits.slice(0, 5).join(", ")}. These describe everyone and prove nothing — replace each with a specific accomplishment.`,
    });
  }

  // A URL that is clearly truncated or malformed won't survive a click.
  const brokenLinks = lineList.filter((l) =>
    /\b(https?:\/\/\S*\s|www\.\S*\.\.\.|linkedin\.com\/in\/?\s*$)/i.test(`${l} `),
  );
  if (brokenLinks.length) {
    flags.push({
      id: "broken-link",
      severity: "minor",
      title: "Incomplete link",
      detail:
        "At least one URL looks cut off or missing its handle. Check that every link is complete and clickable.",
    });
  }

  if (!/\b(19|20)\d{2}\b/.test(text)) {
    flags.push({
      id: "no-dates",
      severity: "critical",
      title: "No dates anywhere",
      detail:
        "Without dates a recruiter cannot tell how recent or how long your experience is. Add start and end dates to every role.",
    });
  }

  if (/\bresume\b|\bcv\b|untitled|final|draft|copy|\(\d\)/i.test(fileName.replace(/\.pdf$/i, "")) &&
      /untitled|final|draft|copy|\(\d\)/i.test(fileName)) {
    flags.push({
      id: "filename",
      severity: "minor",
      title: "Working-draft filename",
      detail: `"${fileName}" looks like a working file. Rename it to Firstname-Lastname-Resume.pdf before sending.`,
    });
  }

  flags.push(...employmentGaps(text));

  const rank: Record<RedFlagSeverity, number> = { critical: 0, major: 1, minor: 2 };
  return flags.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
