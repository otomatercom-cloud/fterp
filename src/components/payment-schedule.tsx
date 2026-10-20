"use client";
import { useState, useTransition } from "react";
import { followupAction, invoiceMilestoneAction, payMilestoneAction, setMilestonesAction } from "@/app/(dashboard)/m/finance/actions";
import type { MilestoneData, MsKind } from "@/lib/odoo/leads";

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const KINDS: Record<MsKind, string> = { advance: "Advance", progress: "Progress", final: "Final (handover)", retention: "Retention release", other: "Other" };
const TONE: Record<string, string> = { planned: "text-muted", draft: "text-muted", invoiced: "text-gold", overdue: "text-danger", paid: "text-success" };
const DEFAULT: { name: string; kind: MsKind; percent: number; trigger: number }[] = [
  { name: "Advance", kind: "advance", percent: 30, trigger: 0 }, { name: "Progress payment", kind: "progress", percent: 30, trigger: 50 },
  { name: "Final payment", kind: "final", percent: 35, trigger: 0 }, { name: "Retention release", kind: "retention", percent: 5, trigger: 0 },
];
const inp = "h-9 rounded-md border border-line px-2 text-sm";

export function PaymentSchedule({ leadId, data, journals, canPlan }: { leadId: number; data: MilestoneData; journals: { id: number; name: string }[]; canPlan: boolean }) {
  const [edit, setEdit] = useState(false);
  const [plan, setPlan] = useState(data.rows.length ? data.rows.map((r) => ({ name: r.name, kind: r.kind, percent: r.percent, trigger: r.trigger })) : DEFAULT);
  const [journal, setJournal] = useState(journals[0]?.id ?? 0);
  const [note, setNote] = useState<Record<number, string>>({});
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();
  const run = (f: () => Promise<{ error?: string }>) => start(async () => { const r = await f(); setErr(r.error); if (!r.error) setEdit(false); });
  const sum = plan.reduce((a, p) => a + (Number(p.percent) || 0), 0);
  const upd = (i: number, patch: Partial<(typeof plan)[number]>) => setPlan(plan.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-muted">Contract {fmt(data.untaxed)} + tax {fmt(data.tax)} = <b className="text-ink">{fmt(data.total)}</b> · invoiced {fmt(data.invoiced)} · outstanding <b className={data.outstanding > 0 ? "text-gold" : ""}>{fmt(data.outstanding)}</b></p>
      {err && <p role="alert" className="text-xs text-danger">{err}</p>}
      {edit ? (
        <div className="space-y-2">
          {plan.map((p, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input aria-label="Milestone name" className={`${inp} min-w-0 flex-1`} value={p.name} onChange={(e) => upd(i, { name: e.target.value })} />
              <select aria-label="Type" className={inp} value={p.kind} onChange={(e) => upd(i, { kind: e.target.value as MsKind })}>{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <input aria-label="Percent" type="number" min="0" max="100" step="0.5" className={`${inp} w-20`} value={p.percent} onChange={(e) => upd(i, { percent: Number(e.target.value) })} />%
              {p.kind === "progress" && <input aria-label="Site progress needed" type="number" min="0" max="100" className={`${inp} w-20`} value={p.trigger} onChange={(e) => upd(i, { trigger: Number(e.target.value) })} title="Site progress % needed" />}
              <button type="button" onClick={() => setPlan(plan.filter((_, k) => k !== i))} className="text-xs text-danger" aria-label="Remove milestone">✕</button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setPlan([...plan, { name: "", kind: "progress", percent: 0, trigger: 0 }])} className="rounded border border-line px-2 py-1 text-xs">+ Add milestone</button>
            <span className={`text-xs ${Math.abs(sum - 100) < 0.01 ? "text-success" : "text-danger"}`}>Total {sum}% (must be 100%)</span>
            <button disabled={pending || Math.abs(sum - 100) > 0.01} onClick={() => run(() => setMilestonesAction(leadId, plan))} className="h-9 rounded-md bg-primary px-4 text-sm text-white disabled:opacity-50">Save plan</button>
            <button onClick={() => setEdit(false)} className="text-xs text-muted">Cancel</button>
          </div>
          <p className="text-xs text-muted">Invoiced milestones are locked. Progress milestones become billable at the site progress % shown.</p>
        </div>
      ) : data.rows.length === 0 ? (
        <p className="text-muted">No payment plan yet.{canPlan && <> <button onClick={() => setEdit(true)} className="text-gold underline">Create plan</button></>}</p>
      ) : (
        <>
          <ul className="divide-y divide-line">
            {data.rows.map((m) => (
              <li key={m.id} className="py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span><b>{m.name}</b> <span className="text-xs text-muted">· {KINDS[m.kind]} · {m.percent}% · {fmt(m.amount)} excl. tax{m.invoice ? ` · ${m.invoice}` : ""}{m.due ? ` · due ${m.due}` : ""}</span></span>
                  <span className={`rounded-full border border-line px-2 py-0.5 text-[11px] ${TONE[m.status]}`}>{m.status === "planned" ? "Not invoiced" : m.status}</span>
                </div>
                {m.followup_note && <p className="mt-1 text-xs text-muted">Follow-up {m.followup_date}: {m.followup_note}</p>}
                {data.can_bill && (
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {m.status === "planned" && (m.blocker ? <span className="text-xs text-muted">{m.blocker}</span> : <button disabled={pending} onClick={() => run(() => invoiceMilestoneAction(leadId, m.id))} className="rounded bg-primary px-2 py-0.5 text-[11px] text-white disabled:opacity-50">Create &amp; post invoice</button>)}
                    {(m.status === "invoiced" || m.status === "overdue") && (
                      <>
                        <select aria-label="Journal" value={journal} onChange={(e) => setJournal(Number(e.target.value))} className="h-7 rounded border border-line px-1 text-xs">{journals.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}</select>
                        <button disabled={pending || !journal} onClick={() => run(() => payMilestoneAction(leadId, m.id, journal))} className="rounded bg-success/80 px-2 py-0.5 text-[11px] text-white disabled:opacity-50">Register payment</button>
                        <input aria-label="Follow-up note" value={note[m.id] ?? ""} onChange={(e) => setNote({ ...note, [m.id]: e.target.value })} placeholder="Follow-up note" className="h-7 min-w-0 flex-1 rounded border border-line px-2 text-xs" />
                        <button disabled={pending || !(note[m.id] ?? "").trim()} onClick={() => run(() => followupAction(leadId, m.id, note[m.id]))} className="rounded border border-gold/50 px-2 py-0.5 text-[11px] text-gold disabled:opacity-50">Log follow-up</button>
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
          {canPlan && <button onClick={() => setEdit(true)} className="text-xs text-gold underline">Edit plan</button>}
        </>
      )}
    </div>
  );
}
