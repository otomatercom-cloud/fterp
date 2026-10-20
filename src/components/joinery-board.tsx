"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { addJoineryAction, moveJoineryAction } from "@/app/(dashboard)/m/joinery/actions";
import { JOINERY_STAGES } from "@/lib/workflow/joinery";
import type { Joinery } from "@/lib/odoo/leads";

export function JoineryBoard({ jobs, canEdit, leadId, showProject }: { jobs: Joinery[]; canEdit: boolean; leadId?: number; showProject?: boolean }) {
  const [name, setName] = useState("");
  const [qty, setQty] = useState(1);
  const [due, setDue] = useState("");
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();
  const run = (f: () => Promise<{ error?: string }>) => start(async () => setErr((await f()).error));
  const idx = (st: string) => JOINERY_STAGES.findIndex(([k]) => k === st);
  return (
    <div className="space-y-3">
      {leadId && canEdit && (
        <div className="flex flex-wrap gap-2">
          <input aria-label="Joinery item" value={name} onChange={(e) => setName(e.target.value)} placeholder="Item (e.g. Wardrobe units)" className="h-10 min-w-0 flex-1 rounded-md border border-line px-3 text-sm" />
          <input aria-label="Quantity" type="number" min="1" step="any" value={qty} onChange={(e) => setQty(Number(e.target.value))} className="h-10 w-20 rounded-md border border-line px-2 text-sm" />
          <input aria-label="Due date" type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-10 rounded-md border border-line px-2 text-sm" />
          <button disabled={pending || !name.trim() || qty <= 0} onClick={() => run(async () => { const r = await addJoineryAction(leadId, name, qty, due); if (!r.error) { setName(""); setDue(""); } return r; })} className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50">Add job</button>
        </div>
      )}
      {err && <p role="alert" className="text-xs text-danger">{err}</p>}
      <div className="overflow-x-auto">
        <div className="grid min-w-[56rem] grid-cols-7 gap-2">
          {JOINERY_STAGES.map(([key, label], ci) => {
            const col = jobs.filter((j) => j.stage === key);
            return (
              <div key={key} className="rounded-lg border border-line bg-tint p-2">
                <p className="mb-2 px-1 text-xs font-medium text-muted">{label} · {col.length}</p>
                <ul className="space-y-2">
                  {col.map((j) => (
                    <li key={j.id} className="rounded-md border border-line bg-card p-2 text-sm">
                      <p>{j.name} <span className="text-muted">×{j.qty}</span></p>
                      {showProject && <Link href={`/m/projects/${j.lead_id}`} className="text-[11px] text-gold hover:underline">{j.project}</Link>}
                      {j.due && <p className="text-[11px] text-muted">Due {j.due}</p>}
                      {canEdit && (
                        <div className="mt-1 flex gap-1">
                          {ci > 0 && <button aria-label="Move back" disabled={pending} onClick={() => run(() => moveJoineryAction(j.id, JOINERY_STAGES[idx(j.stage) - 1][0]))} className="rounded border border-line px-1.5 py-0.5 text-[11px] hover:bg-tint disabled:opacity-50">←</button>}
                          {ci < JOINERY_STAGES.length - 1 && <button disabled={pending} onClick={() => run(() => moveJoineryAction(j.id, JOINERY_STAGES[idx(j.stage) + 1][0]))} className="rounded border border-line px-1.5 py-0.5 text-[11px] hover:bg-tint disabled:opacity-50">→ {JOINERY_STAGES[ci + 1][1]}</button>}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
