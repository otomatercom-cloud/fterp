import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { NAV, canSee } from "@/lib/permissions/nav";
import { companyCurrency, getFinance, type FinRow, type Overdue } from "@/lib/odoo/leads";
import { Donut, PillGauge } from "@/components/charts";
import { STAGE_LABELS, type Stage } from "@/lib/workflow/interior";

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });

export default async function FinancePage() {
  const s = await requireSession();
  const item = NAV.find((n) => n.slug === "finance");
  if (!item || !canSee(item, s.groups)) notFound();
  let d: { rows: FinRow[]; overdue: Overdue[] } | null = null;
  try { d = await getFinance(s); } catch { /* shown below */ }
  const cur = await companyCurrency(s).catch(() => "");
  if (!d) return <div className="space-y-3"><h1 className="text-xl font-semibold">Finance &amp; Accounts</h1><p className="glass p-4 text-sm">Finance data is not available. Check access and that the FT Pipeline module is upgraded.</p></div>;
  const sum = (k: keyof FinRow) => d.rows.reduce((a, r) => a + (r[k] as number), 0);
  const invoiced = sum("invoiced"), paid = sum("paid"), outstanding = sum("outstanding"), overdue = sum("overdue"), revenue = sum("revenue"), cost = sum("cost");
  const margin = revenue ? ((revenue - cost) / revenue) * 100 : 0;
  const kpi: [string, string, string][] = [["Contract value", fmt(sum("contract")), "glow-gold"], ["Invoiced", fmt(invoiced), "glow-rose"], ["Collected", fmt(paid), "glow-bronze"], ["Outstanding", fmt(outstanding), "glow-gold"]];
  const maxAbs = Math.max(1, ...d.rows.map((r) => Math.abs(r.margin)));
  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-semibold">Finance &amp; Accounts</h1><p className="text-sm text-muted">Receivables, payment follow-up and project profitability{cur ? ` · ${cur}` : ""}</p></div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{kpi.map(([l, v, g]) => <div key={l} className={`glass p-4 ${g}`}><p className="text-xs text-muted">{l}</p><p className="mt-1 text-2xl font-semibold">{v}</p></div>)}</div>
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="glass p-5"><h2 className="mb-3 text-sm font-semibold">Collection</h2>
          <div className="flex items-center justify-around">
            <PillGauge label="Collected" percent={invoiced ? (paid / invoiced) * 100 : 0} color="#e8bf7e" />
            <PillGauge label="Margin" percent={margin} color="#d98fa0" />
          </div>
          <div className="mt-3 flex justify-center"><Donut parts={[{ label: "Collected", value: paid, color: "#e8bf7e" }, { label: "Outstanding", value: Math.max(0, outstanding - overdue), color: "#d98fa0" }, { label: "Overdue", value: overdue, color: "#c48a6a" }]} /></div>
        </section>
        <section className="glass p-5 lg:col-span-2"><h2 className="mb-3 text-sm font-semibold">Project profitability <span className="text-xs font-normal text-muted">(estimate excl. tax − procurement cost)</span></h2>
          {d.rows.length === 0 ? <p className="text-sm text-muted">No projects at the invoicing stage yet.</p> : (
            <ul className="space-y-2">
              {[...d.rows].sort((a, b) => b.margin - a.margin).slice(0, 10).map((r) => (
                <li key={r.id} className="text-xs"><div className="flex justify-between"><Link className="hover:underline" href={`/m/crm/${r.id}`}>{r.name}</Link><span className={r.margin < 0 ? "text-danger" : "text-gold"}>{fmt(r.margin)} · {r.margin_pct}%</span></div>
                  <div className="mt-1 h-2 rounded-full bg-white/10"><div className={`h-2 rounded-full ${r.margin < 0 ? "bg-danger" : "bg-gradient-to-r from-primary to-gold"}`} style={{ width: `${Math.max(2, (Math.abs(r.margin) / maxAbs) * 100)}%` }} /></div></li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <section className="glass p-5"><h2 className="mb-3 text-sm font-semibold">Overdue payments — follow up</h2>
        {d.overdue.length === 0 ? <p className="text-sm text-muted">Nothing overdue.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-muted"><tr><th className="py-1">Project</th><th>Milestone</th><th className="text-right">Balance</th><th>Due</th><th>Days</th><th>Last follow-up</th></tr></thead>
            <tbody className="divide-y divide-line">{d.overdue.map((o) => (
              <tr key={o.milestone_id}><td className="py-2"><Link className="text-gold hover:underline" href={`/m/crm/${o.lead_id}`}>{o.lead}</Link><span className="block text-xs text-muted">{o.customer}</span></td><td>{o.milestone}</td><td className="text-right">{fmt(o.residual)}</td><td>{o.due || "—"}</td><td className="text-danger">{o.days}</td><td className="text-xs text-muted">{o.followup_date ? `${o.followup_date}: ${o.followup_note}` : "None yet"}</td></tr>
            ))}</tbody></table></div>
        )}
      </section>
      <section className="glass p-5"><h2 className="mb-3 text-sm font-semibold">All projects</h2>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-muted"><tr><th className="py-1">Project</th><th>Stage</th><th className="text-right">Contract</th><th className="text-right">Invoiced</th><th className="text-right">Paid</th><th className="text-right">Outstanding</th><th className="text-right">Cost</th><th className="text-right">Margin</th></tr></thead>
          <tbody className="divide-y divide-line">{d.rows.map((r) => (
            <tr key={r.id}><td className="py-2"><Link className="hover:underline" href={`/m/crm/${r.id}`}>{r.name}</Link>{!r.planned && <span className="ml-2 text-[10px] text-muted">no plan</span>}<span className="block text-xs text-muted">{r.customer}</span></td><td className="text-xs">{STAGE_LABELS[r.stage as Stage] ?? r.stage}</td><td className="text-right">{fmt(r.contract)}</td><td className="text-right">{fmt(r.invoiced)}</td><td className="text-right">{fmt(r.paid)}</td><td className="text-right">{fmt(r.outstanding)}</td><td className="text-right">{fmt(r.cost)}</td><td className={`text-right ${r.margin < 0 ? "text-danger" : ""}`}>{r.margin_pct}%</td></tr>
          ))}</tbody></table></div>
      </section>
    </div>
  );
}
