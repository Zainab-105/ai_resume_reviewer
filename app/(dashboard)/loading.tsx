export default function DashboardLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading your dashboard…</span>
      <div className="mb-8 h-8 w-56 animate-pulse rounded-md bg-muted" />
      <div className="h-56 animate-pulse rounded-lg bg-muted" />
      <div className="mt-8 h-40 animate-pulse rounded-lg bg-muted" />
    </div>
  );
}
