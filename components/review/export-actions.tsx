"use client";

import { useState } from "react";
import { Check, Copy, Download, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

export function ExportActions({
  markdown,
  fileName,
}: {
  markdown: string;
  fileName: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be blocked; the download still works.
    }
  }

  function downloadMarkdown() {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    // Hidden in print output — the controls are not part of the report.
    <div className="flex flex-wrap gap-2 print:hidden">
      <Button variant="outline" size="sm" onClick={() => window.print()}>
        <Printer aria-hidden className="size-3.5" />
        Save as PDF
      </Button>

      <Button variant="outline" size="sm" onClick={downloadMarkdown}>
        <Download aria-hidden className="size-3.5" />
        Markdown
      </Button>

      <Button variant="ghost" size="sm" onClick={copyMarkdown}>
        {copied ? <Check aria-hidden className="size-3.5" /> : <Copy aria-hidden className="size-3.5" />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
