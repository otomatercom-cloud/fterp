import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { NAV, canSee } from "@/lib/permissions/nav";
import { reportRows, type ReportRow } from "@/lib/odoo/leads";
import { STAGE_LABELS, type Stage } from "@/lib/workflow/interior";

const num = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const STARTED = ["work_started", "handover", "completed"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const th = "px-3 py-2 text-left text-xs font-medium text-muted";
const td = "px-3 py-2";
const Table = ({ title, head, rows }: { title: string; head: string[]; rows: (string | number)[][] }) => (
  <section className="glass overflow-x-auto p-5">
    <h2 className="mb-3 font-semibold">{title}</h2>
    <table className="w-full text-sm">
      <thead><tr>{head.map((h, i) => <th key={h} className={`${th} ${i ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
      <tbody className="divide-y divide-line">{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={`${td} ${j ? "text-right" : ""}`}>{c}</td>)}</tr>)}</tbody>
    </table>
  </section>
);

export default async function ReportsPage() {
  const s = await requireSession();
  const item = NAV.find((n) => n.slug === "reports");
  if (!item || !canSee(item, s.groups)) notFound();
  let rows: ReportRow[] | null = null;
  try { rows = await reportRows(s); } catch { /* shown below */ }
  if (!rows) return <p className="glass p-4 text-sm">Reports are not available. Check access and that the FT Pipeline module is installed.</p>;

  const started = (r: ReportRow) => STARTED.includes(r.otm_stage);
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
  const stageRows = (Object.keys(STAGE_LABELS) as Stage[]).map((st) => {
    const g = rows.filter((r) => r.otm_stage === st);
    return [STAGE_LABELS[st], g.length, num(g.reduce((a, r) => a + r.expected_revenue, 0))];
  });
  const sources = [["meta", "Meta"], ["walkin", "Walk-in"], ["other", "Other"]].map(([k, label]) => {
    const g = rows.filter((r) => r.otm_origin === k);
    const w = g.filter(started).length;
    return [label, g.length, w, pct(w, g.length), g.filter((r) => r.otm_stage === "lost").length];
  });
  const byUser = new Map<string, ReportRow[]>();
  for (const r of rows) { const k = r.user_id ? r.user_id[1] : "Unassigned"; byUser.set(k, [...(byUser.get(k) ?? []), r]); }
  const people = [...byUser].map(([name, g]) => [name, g.length, g.filter(started).length, pct(g.filter(started).length, g.length), num(g.reduce((a, r) => a + r.expected_revenue, 0))]);
  const now = new Date();
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const g = rows.filter((r) => r.create_date?.slice(0, 7) === key);
    return [`${MON[d.getMonth()]} ${d.getFullYear()}`, g.length, g.filter(started).length];
  });
  const priced = rows.filter((r) => r.otm_procurement_amount > 0 && r.otm_estimate_amount > 0);
  const est = priced.reduce((a, r) => a + r.otm_estimate_amount, 0);
  const proc = priced.reduce((a, r) => a + r.otm_procurement_amount, 0);
  const over = priced.filter((r) => r.otm_procurement_amount > r.otm_estimate_amount).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h1 className="text-xl font-semibold">Reports</h1><p className="text-sm text-muted">Live from Odoo · {rows.length} leads you can access</p></div>
        <a href="/api/reports/leads" className="grid h-10 place-items-center rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary-dark">Download CSV</a>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Table title="By source" head={["Source", "Leads", "Started", "Conversion", "Lost"]} rows={sources} />
        <Table title="By sales manager" head={["Sales Manager", "Leads", "Started", "Conversion", "Value"]} rows={people} />
        <Table title="By stage" head={["Stage", "Leads", "Expected value"]} rows={stageRows} />
        <Table title="Last 12 months" head={["Month", "New leads", "Started"]} rows={months} />
      </div>
      <Table title="Procurement vs approved estimate (excl. tax)" head={["Leads priced", "Estimate", "Procurement", "Variance", "Over estimate"]}
        rows={[[priced.length, num(est), num(proc), num(proc - est), over]]} />
    </div>
  );
}
