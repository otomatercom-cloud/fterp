"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addPettyAction, cancelPettyAction, countAction, requestTopupAction, reviewAction, topupAction } from "@/app/(dashboard)/m/petty-cash/actions";
import { PETTY_CATS } from "@/lib/workflow/petty";
import { Donut } from "@/components/charts";
import { PettySetupPanel, PettyStatementPanel } from "@/components/petty-extra";
import type { PettyData, PettyEntry, PettySetup, PettyStatement } from "@/lib/odoo/leads";

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const inp = "h-9 rounded-md border border-line px-2 text-sm";
const TONE: Record<string, string> = { pending: "text-gold", approved: "text-success", rejected: "text-danger" };
const COLORS = ["#e8bf7e", "#d98fa0", "#c48a6a", "#8a3550", "#5a6e78", "#96826e", "#b5a3a8"];

function Files({ files }: { files: PettyEntry["files"] }) {
  return <>{files.map((f) => <a key={f.id} href={`/api/petty-files/${f.id}`} target="_blank" rel="noreferrer" className="text-xs text-gold underline">receipt</a>)}</>;
}

export function PettyPanel({ d, setup, statement, month, initialTab }: { d: PettyData; setup: PettySetup | null; statement: PettyStatement; month: string; initialTab?: string }) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [tab, setTab] = useState<"mine" | "approvals" | "floats" | "statement" | "setup">((["statement", "setup", "approvals", "floats"].includes(initialTab ?? "") ? initialTab : "mine") as "mine");
  const [f, setF] = useState({ lead: 0, category: "material", amount: "", date: today, description: "" });
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [top, setTop] = useState<Record<number, string>>({});
  const [cnt, setCnt] = useState<Record<number, string>>({});
  const [cntNote, setCntNote] = useState<Record<number, string>>({});
  const [req, setReq] = useState("");
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<number | null>(null);
  const run = (fn: () => Promise<{ error?: string }>, ok?: () => void) => start(async () => { const r = await fn(); setErr(r.error); if (!r.error) ok?.(); });
  const upload = (file: File, txn: number) => start(async () => {
    const fd = new FormData(); fd.set("file", file);
    const r = await fetch(`/api/petty/${txn}/file`, { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    setErr(r.ok ? undefined : j.error ?? "Upload failed");
    if (r.ok) router.refresh();
    if (fileRef.current) fileRef.current.value = "";
  });
  const tabs: [typeof tab, string][] = [["mine", "My expenses"], ...(d.can_review ? ([["approvals", `Approvals (${d.approvals.length})`], ["floats", "Cash floats & count"], ["setup", "Accounting setup"]] as [typeof tab, string][]) : []), ["statement", "Statement"]];
  const parts = Object.entries(d.month).map(([k, v], i) => ({ label: PETTY_CATS[k] ?? k, value: v, color: COLORS[i % COLORS.length] }));
  return (
    <div className="space-y-4">
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" aria-label="Receipt file" onChange={(e) => e.target.files?.[0] && target && upload(e.target.files[0], target)} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {([["My balance", fmt(d.balance), "glow-gold"], ["Pending approval", fmt(d.pending), "glow-rose"], ["Available to spend", fmt(d.balance - d.pending), "glow-bronze"], ["Manager approval above", fmt(d.limit), "glow-gold"]] as const).map(([l, v, g]) => <div key={l} className={`glass p-4 ${g}`}><p className="text-xs text-muted">{l}</p><p className="mt-1 text-2xl font-semibold">{v}</p></div>)}
      </div>
      {d.can_review && !d.configured && <p className="rounded-md border border-gold/50 p-3 text-xs text-gold">Accounting is not set up, so entries are not posted to the Odoo books. Open <b>Accounting setup</b> (Manager).</p>}
      {d.can_review && d.configured && d.unposted > 0 && <p className="rounded-md border border-gold/50 p-3 text-xs text-gold">{d.unposted} approved entr{d.unposted === 1 ? "y is" : "ies are"} not posted yet. Open <b>Accounting setup → Post pending entries</b>.</p>}
      <div className="flex flex-wrap gap-1">{tabs.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`rounded-full border px-4 py-1.5 text-sm ${tab === k ? "border-gold text-gold" : "border-line text-muted"}`}>{l}</button>)}</div>
      {err && <p role="alert" className="text-xs text-danger">{err}</p>}
      {tab === "mine" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <section className="glass space-y-3 p-5 lg:col-span-2">
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-line p-2 text-sm">
              <span className="text-xs text-muted">Need more cash?</span>
              <input aria-label="Top-up amount" type="number" min="0" step="any" placeholder="Amount" className={`${inp} h-8 w-24`} value={req} onChange={(e) => setReq(e.target.value)} />
              <button disabled={pending || !Number(req) || d.has_request} onClick={() => run(() => requestTopupAction(Number(req), ""), () => setReq(""))} className="h-8 rounded border border-gold/50 px-3 text-xs text-gold disabled:opacity-50">{d.has_request ? "Request waiting" : "Request top-up"}</button>
            </div>
            <h2 className="text-sm font-semibold">New expense</h2>
            <div className="flex flex-wrap gap-2">
              <select aria-label="Category" className={inp} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{Object.entries(PETTY_CATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <select aria-label="Project" className={inp} value={f.lead} onChange={(e) => setF({ ...f, lead: Number(e.target.value) })}><option value={0}>No project</option>{d.leads.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
              <input aria-label="Date" type="date" className={inp} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
              <input aria-label="Amount" type="number" min="0" step="any" placeholder="Amount" className={`${inp} w-28`} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
              <input aria-label="Description" placeholder="What was it for?" className={`${inp} min-w-0 flex-1`} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
              <button disabled={pending || !f.amount || !f.description.trim()} onClick={() => run(() => addPettyAction(f.lead, f.category, Number(f.amount), f.date, f.description), () => setF({ ...f, amount: "", description: "" }))} className="h-9 rounded-md bg-primary px-4 text-sm text-white disabled:opacity-50">Submit</button>
            </div>
            <p className="text-xs text-muted">After submitting, add the receipt photo or PDF to the pending line.</p>
            <ul className="divide-y divide-line text-sm">
              {d.mine.length === 0 && <li className="py-2 text-muted">No entries yet.</li>}
              {d.mine.map((t) => (
                <li key={t.id} className="py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span><b>{t.kind === "expense" ? "−" : t.amount < 0 ? "−" : "+"}{fmt(Math.abs(t.amount))}</b> <span className="text-xs text-muted">· {t.ref} · {t.kind === "topup" ? "Top-up" : t.kind === "adjust" ? "Cash count" : PETTY_CATS[t.category]} · {t.date} · {t.description}{t.lead ? ` · ${t.lead}` : ""}{t.entry ? ` · ${t.entry}` : ""}</span>{t.unposted && <span className="ml-1 text-[10px] text-gold">unposted</span>}</span>
                    <span className={`text-[11px] ${TONE[t.status]}`}>{t.status}</span>
                  </div>
                  {t.reject_reason && <p className="text-xs text-danger">Rejected: {t.reject_reason}</p>}
                  <div className="mt-1 flex flex-wrap items-center gap-2"><Files files={t.files} />
                    {t.kind === "expense" && t.status === "pending" && (
                      <>
                        <button disabled={pending} onClick={() => { setTarget(t.id); setTimeout(() => fileRef.current?.click(), 0); }} className="rounded border border-gold/50 px-2 py-0.5 text-[11px] text-gold disabled:opacity-50">+ receipt</button>
                        <button disabled={pending} onClick={() => run(() => cancelPettyAction(t.id))} className="rounded border border-line px-2 py-0.5 text-[11px] text-muted disabled:opacity-50">Withdraw</button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
          <section className="glass p-5"><h2 className="mb-3 text-sm font-semibold">Spend this month by category</h2>
            {parts.length ? <div className="flex flex-col items-center gap-3"><Donut parts={parts} /><ul className="w-full text-xs">{parts.map((p) => <li key={p.label} className="flex justify-between"><span><span className="mr-1 inline-block size-2 rounded-full" style={{ background: p.color }} />{p.label}</span><span>{fmt(p.value)}</span></li>)}</ul></div> : <p className="text-sm text-muted">No approved spend this month.</p>}
          </section>
        </div>
      )}
      {tab === "approvals" && (
        <section className="glass p-5">
          {d.approvals.length === 0 ? <p className="text-sm text-muted">Nothing waiting for approval.</p> : (
            <ul className="divide-y divide-line text-sm">
              {d.approvals.map((t) => (
                <li key={t.id} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2"><span><b>{fmt(t.amount)}</b> <span className="text-xs text-muted">· {t.kind === "topup" ? "Top-up request" : PETTY_CATS[t.category]} · {t.holder} · {t.date} · {t.description}{t.lead ? ` · ${t.lead}` : ""}</span> <Files files={t.files} /></span>
                    {t.needs_manager && !d.is_manager && <span className="text-[11px] text-gold">Manager approval needed</span>}{t.own && <span className="text-[11px] text-muted">Your own request</span>}</div>
                  {!t.own && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <input aria-label="Reason" placeholder="Reason (required to reject)" className={`${inp} min-w-0 flex-1`} value={notes[t.id] ?? ""} onChange={(e) => setNotes({ ...notes, [t.id]: e.target.value })} />
                      <button disabled={pending || (t.needs_manager && !d.is_manager)} onClick={() => run(() => reviewAction(t.id, "approve", ""))} className="h-9 rounded-md bg-success/80 px-3 text-sm text-white disabled:opacity-50">Approve</button>
                      <button disabled={pending} onClick={() => run(() => reviewAction(t.id, "reject", notes[t.id] ?? ""))} className="h-9 rounded-md border border-danger/60 px-3 text-sm text-danger disabled:opacity-50">Reject</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {tab === "floats" && (
        <section className="glass p-5">
          <table className="w-full text-left text-sm"><thead className="text-xs text-muted"><tr><th className="py-1">Holder</th><th className="text-right">Balance</th><th className="text-right">Pending</th><th>Top up</th><th>Cash count</th></tr></thead>
            <tbody className="divide-y divide-line">{d.floats.map((u) => (
              <tr key={u.id}><td className="py-2">{u.name}</td><td className="text-right">{fmt(u.balance)}</td><td className="text-right">{fmt(u.pending)}</td>
                <td><span className="flex gap-1"><input aria-label={`Top-up for ${u.name}`} type="number" min="0" step="any" placeholder="Amount" className={`${inp} h-8 w-24`} value={top[u.id] ?? ""} onChange={(e) => setTop({ ...top, [u.id]: e.target.value })} />
                  <button disabled={pending || !Number(top[u.id])} onClick={() => run(() => topupAction(u.id, Number(top[u.id]), ""), () => setTop({ ...top, [u.id]: "" }))} className="h-8 rounded bg-primary px-3 text-xs text-white disabled:opacity-50">Top up</button></span></td>
                <td><span className="flex flex-wrap gap-1"><input aria-label={`Counted cash for ${u.name}`} type="number" min="0" step="any" placeholder="Counted" className={`${inp} h-8 w-24`} value={cnt[u.id] ?? ""} onChange={(e) => setCnt({ ...cnt, [u.id]: e.target.value })} />
                  <input aria-label={`Count note for ${u.name}`} placeholder="Reason if different" className={`${inp} h-8 w-36`} value={cntNote[u.id] ?? ""} onChange={(e) => setCntNote({ ...cntNote, [u.id]: e.target.value })} />
                  <button disabled={pending || cnt[u.id] === undefined || cnt[u.id] === ""} onClick={() => run(() => countAction(u.id, Number(cnt[u.id]), cntNote[u.id] ?? ""), () => setCnt({ ...cnt, [u.id]: "" }))} className="h-8 rounded border border-line px-3 text-xs disabled:opacity-50">Count</button></span></td></tr>
            ))}</tbody></table>
          {d.counts.length > 0 && (
            <div className="mt-4"><h3 className="mb-1 text-sm font-semibold">Recent cash counts</h3>
              <ul className="divide-y divide-line text-xs">{d.counts.map((c) => <li key={c.id} className="py-1">{c.date} · {c.holder}: expected {fmt(c.expected)}, counted {fmt(c.counted)} <b className={c.difference === 0 ? "text-success" : "text-danger"}>({c.difference > 0 ? "+" : ""}{fmt(c.difference)})</b>{c.note ? ` · ${c.note}` : ""} · by {c.by}</li>)}</ul></div>
          )}
        </section>
      )}
      {tab === "setup" && setup && <PettySetupPanel setup={setup} />}
      {tab === "statement" && <PettyStatementPanel month={month} data={statement} />}
    </div>
  );
}
