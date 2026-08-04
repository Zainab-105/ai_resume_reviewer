import { GoogleGenAI } from "@google/genai";

import {
  SYSTEM_PROMPT,
  buildUserPrompt,
  type PromptInput,
} from "@/lib/ai/prompt";
import {
  isRealRewrite,
  reviewOutputSchema,
  toGeminiSchema,
  type ReviewOutput,
} from "@/lib/ai/schema";
import { serverEnv } from "@/lib/env";

/**
 * Model availability varies by API key — Google retires models for *new* keys
 * while still listing them in /v1beta/models, so a 404 here is a provisioning
 * fact rather than a typo. We try the preferred model first and fall back.
 *
 * Override with GEMINI_MODEL if a deployment needs to pin a specific one.
 */
export const MODEL_CANDIDATES = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-flash-latest",
] as const;

export const MODEL = MODEL_CANDIDATES[0];

/** A 404/permission error means this model will never work for this key. */
function isModelUnavailable(problem: string): boolean {
  return /no longer available|NOT_FOUND|"code":\s*404|is not found/i.test(
    problem,
  );
}

export interface GenerationResult {
  ok: true;
  review: ReviewOutput;
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
}

export interface GenerationFailure {
  ok: false;
  /** `invalid-output` means the model answered but broke the contract. */
  reason: "invalid-output" | "provider-error";
  message: string;
}

const responseJsonSchema = toGeminiSchema(reviewOutputSchema);

/**
 * Calls Gemini in structured-output mode and validates the result against the
 * Zod contract. Retries once per model — models occasionally truncate a long
 * array — and falls through to the next candidate if one is unavailable for
 * this API key. Gives up rather than persisting something malformed.
 */
export async function generateReview(
  input: PromptInput,
): Promise<GenerationResult | GenerationFailure> {
  const client = new GoogleGenAI({
    apiKey: serverEnv().GOOGLE_GENERATIVE_AI_API_KEY,
  });
  const userPrompt = buildUserPrompt(input);
  const started = Date.now();

  const pinned = process.env.GEMINI_MODEL;
  const models = pinned ? [pinned] : [...MODEL_CANDIDATES];

  let lastProblem = "";
  let lastReason: GenerationFailure["reason"] = "provider-error";
  let lastMessage =
    "The analysis service is unavailable right now. Try again in a minute.";

  for (const model of models) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      let raw: string | undefined;
      let tokensIn = 0;
      let tokensOut = 0;

      try {
        const response = await client.models.generateContent({
          model,
          contents: [
            {
              role: "user",
              parts: [
                {
                  text:
                    attempt === 1
                      ? userPrompt
                      : `${userPrompt}\n\nYour previous response was rejected: ${lastProblem}\nReturn valid JSON matching the schema exactly, respecting every minimum and maximum item count.`,
                },
              ],
            },
          ],
          config: {
            systemInstruction: SYSTEM_PROMPT,
            responseMimeType: "application/json",
            responseJsonSchema,
            temperature: 0.4,
            maxOutputTokens: 8192,
          },
        });

        raw = response.text;
        tokensIn = response.usageMetadata?.promptTokenCount ?? 0;
        tokensOut = response.usageMetadata?.candidatesTokenCount ?? 0;
      } catch (error) {
        // The SDK throws objects whose useful detail is not on `.message`, so
        // fall back to serialising the whole thing — an opaque log here costs
        // far more time than the extra bytes.
        lastProblem =
          error instanceof Error && error.message
            ? error.message
            : (() => {
                try {
                  return JSON.stringify(error);
                } catch {
                  return String(error);
                }
              })();
        console.error(
          `[ai] ${model} failed (attempt ${attempt}): ${lastProblem}`,
        );

        // A bad key or a disabled API will never succeed on any model.
        if (
          /API_KEY_INVALID|API key not valid|has not been used/i.test(
            lastProblem,
          )
        ) {
          return {
            ok: false,
            reason: "provider-error",
            message:
              "The analysis service is not configured correctly. (Server: check GOOGLE_GENERATIVE_AI_API_KEY.)",
          };
        }

        // This model is not provisioned for this key — try the next candidate
        // rather than retrying something that can never work.
        if (isModelUnavailable(lastProblem)) break;

        if (
          /RESOURCE_EXHAUSTED|exceeded your current quota|"code":\s*429/i.test(
            lastProblem,
          )
        ) {
          lastMessage =
            "The analysis service is rate limited right now. Try again in a minute.";
          break;
        }

        if (attempt === 2) break;
        continue;
      }

      if (!raw) {
        lastProblem = "empty response";
        lastReason = "invalid-output";
        lastMessage =
          "The analysis came back empty. This is usually temporary — try again in a moment.";
        continue;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        lastProblem = "response was not valid JSON";
        lastReason = "invalid-output";
        lastMessage =
          "The analysis came back malformed. This is usually temporary — try again, or re-upload a cleaner PDF.";
        console.error(
          `[ai] ${model} JSON parse failed (attempt ${attempt}): ${raw.slice(0, 200)}`,
        );
        continue;
      }

      // Drop no-op rewrites before validating, so one dud suggestion does not
      // cost an otherwise good review. The schema's minimum count still applies
      // afterwards, so a response that is mostly no-ops is retried.
      if (parsed && typeof parsed === "object" && Array.isArray((parsed as ReviewOutput).suggestions)) {
        const candidate = parsed as ReviewOutput;
        const kept = candidate.suggestions.filter(isRealRewrite);
        if (kept.length !== candidate.suggestions.length) {
          console.warn(
            `[ai] dropped ${candidate.suggestions.length - kept.length} no-op rewrite(s)`,
          );
          candidate.suggestions = kept;
        }
      }

      const validated = reviewOutputSchema.safeParse(parsed);
      if (validated.success) {
        return {
          ok: true,
          review: validated.data,
          model,
          tokensIn,
          tokensOut,
          latencyMs: Date.now() - started,
        };
      }

      lastProblem = validated.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      lastReason = "invalid-output";
      lastMessage =
        "The analysis came back malformed. This is usually temporary — try again, or re-upload a cleaner PDF.";
      console.error(
        `[ai] ${model} schema validation failed (attempt ${attempt}): ${lastProblem}`,
      );
    }
  }

  console.error(`[ai] all models exhausted: ${lastProblem}`);
  return { ok: false, reason: lastReason, message: lastMessage };
}
