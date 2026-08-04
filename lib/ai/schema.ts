import { z } from "zod";

/**
 * The contract the model must satisfy. Anything that fails this is retried
 * once and then reported as a failure — malformed output is never persisted.
 *
 * Note what is NOT here: the ATS score. That is computed deterministically in
 * lib/resume/ats.ts and handed to the model as fact.
 */

const evidence = z
  .string()
  .min(3)
  .max(400)
  .describe("A short verbatim quote from the resume that supports this point.");

export const strengthSchema = z.object({
  text: z.string().min(10).max(300).describe("What the candidate does well, in one sentence."),
  evidence,
});

export const weaknessSchema = z.object({
  text: z.string().min(10).max(300).describe("The specific problem, in one sentence."),
  severity: z.enum(["critical", "major", "minor"]),
  evidence,
});

export const suggestionSchema = z.object({
  section: z
    .string()
    .min(2)
    .max(60)
    .describe("Which part of the resume this applies to, e.g. 'Experience — Acme Corp'."),
  before: z.string().min(3).max(400).describe("The current wording, quoted from the resume."),
  after: z.string().min(3).max(400).describe("The rewritten version, ready to paste in."),
  why: z.string().min(10).max(300).describe("What the rewrite fixes."),
});

/**
 * Models occasionally return a "rewrite" identical to the original except for
 * whitespace or dash style — e.g. "Mar 2018 - Dec 2020" -> "Mar 2018 – Dec 2020".
 * That wastes a suggestion slot and reads as broken.
 *
 * Dropped before validation rather than rejected by the schema, so one dud
 * does not throw away an otherwise good review.
 */
export function isRealRewrite(suggestion: { before: string; after: string }): boolean {
  const normalise = (value: string) =>
    value
      .toLowerCase()
      .replace(/[‐-―]/g, "-") // en/em dashes and friends
      .replace(/[\s,.;:]+/g, " ")
      .trim();

  return normalise(suggestion.before) !== normalise(suggestion.after);
}

export const subScoresSchema = z.object({
  impact: z.number().int().min(0).max(100),
  clarity: z.number().int().min(0).max(100),
  formatting: z.number().int().min(0).max(100),
  skills: z.number().int().min(0).max(100),
  relevance: z.number().int().min(0).max(100),
});

export const reviewOutputSchema = z.object({
  overall_score: z.number().int().min(0).max(100),
  overall_rationale: z.string().min(10).max(400),
  sub_scores: subScoresSchema,
  strengths: z.array(strengthSchema).min(3).max(6),
  weaknesses: z.array(weaknessSchema).min(3).max(6),
  suggestions: z.array(suggestionSchema).min(5).max(10),
});

export type ReviewOutput = z.infer<typeof reviewOutputSchema>;
export type Strength = z.infer<typeof strengthSchema>;
export type Weakness = z.infer<typeof weaknessSchema>;
export type Suggestion = z.infer<typeof suggestionSchema>;
export type SubScores = z.infer<typeof subScoresSchema>;

/**
 * Gemini's structured-output mode rejects several JSON Schema keywords that
 * Zod emits ($schema, additionalProperties, exclusive bounds, format hints).
 * Strip them rather than hand-maintaining a parallel schema.
 */
export function toGeminiSchema(schema: z.ZodType): unknown {
  const json = z.toJSONSchema(schema, { target: "draft-7", io: "output" });

  const strip = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strip);
    if (!node || typeof node !== "object") return node;

    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (
        key === "$schema" ||
        key === "additionalProperties" ||
        key === "exclusiveMinimum" ||
        key === "exclusiveMaximum" ||
        key === "format"
      ) {
        continue;
      }
      out[key] = strip(value);
    }
    return out;
  };

  return strip(json);
}
