import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { DashCalendar } from "@/components/dash-calendar";
import { CAL_KIND as KIND } from "@/lib/workflow/labels";
import { pipelineStats, recentActivity, companyCurrency, getCalendar, listTasks, type StatRow, type Activity } from "@/lib/odoo/leads";
import { ACTION_LABELS, STAGE_LABELS, type Stage } from "@/lib/workflow/interior";
import { AreaChart, Donut, PillGauge } from "@/components/charts";

const ORIGINS = [
  { key: "meta", label: "Meta", color: "#e8bf7e" },
  { key: "walkin", label: "Walk-in", color: "#d98fa0" },
  { key: "other", label: "Other", color: "#c48a6a" },
];
const ORDER = (Object.keys(STAGE_LABELS) as Stage[]).filter((s): s is Exclude<Stage, "lost"> => s !== "lost");
const num = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function ago(iso: string) {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso.replace(" ", "T") + "Z").getTime()) / 60000));
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
}

export default async function Home({ searchParams }: { searchParams: Promise<{ cm?: string }> }) {
  const s = await requireSession();
  if (s.groups.includes("base.group_portal") && !s.groups.includes("base.group_system")) redirect("/m/portal");
  const cmq = (await searchParams).cm;
  const todayIso = new Date().toISOString().slice(0, 10);
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(cmq ?? "") ? (cmq as string) : todayIso.slice(0, 7);
  const [cy, cm] = month.split("-").map(Number);
  const gridFrom = new Date(Date.UTC(cy, cm - 1, 1) - 6 * 86400000).toISOString().slice(0, 10);
  const gridTo = new Date(Date.UTC(cy, cm, 0) + 6 * 86400000).toISOString().slice(0, 10);
  const overdueFrom = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [calEvents, recent, waiting] = await Promise.all([getCalendar(s, gridFrom, gridTo), getCalendar(s, overdueFrom, todayIso), listTasks(s).catch(() => [])]);
  const todays = recent.filter((e) => e.date === todayIso), overdueEv = recent.filter((e) => e.date < todayIso);
  const company = s.companies.find((c) => c.id === s.companyId)?.name;
  const [rowsR, actR, curR] = await Promise.allSettled([pipelineStats(s), recentActivity(s), companyCurrency(s)]);
  const rows: StatRow[] | null = rowsR.status === "fulfilled" ? rowsR.value : null;
  const acts: Activity[] = actR.status === "fulfilled" ? actR.value : [];
  const cur = curR.status === "fulfilled" ? curR.value : "";

  if (!rows) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Group Overview</h1>
        <p className="glass p-4 text-sm">Pipeline data is not available. Check that the FT Pipeline module is installed and you have access.</p>
      </div>
    );
  }

  const count = (f: (r: StatRow) => boolean) => rows.filter(f).length;
  const rank = (st: string) => (ORDER as readonly string[]).indexOf(st);
  const started = (r: StatRow) => rank(r.otm_stage) >= rank("work_started");
  const open = rows.filter((r) => !started(r) && r.otm_stage !== "lost");
  const won = count(started);
  const reached = (st: Exclude<Stage, "lost">) => count((r) => rank(r.otm_stage) >= rank(st));
  const pct = (n: number) => (rows.length ? (n / rows.length) * 100 : 0);

  // last 12 months, by lead creation month
  const now = new Date();
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: MON[d.getMonth()] };
  });
  const created = months.map((m) => rows.filter((r) => r.create_date?.slice(0, 7) === m.key).length);
  const converted = months.map((m) => rows.filter((r) => r.create_date?.slice(0, 7) === m.key && started(r)).length);

  const maxStage = Math.max(1, ...ORDER.map((st) => count((r) => r.otm_stage === st)));
  const kpi = "glass p-5 text-center";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Group Overview</h1>
        <p className="text-sm text-muted">{company} · live pipeline from Odoo (leads you can access)</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="glass p-5 lg:col-span-1">
          <h2 className="mb-2 font-semibold">Today</h2>
          {todays.length === 0 ? <p className="text-sm text-muted">No dated work today.</p> : <ul className="space-y-1 text-sm">{todays.map((e, i) => <li key={i}><Link href={e.link} className="flex items-start gap-2 hover:underline"><i className={`mt-1.5 size-2 shrink-0 rounded-full ${KIND[e.kind].dot}`} /><span>{e.title}<span className="text-xs text-muted"> · {e.project}</span></span></Link></li>)}</ul>}
          {overdueEv.length > 0 && (<><h3 className="mb-1 mt-3 text-sm font-semibold text-danger">Overdue ({overdueEv.length})</h3><ul className="space-y-1 text-xs">{overdueEv.slice(0, 6).map((e, i) => <li key={i}><Link href={e.link} className="hover:underline">{e.date} · {e.title}</Link></li>)}</ul></>)}
          <h3 className="mb-1 mt-3 text-sm font-semibold">Waiting for your action ({waiting.length})</h3>
          {waiting.length === 0 ? <p className="text-xs text-muted">Nothing waiting.</p> : <ul className="space-y-1 text-xs">{waiting.slice(0, 6).map((l) => <li key={l.id}><Link href={`/m/crm/${l.id}`} className="hover:underline">{l.name}</Link></li>)}{waiting.length > 6 && <li><Link href="/m/tasks" className="text-gold underline">See all</Link></li>}</ul>}
        </div>
        <div className="lg:col-span-2"><DashCalendar month={month} events={calEvents} today={todayIso} /></div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className={`${kpi} glow-gold`}><p className="text-sm text-muted">Total Leads</p><p className="mt-2 text-4xl font-semibold text-gold">{rows.length}</p></div>
        <div className={`${kpi} glow-rose`}><p className="text-sm text-muted">In Progress</p><p className="mt-2 text-4xl font-semibold">{open.length}</p></div>
        <div className={`${kpi} glow-bronze`}><p className="text-sm text-muted">Work Started</p><p className="mt-2 text-4xl font-semibold">{won}</p></div>
        <div className={`${kpi} glow-gold`}><p className="text-sm text-muted">Open Pipeline {cur && `(${cur})`}</p><p className="mt-2 text-4xl font-semibold">{num.format(open.reduce((a, r) => a + (r.expected_revenue || 0), 0))}</p></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="glass p-5 lg:col-span-2">
          <h2 className="font-semibold">Leads per month</h2>
          <p className="mb-2 text-xs text-muted">Last 12 months, by lead creation date</p>
          <AreaChart labels={months.map((m) => m.label)} series={[{ name: "New leads", color: "#e8bf7e", values: created }, { name: "Work started", color: "#d98fa0", values: converted }]} />
          <div className="mt-1 flex gap-4 text-xs text-muted">
            <span><i className="mr-1 inline-block size-2 rounded-full bg-gold" />New leads</span>
            <span><i className="mr-1 inline-block size-2 rounded-full bg-rose" />Work started</span>
          </div>
        </div>
        <div className="glass p-5">
          <h2 className="font-semibold">Pipeline conversion</h2>
          <p className="mb-3 text-xs text-muted">Share of all leads that reached</p>
          <div className="flex justify-around">
            <PillGauge label="Estimate approved" percent={pct(reached("estimate_approved"))} color="#e8bf7e" />
            <PillGauge label="Client approved" percent={pct(reached("client_approved"))} color="#d98fa0" />
            <PillGauge label="Work started" percent={pct(won)} color="#c48a6a" />
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="glass p-5">
          <h2 className="mb-3 font-semibold">Leads by source</h2>
          <div className="flex items-center gap-4">
            <Donut parts={ORIGINS.map((o) => ({ label: o.label, value: count((r) => r.otm_origin === o.key), color: o.color }))} />
            <ul className="space-y-2 text-sm">
              {ORIGINS.map((o) => (
                <li key={o.key}>
                  <Link href={`/m/crm?origin=${o.key}`} className="hover:underline">
                    <i className="mr-2 inline-block size-2.5 rounded-full" style={{ background: o.color }} />{o.label}: <b>{count((r) => r.otm_origin === o.key)}</b>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="glass p-5 lg:col-span-2">
          <h2 className="mb-3 font-semibold">Leads by stage</h2>
          <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {ORDER.map((st) => {
              const n = count((r) => r.otm_stage === st);
              return (
                <li key={st}>
                  <Link href={`/m/crm?stage=${st}`} className="block hover:opacity-90">
                    <div className="flex justify-between text-xs"><span className="text-muted">{STAGE_LABELS[st]}</span><b>{n}</b></div>
                    <div className="mt-1 h-2 rounded-full bg-white/10"><div className="h-2 rounded-full bg-gradient-to-r from-primary to-gold" style={{ width: `${(n / maxStage) * 100}%` }} /></div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="glass p-5">
        <h2 className="mb-3 font-semibold">Recent activity</h2>
        {acts.length === 0 ? <p className="text-sm text-muted">No activity yet.</p> : (
          <ul className="divide-y divide-line text-sm">
            {acts.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate">
                  <Link href={`/m/crm/${a.lead_id[0]}`} className="font-medium text-gold hover:underline">{a.lead_id[1]}</Link>
                  <span className="text-muted"> · {ACTION_LABELS[a.action] ?? a.action} → {STAGE_LABELS[a.to_stage as Stage] ?? a.to_stage} · {a.user_id[1]}</span>
                </span>
                <span className="shrink-0 text-xs text-muted">{ago(a.date)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
