"use client";
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="glass m-4 space-y-3 p-5">
      <h1 className="text-lg font-semibold">Page could not load</h1>
      <p className="text-sm text-muted">Something failed while loading this page. Share the code below with your administrator.</p>
      <p className="break-all font-mono text-xs">{error.digest ?? error.message}</p>
      <button onClick={reset} className="rounded-lg bg-primary px-4 py-2 text-sm">Try again</button>
    </div>
  );
}
