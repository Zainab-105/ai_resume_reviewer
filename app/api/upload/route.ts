import { NextResponse } from "next/server";

import {
  ACCEPTED_MIME,
  MAX_FILE_BYTES,
  MAX_JD_CHARS,
  formatBytes,
} from "@/lib/resume/constants";
import { extractResumeText } from "@/lib/resume/extract";
import {
  matchLine,
  normaliseFileName,
  type LineCandidate,
} from "@/lib/resume/line-matching";
import { one } from "@/lib/supabase/relations";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 30;

/** Strips path separators and exotic characters from a client-supplied name. */
function safeFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "resume.pdf";
  return base.replace(/[^A-Za-z0-9._ ()-]/g, "_").slice(0, 120) || "resume.pdf";
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "You need to be signed in to upload." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Could not read the upload." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file was attached." }, { status: 400 });
  }

  // Size is re-checked server-side; the client check is only a courtesy.
  if (file.size === 0) {
    return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: `That file is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_FILE_BYTES)}.` },
      { status: 413 },
    );
  }

  const buffer = await file.arrayBuffer();

  // Magic-byte check happens inside extractResumeText — a client-supplied
  // Content-Type is not evidence of anything.
  const extraction = await extractResumeText(buffer);
  if (!extraction.ok) {
    const status = extraction.reason === "no-text-layer" ? 422 : 400;
    return NextResponse.json({ error: extraction.message, reason: extraction.reason }, { status });
  }

  const fileName = safeFileName(file.name);
  const resumeId = crypto.randomUUID();
  const storagePath = `${user.id}/${resumeId}.pdf`;

  // Decide whether this continues an existing resume line before writing
  // anything, so the row lands with its line and version already set.
  //
  // Only the latest version of each line is compared — a resume drifts as it
  // is edited, and comparing against v1 forever would eventually split a line
  // that has legitimately evolved.
  const { data: latestVersions } = await supabase
    .from("resumes")
    .select("line_id, file_name, extracted_text, version, resume_lines(label)")
    .eq("user_id", user.id)
    .not("line_id", "is", null)
    .order("version", { ascending: false })
    .limit(60);

  const seenLines = new Set<string>();
  const candidates: LineCandidate[] = [];

  for (const row of latestVersions ?? []) {
    if (!row.line_id || seenLines.has(row.line_id) || !row.extracted_text) continue;
    seenLines.add(row.line_id);
    candidates.push({
      lineId: row.line_id,
      label: one<{ label: string }>(row.resume_lines)?.label ?? row.file_name,
      extractedText: row.extracted_text,
      fileName: row.file_name,
    });
  }

  const matched = matchLine(extraction.text, fileName, candidates);

  let lineId = matched?.lineId ?? null;
  let version = 1;

  if (lineId) {
    const { data: nextVersion } = await supabase.rpc("next_resume_version", {
      p_line_id: lineId,
    });
    version = typeof nextVersion === "number" ? nextVersion : 1;
  } else {
    const { data: newLine, error: lineError } = await supabase
      .from("resume_lines")
      .insert({ user_id: user.id, label: normaliseFileName(fileName) || fileName })
      .select("id")
      .single();

    // A failed line insert must not lose the upload — it just stays unchained.
    if (lineError) {
      console.error(`[upload] resume_lines insert failed: ${lineError.message}`);
    } else {
      lineId = newLine.id;
    }
  }

  const { error: uploadError } = await supabase.storage
    .from("resumes")
    .upload(storagePath, buffer, { contentType: ACCEPTED_MIME, upsert: false });

  if (uploadError) {
    console.error("[upload] storage failed", { userId: user.id, message: uploadError.message });
    return NextResponse.json({ error: "Could not store the file. Try again." }, { status: 500 });
  }

  const { data: resume, error: insertError } = await supabase
    .from("resumes")
    .insert({
      id: resumeId,
      user_id: user.id,
      file_name: fileName,
      storage_path: storagePath,
      file_size: file.size,
      page_count: extraction.pageCount,
      word_count: extraction.wordCount,
      extracted_text: extraction.text,
      line_id: lineId,
      version,
    })
    .select("id, file_name, page_count, word_count")
    .single();

  if (insertError || !resume) {
    // Don't leave an orphaned object behind if the row never landed.
    await supabase.storage.from("resumes").remove([storagePath]);
    console.error("[upload] insert failed", { userId: user.id, message: insertError?.message });
    return NextResponse.json({ error: "Could not save the resume. Try again." }, { status: 500 });
  }

  // Optional job description, stored as a separate targetable row.
  let jobTargetId: string | null = null;
  const rawJd = form.get("job_description");

  if (typeof rawJd === "string" && rawJd.trim().length > 0) {
    const text = rawJd.trim().slice(0, MAX_JD_CHARS);
    const title = String(form.get("job_title") ?? "").trim().slice(0, 200) || null;
    const company = String(form.get("job_company") ?? "").trim().slice(0, 200) || null;

    const { data: target, error: jdError } = await supabase
      .from("job_targets")
      .insert({ user_id: user.id, title, company, raw_text: text })
      .select("id")
      .single();

    if (jdError) {
      // A failed JD insert shouldn't lose a good upload — analyse without it.
      console.error("[upload] job target insert failed", { message: jdError.message });
    } else {
      jobTargetId = target.id;
    }
  }

  return NextResponse.json({
    resumeId: resume.id,
    fileName: resume.file_name,
    pageCount: resume.page_count,
    wordCount: resume.word_count,
    truncated: extraction.truncated,
    jobTargetId,
    lineId,
    version,
    // Lets the client say "version 2 of Jane-Doe-Resume" before analysis runs.
    continuesLine: matched ? { label: matched.label, similarity: matched.similarity } : null,
  });
}
