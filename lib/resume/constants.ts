/** Shared between the client dropzone and the server route, so the two agree. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_MIME = "application/pdf";
export const MAX_JD_CHARS = 10_000;
export const DAILY_ANALYSIS_QUOTA = 5;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
