"use client";

import { useId, useRef, useState } from "react";
import { FileText, UploadCloud, X } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ACCEPTED_MIME, MAX_FILE_BYTES, formatBytes } from "@/lib/resume/constants";
import { cn } from "@/lib/utils";

export function Dropzone({
  file,
  onFile,
  disabled,
}: {
  file: File | null;
  onFile: (file: File | null) => void;
  disabled?: boolean;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function accept(candidate: File | undefined) {
    setError(null);
    if (!candidate) return;

    if (candidate.type !== ACCEPTED_MIME && !candidate.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files are supported. Export your resume as a PDF.");
      return;
    }
    if (candidate.size > MAX_FILE_BYTES) {
      setError(
        `That file is ${formatBytes(candidate.size)} — the limit is ${formatBytes(MAX_FILE_BYTES)}.`,
      );
      return;
    }
    if (candidate.size === 0) {
      setError("That file is empty.");
      return;
    }

    onFile(candidate);
  }

  function clear() {
    onFile(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  if (file) {
    return (
      <div className="flex items-center gap-3 rounded-md border border-border bg-muted/40 px-4 py-3">
        <FileText aria-hidden className="size-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{file.name}</p>
          <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={clear}
          disabled={disabled}
          aria-label={`Remove ${file.name}`}
        >
          <X aria-hidden className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/*
        A real file input inside a label keeps this keyboard- and
        screen-reader-accessible; the drag handlers are progressive enhancement.
      */}
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled) accept(e.dataTransfer.files[0]);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-2 rounded-md border border-dashed px-6 py-12 text-center transition",
          "focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--ring)]",
          dragging ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
          disabled && "pointer-events-none opacity-60",
        )}
      >
        <UploadCloud aria-hidden className="size-6 text-muted-foreground" />
        <span className="text-sm font-medium">
          Drop your resume here, or <span className="text-primary underline">browse</span>
        </span>
        <span className="text-xs text-muted-foreground">
          PDF only, up to {formatBytes(MAX_FILE_BYTES)}
        </span>
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          disabled={disabled}
          onChange={(e) => accept(e.target.files?.[0])}
        />
      </label>

      {error ? <Alert tone="error">{error}</Alert> : null}
    </div>
  );
}
