import { extractText, getDocumentProxy } from "unpdf";

/**
 * A PDF whose text layer yields fewer than this many characters is almost
 * certainly a scan or an image export. We reject those before spending an AI
 * call on them.
 */
export const MIN_EXTRACTED_CHARS = 100;

/** Hard cap on what we send to the model, to bound prompt cost. */
export const MAX_RESUME_CHARS = 30_000;

export type ExtractionResult =
  | {
      ok: true;
      text: string;
      pageCount: number;
      wordCount: number;
      truncated: boolean;
    }
  | {
      ok: false;
      reason: "not-a-pdf" | "no-text-layer" | "parse-failed";
      message: string;
    };

/**
 * PDF files begin with the magic bytes `%PDF-`. Checked server-side because a
 * client-supplied Content-Type can say anything.
 */
export function looksLikePdf(bytes: Uint8Array): boolean {
  return (
    bytes.length > 4 &&
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 && // F
    bytes[4] === 0x2d // -
  );
}

/**
 * PDF text extraction loses layout, so a heading and the line under it often
 * collide. Normalise whitespace without destroying line structure — the ATS
 * rubric counts bullets and lines, so newlines are load-bearing.
 */
function normalise(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    // Ligatures that pdf.js emits verbatim and models handle poorly.
    .replace(/ﬁ/g, "fi")
    .replace(/ﬂ/g, "fl")
    // Non-breaking and zero-width spaces.
    .replace(/[ ​‌﻿]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function countWords(text: string): number {
  const matches = text.match(/[A-Za-z0-9][A-Za-z0-9'’\-]*/g);
  return matches ? matches.length : 0;
}

/**
 * Extracts text from a PDF buffer. Never throws — every failure comes back as
 * a typed result so callers can map it to a specific user-facing message.
 */
export async function extractResumeText(buffer: ArrayBuffer): Promise<ExtractionResult> {
  const bytes = new Uint8Array(buffer);

  if (!looksLikePdf(bytes)) {
    return {
      ok: false,
      reason: "not-a-pdf",
      message: "That file isn't a PDF. Export your resume as a PDF and try again.",
    };
  }

  let text: string;
  let pageCount: number;

  try {
    const pdf = await getDocumentProxy(bytes);
    const result = await extractText(pdf, { mergePages: true });
    text = normalise(result.text);
    pageCount = result.totalPages;
  } catch {
    return {
      ok: false,
      reason: "parse-failed",
      message:
        "We couldn't read that PDF. It may be corrupted or password-protected — try re-exporting it.",
    };
  }

  if (text.length < MIN_EXTRACTED_CHARS) {
    return {
      ok: false,
      reason: "no-text-layer",
      message:
        "This PDF has no selectable text — it looks like a scan or an image. Export your resume directly from your editor rather than scanning or screenshotting it.",
    };
  }

  const truncated = text.length > MAX_RESUME_CHARS;

  return {
    ok: true,
    text: truncated ? text.slice(0, MAX_RESUME_CHARS) : text,
    pageCount,
    wordCount: countWords(text),
    truncated,
  };
}
