import { GoogleGenAI } from "@google/genai";

import { SYSTEM_PROMPT, buildUserPrompt, type PromptInput } from "@/lib/ai/prompt";
import { reviewOutputSchema, toGeminiSchema, type ReviewOutput } from "@/lib/ai/schema";
import { serverEnv } from "@/lib/env";

export const MODEL = "gemini-2.5-flash";

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
 * Zod contract. Retries once — models occasionally truncate a long array —
 * then gives up rather than persisting something malformed.
 */
export async function generateReview(
  input: PromptInput,
): Promise<GenerationResult | GenerationFailure> {
  const client = new GoogleGenAI({ apiKey: serverEnv().GOOGLE_GENERATIVE_AI_API_KEY });
  const userPrompt = buildUserPrompt(input);
  const started = Date.now();

  let lastProblem = "";

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    let raw: string | undefined;
    let tokensIn = 0;
    let tokensOut = 0;

    try {
      const response = await client.models.generateContent({
        model: MODEL,
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
      lastProblem = error instanceof Error ? error.message : "unknown provider error";
      console.error("[ai] provider call failed", { attempt, message: lastProblem });
      // A transport/quota failure won't be fixed by rewording — retry once, then stop.
      if (attempt === 2) {
        return {
          ok: false,
          reason: "provider-error",
          message: "The analysis service is unavailable right now. Try again in a minute.",
        };
      }
      continue;
    }

    if (!raw) {
      lastProblem = "empty response";
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      lastProblem = "response was not valid JSON";
      console.error("[ai] JSON parse failed", { attempt, sample: raw.slice(0, 200) });
      continue;
    }

    const validated = reviewOutputSchema.safeParse(parsed);
    if (validated.success) {
      return {
        ok: true,
        review: validated.data,
        model: MODEL,
        tokensIn,
        tokensOut,
        latencyMs: Date.now() - started,
      };
    }

    lastProblem = validated.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    console.error("[ai] schema validation failed", { attempt, problems: lastProblem });
  }

  return {
    ok: false,
    reason: "invalid-output",
    message:
      "The analysis came back malformed twice. This is usually temporary — try again, or re-upload a cleaner PDF.",
  };
}
