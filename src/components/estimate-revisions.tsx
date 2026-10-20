"use client";
import { useState, useTransition } from "react";
import { restoreRevisionAction } from "@/app/(dashboard)/m/boq/actions";
import { CATEGORIES } from "@/lib/workflow/boq";
import type { EstRev } from "@/lib/odoo/leads";

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

export function EstimateRevisions({ leadId, revs, canRestore }: { leadId: number; revs: EstRev[]; canRestore: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();
  if (!revs.length) return <p className="text-sm text-muted">No revisions yet. A revision is kept each time the estimate moves between steps with changes.</p>;
  return (
    <div className="space-y-2 text-sm">
      {err && <p role="alert" className="text-xs text-danger">{err}</p>}
      <ul className="divide-y divide-line">
        {revs.map((r, i) => {
          const prev = revs[i + 1];
          const diff = prev ? r.untaxed - prev.untaxed : 0;
          return (
            <li key={r.id} className="py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button onClick={() => setOpen(open === r.id ? null : r.id)} className="text-left"><b>Rev {r.number}</b> <span className="text-xs text-muted">· {r.reason} · {r.date.slice(0, 10)} · {r.user}</span></button>
                <span className="text-xs">{fmt(r.untaxed)} excl. tax{prev && diff !== 0 && <span className={diff > 0 ? "text-gold" : "text-success"}> ({diff > 0 ? "+" : ""}{fmt(diff)})</span>}</span>
              </div>
              {open === r.id && (
                <div className="mt-2 space-y-1 text-xs">
                  {r.lines.map((l, k) => <p key={k} className="flex justify-between gap-2"><span>{l.name} <span className="text-muted">· {CATEGORIES[l.category] ?? l.category}</span></span><span>{fmt(l.qty)} {l.unit} × {fmt(l.price)}</span></p>)}
                  {canRestore && <button disabled={pending} onClick={() => confirm(`Replace the current draft with revision ${r.number}?`) && start(async () => setErr((await restoreRevisionAction(leadId, r.id)).error))} className="rounded border border-gold/50 px-2 py-0.5 text-gold disabled:opacity-50">Restore into draft</button>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
