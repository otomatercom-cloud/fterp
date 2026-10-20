"use client";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { addLogAction, followupDoneAction, saveCustomerAction } from "@/app/(dashboard)/m/customers/actions";
import { ContactLinks } from "@/components/contact-links";
import { STAGE_LABELS, type Stage } from "@/lib/workflow/interior";
import type { Customer, CustomerDetail } from "@/lib/odoo/leads";

const inp = "h-9 rounded-md border border-line px-2 text-sm";
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const KINDS: Record<string, string> = { call: "Call", whatsapp: "WhatsApp", meeting: "Meeting", visit: "Site visit", email: "Email", note: "Note" };

export function CustomerList({ rows }: { rows: Customer[] }) {
  const [q, setQ] = useState("");
  const [due, setDue] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const list = useMemo(() => rows.filter((r) => (!due || (r.next_followup && r.next_followup <= today)) && `${r.name} ${r.phone} ${r.email} ${r.person} ${r.address}`.toLowerCase().includes(q.toLowerCase())), [rows, q, due, today]);
  const dueCount = rows.filter((r) => r.next_followup && r.next_followup <= today).length;
  return (
    <section className="glass space-y-3 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <input aria-label="Search" placeholder="Search name, phone, email, area" className={`${inp} min-w-0 flex-1`} value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={due} onChange={(e) => setDue(e.target.checked)} /> Follow-up due ({dueCount})</label>
      </div>
      {list.length === 0 ? <p className="text-sm text-muted">No customers found.</p> : (
        <ul className="divide-y divide-line">
          {list.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div className="min-w-0">
                <Link href={`/m/customers/${c.id}`} className="font-medium hover:underline">{c.name}</Link>
                <p className="text-xs text-muted">{c.phone || "—"}{c.email ? ` · ${c.email}` : ""}{c.address ? ` · ${c.address}` : ""}</p>
                <p className="text-xs text-muted">{c.projects.length} project{c.projects.length === 1 ? "" : "s"} · latest: {STAGE_LABELS[c.projects[0]?.stage as Stage] ?? c.projects[0]?.stage}{c.next_followup ? <span className={c.next_followup <= today ? " text-danger" : " text-gold"}> · follow-up {c.next_followup}</span> : ""}</p>
              </div>
              <ContactLinks phone={c.phone} whatsapp={c.whatsapp} email={c.email} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function CustomerDetailView({ d }: { d: CustomerDetail }) {
  const [v, setV] = useState({ name: d.name, phone: d.phone, whatsapp: d.whatsapp, email: d.email, address: d.address, person: d.person });
  const [lf, setLf] = useState({ kind: "call", text: "", followup: "", lead: d.focus_lead });
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  const today = new Date().toISOString().slice(0, 10);
  const run = (fn: () => Promise<{ error?: string }>, ok?: () => void, okMsg?: string) => start(async () => { const r = await fn(); setMsg(r.error ? { error: r.error } : { ok: okMsg }); if (!r.error) ok?.(); });
  const open = d.logs.filter((g) => g.followup && !g.done);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{d.name}</h1>
        <ContactLinks phone={d.phone} whatsapp={d.whatsapp} email={d.email} text={`Hello ${d.name}, this is FT Interior Design & Architecture.`} />
      </div>
      {msg.error && <p role="alert" className="text-xs text-danger">{msg.error}</p>}
      {msg.ok && <p className="text-xs text-success">{msg.ok}</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="glass space-y-2 p-5">
          <h2 className="font-semibold">Contact details</h2>
          {([["name", "Customer name"], ["person", "Contact person"], ["phone", "Phone"], ["whatsapp", "WhatsApp"], ["email", "Email"], ["address", "Address / site location"]] as const).map(([k, l]) => (
            <label key={k} className="block text-sm">{l}<input disabled={!d.can_edit} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} className={`${inp} mt-1 w-full disabled:opacity-70`} /></label>
          ))}
          {d.can_edit ? <button disabled={pending} onClick={() => run(() => saveCustomerAction(d.focus_lead, v), undefined, "Saved.")} className="h-9 rounded-md bg-primary px-4 text-sm text-white disabled:opacity-50">Save details</button> : <p className="text-xs text-muted">Only the Sales Manager of this customer or a Manager can edit.</p>}
        </section>
        <section className="glass space-y-2 p-5">
          <h2 className="font-semibold">Projects</h2>
          <ul className="divide-y divide-line text-sm">{d.projects.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <Link href={`/m/crm/${p.id}`} className="font-medium hover:underline">{p.name}</Link>
              <span className="text-xs text-muted">{STAGE_LABELS[p.stage as Stage] ?? p.stage}{p.estimate ? ` · ${fmt(p.estimate)}` : ""}</span>
            </li>))}</ul>
        </section>
      </div>
      <section className="glass space-y-3 p-5">
        <h2 className="font-semibold">Follow-ups &amp; contact history</h2>
        {open.length > 0 && <ul className="space-y-1 text-sm">{open.map((g) => (
          <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-gold/40 p-2"><span><b className={g.followup! <= today ? "text-danger" : "text-gold"}>{g.followup}</b> · {g.text} <span className="text-xs text-muted">· {g.project}</span></span>
            {d.can_log && <button disabled={pending} onClick={() => run(() => followupDoneAction(g.id))} className="rounded border border-line px-2 py-0.5 text-xs">Mark done</button>}</li>))}</ul>}
        {d.can_log && (
          <div className="flex flex-wrap items-center gap-2 border-y border-line py-3">
            <select aria-label="Type" className={inp} value={lf.kind} onChange={(e) => setLf({ ...lf, kind: e.target.value })}>{Object.entries(KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            {d.projects.length > 1 && <select aria-label="Project" className={`${inp} max-w-44`} value={lf.lead} onChange={(e) => setLf({ ...lf, lead: Number(e.target.value) })}>{d.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
            <input aria-label="What was discussed" placeholder="What was discussed?" className={`${inp} min-w-0 flex-1`} value={lf.text} onChange={(e) => setLf({ ...lf, text: e.target.value })} />
            <label className="flex items-center gap-1 text-xs text-muted">Follow-up<input aria-label="Follow-up date" type="date" min={today} className={inp} value={lf.followup} onChange={(e) => setLf({ ...lf, followup: e.target.value })} /></label>
            <button disabled={pending || !lf.text.trim()} onClick={() => run(() => addLogAction(lf.lead, lf.kind, lf.text, lf.followup), () => setLf({ ...lf, text: "", followup: "" }))} className="h-9 rounded-md bg-primary px-4 text-sm text-white disabled:opacity-50">Log</button>
          </div>
        )}
        <ul className="divide-y divide-line text-sm">{d.logs.length === 0 && <li className="py-2 text-muted">No contact logged yet.</li>}
          {d.logs.map((g) => <li key={g.id} className="py-2"><b>{KINDS[g.kind] ?? g.kind}</b> · {g.text}<span className="block text-xs text-muted">{g.date.slice(0, 16)} UTC · {g.user} · {g.project}{g.followup ? ` · follow-up ${g.followup}${g.done ? " (done)" : ""}` : ""}</span></li>)}</ul>
      </section>
    </div>
  );
}
