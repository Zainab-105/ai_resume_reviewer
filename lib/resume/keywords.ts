/**
 * Job-description keyword matching.
 *
 * Deterministic, like the ATS rubric — "you match 62% of this job" is only
 * useful if the number means the same thing every run.
 */

export interface KeywordHit {
  keyword: string;
  present: boolean;
  /** Where in the resume it was found, for the evidence column. */
  location: string | null;
  required: boolean;
}

export interface KeywordMatch {
  matchPercent: number;
  hits: KeywordHit[];
  missingRequired: string[];
}

/** Words too common to be worth matching on. */
const STOPWORDS = new Set([
  "the", "and", "for", "with", "you", "our", "are", "will", "have", "has", "this", "that",
  "from", "your", "who", "all", "can", "not", "but", "any", "may", "out", "use", "using",
  "work", "working", "team", "teams", "role", "job", "about", "into", "they", "them",
  "their", "what", "when", "where", "how", "why", "such", "more", "most", "some", "than",
  "then", "there", "these", "those", "also", "been", "being", "each", "other", "over",
  "years", "year", "experience", "strong", "good", "great", "excellent", "ability", "able",
  "skills", "skill", "knowledge", "understanding", "familiar", "familiarity", "plus",
  "must", "should", "would", "could", "well", "like", "help", "make", "new", "one", "two",
  "three", "five", "including", "include", "includes", "etc", "via", "per", "across",
  "within", "while", "both", "own", "get", "got", "day", "days", "time", "part", "full",
  "company", "candidate", "candidates", "applicant", "position", "opportunity", "benefits",
  "salary", "apply", "looking", "seeking", "join", "build", "building", "develop",
]);

/**
 * Aliases so "K8s" in the resume matches "Kubernetes" in the posting. Keys and
 * values are both lowercased at lookup time.
 */
const ALIASES: Record<string, string[]> = {
  javascript: ["js", "ecmascript"],
  typescript: ["ts"],
  kubernetes: ["k8s"],
  postgresql: ["postgres", "psql"],
  postgres: ["postgresql", "psql"],
  "ci/cd": ["cicd", "ci cd", "continuous integration", "continuous delivery"],
  aws: ["amazon web services"],
  gcp: ["google cloud", "google cloud platform"],
  azure: ["microsoft azure"],
  "machine learning": ["ml"],
  "artificial intelligence": ["ai"],
  react: ["reactjs", "react.js"],
  node: ["nodejs", "node.js"],
  vue: ["vuejs", "vue.js"],
  golang: ["go"],
  go: ["golang"],
  "rest api": ["restful", "rest apis", "rest"],
  graphql: ["gql"],
  docker: ["containerisation", "containerization"],
  terraform: ["iac", "infrastructure as code"],
  sql: ["mysql", "tsql"],
};

/**
 * Multi-word technical phrases worth catching before single-token extraction,
 * since splitting them loses the meaning.
 */
