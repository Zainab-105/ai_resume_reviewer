import { AlertCircle, CheckCircle2, Info } from "lucide-react";

import { cn } from "@/lib/utils";

type Tone = "info" | "success" | "error";

const tones: Record<Tone, { className: string; Icon: typeof Info; label: string }> = {
  info: { className: "border-border bg-muted text-foreground", Icon: Info, label: "Note" },
  success: {
    className: "border-success/40 bg-success/10 text-foreground",
    Icon: CheckCircle2,
    label: "Success",
  },
  error: {
    className: "border-danger/40 bg-danger/10 text-foreground",
    Icon: AlertCircle,
    label: "Error",
  },
};

/**
 * Colour is never the only signal — each tone also carries an icon and a
 * visually-hidden label (WCAG 1.4.1).
 */
export function Alert({
  tone = "info",
  children,
  className,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  const { className: toneClass, Icon, label } = tones[tone];

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2.5 rounded-md border px-3.5 py-3 text-sm",
        toneClass,
        className,
      )}
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span className="sr-only">{label}: </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
