"use client";
import { useState, useTransition } from "react";
import { transitionAction } from "@/app/(dashboard)/m/crm/actions";
import { ACTION_LABELS, TRANSITIONS, type Stage } from "@/lib/workflow/interior";

export function StageActions({ id, stage }: { id: number; stage: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const acts = TRANSITIONS.filter((t) => t.from === (stage as Stage));
  if (acts.length === 0) return <span className="text-xs text-muted">—</span>;
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1">
        {acts.map((t) => (
          <button key={t.action} disabled={pending}
            onClick={() => { setError(undefined); start(async () => setError((await transitionAction(id, t.action)).error)); }}
            className={`h-8 rounded-md px-2.5 text-xs font-medium transition disabled:opacity-60 ${t.action === "reject" || t.action === "mark_lost" ? "border border-line hover:bg-tint" : "bg-primary text-white hover:bg-primary-dark"}`}>
            {ACTION_LABELS[t.action] ?? t.action}
          </button>
        ))}
      </div>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}