const PHRASES = [
  "machine learning", "deep learning", "data science", "product management",
  "project management", "ci/cd", "rest api", "unit testing", "test automation",
  "infrastructure as code", "distributed systems", "microservices", "event driven",
  "code review", "agile", "scrum", "stakeholder management", "a/b testing",
  "data pipeline", "cloud native", "site reliability", "version control",
  "continuous integration", "object oriented", "functional programming",
];

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[""'']/g, "'")
    .replace(/[^a-z0-9+#./\s-]/g, " ")
    .replace(/\s+/g, " ");
}

/**
 * Lines under a "required"/"must have" heading carry more weight than ones
 * under "nice to have".
 */
function requiredRegions(jd: string): { required: string; preferred: string } {
  const lower = jd.toLowerCase();
  const preferredStart = lower.search(
    /\b(nice[- ]to[- ]have|preferred|bonus|plus(?:es)?|desirable|good to have)\b/,
  );

  if (preferredStart === -1) return { required: jd, preferred: "" };
  return { required: jd.slice(0, preferredStart), preferred: jd.slice(preferredStart) };
}

/**
 * Structural words from the posting's own scaffolding. Without this, headings
 * like "Requirements:" become keywords and are then reported as missing from
 * every resume.
 */
const SECTION_WORDS = new Set([
  "requirements", "required", "responsibilities", "qualifications", "preferred",
  "nice", "bonus", "desirable", "essential", "duties", "overview", "summary",
  "description", "role", "about", "us", "we", "what", "youll", "you'll", "have",
  "need", "needed", "offer", "expect", "expectations", "minimum", "basic",
  "advantage", "advantages", "location", "remote", "hybrid", "onsite",
]);

function extractTerms(region: string): Set<string> {
  // Drop heading lines ("Requirements:", "Nice to have:") before tokenising.
  const withoutHeadings = region
    .split("\n")
    .filter((line) => !/^\s*[A-Za-z][A-Za-z /&'-]{0,40}:\s*$/.test(line))
    .join("\n");

  const text = normalise(withoutHeadings);
  const terms = new Set<string>();

  for (const phrase of PHRASES) {
    if (text.includes(phrase)) terms.add(phrase);
  }

  for (const raw of text.split(/[\s,;:()[\]]+/)) {
    const token = raw.replace(/^[-.]+|[-.]+$/g, "");
    if (token.length < 2 || token.length > 30) continue;
    if (STOPWORDS.has(token) || SECTION_WORDS.has(token)) continue;
    if (/^\d+$/.test(token)) continue;
    // Keep tokens that look technical or capitalised in the original text.
    terms.add(token);
  }

  return terms;
}

/** Finds a term (or an alias) in the resume, returning the line it appeared on. */
function findInResume(term: string, resumeLower: string, resumeLines: string[]): string | null {
  const candidates = [term, ...(ALIASES[term] ?? [])];

  for (const candidate of candidates) {
    // Word-boundary match so "go" doesn't match "going" and "r" doesn't match everything.
    const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");

    if (pattern.test(resumeLower)) {
      const line = resumeLines.find((l) => pattern.test(l.toLowerCase()));
      return line ? line.slice(0, 120) : null;
    }
  }

  return null;
}

export function matchKeywords(resumeText: string, jobDescription: string): KeywordMatch {
  const { required, preferred } = requiredRegions(jobDescription);

  const requiredTerms = extractTerms(required);
  const preferredTerms = extractTerms(preferred);
  // A term in both regions counts as required.
  for (const term of requiredTerms) preferredTerms.delete(term);

  const resumeLower = normalise(resumeText);
  const resumeLines = resumeText.split("\n").map((l) => l.trim()).filter(Boolean);

  const build = (terms: Set<string>, isRequired: boolean): KeywordHit[] =>
    [...terms].map((keyword) => {
      const location = findInResume(keyword, resumeLower, resumeLines);
      return { keyword, present: location !== null, location, required: isRequired };
    });

  const hits = [...build(requiredTerms, true), ...build(preferredTerms, false)]
    // Surface missing required terms first — that's the actionable part.
    .sort((a, b) => {
      if (a.required !== b.required) return a.required ? -1 : 1;
      if (a.present !== b.present) return a.present ? 1 : -1;
      return a.keyword.localeCompare(b.keyword);
    });

  const requiredHits = hits.filter((h) => h.required);
  const scored = requiredHits.length ? requiredHits : hits;
  const present = scored.filter((h) => h.present).length;

  return {
    matchPercent: scored.length ? Math.round((present / scored.length) * 100) : 0,
    hits,
    missingRequired: requiredHits.filter((h) => !h.present).map((h) => h.keyword),
  };
}

/** Compact rendering for the prompt. */
export function keywordFactsForPrompt(match: KeywordMatch): string {
  if (!match.hits.length) return "";
  const missing = match.missingRequired.slice(0, 25);
  return [
    `Keyword match against the target job: ${match.matchPercent}% of required terms present.`,
    missing.length
      ? `Required terms NOT found in the resume: ${missing.join(", ")}.`
      : "All required terms were found.",
  ].join("\n");
}
