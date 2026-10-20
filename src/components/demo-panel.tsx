"use client";
import { useState, useTransition } from "react";
import { loadDemoAction, removeDemoAction } from "@/app/(dashboard)/m/admin/actions";

export function DemoPanel({ count }: { count: number }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const run = (fn: typeof loadDemoAction) => start(async () => setMsg(await fn()));
  return (
    <div className="glass space-y-3 p-5">
      <h2 className="font-semibold">Demo data</h2>
      <p className="text-sm text-muted">
        Creates 32 sample leads across every stage (with estimates, procurement prices, invoices and history) so you can see the full pipeline and dashboard.
        Currently loaded: <b className="text-ink">{count}</b> demo leads.
      </p>
      <div className="flex flex-wrap gap-2">
        <button disabled={pending || count > 0} onClick={() => run(loadDemoAction)} className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50">
          {pending ? "Working…" : "Load demo data"}
        </button>
        <button disabled={pending || count === 0} onClick={() => confirm("Remove all demo leads?") && run(removeDemoAction)} className="h-10 rounded-md border border-line px-4 text-sm hover:bg-tint disabled:opacity-50">
          Remove demo data
        </button>
      </div>
      {msg.ok && <p role="status" className="text-sm text-success">{msg.ok}</p>}
      {msg.error && <p role="alert" className="text-sm text-danger">{msg.error}</p>}
    </div>
  );
}
