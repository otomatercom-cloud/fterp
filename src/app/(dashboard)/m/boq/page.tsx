import { CostSetup } from "@/components/cost-setup";
import { ImportExport } from "@/components/import-export";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { NAV, canSee } from "@/lib/permissions/nav";
import { CATEGORIES } from "@/lib/workflow/boq";
import { getBoqOverview, getRates, type BoqRow, type Rate , getCostSetup, type CostConfig } from "@/lib/odoo/leads";
import { RateLibrary } from "@/components/rate-library";
import { STAGE_LABELS, type Stage } from "@/lib/workflow/interior";

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });

export default async function BoqPage() {
  const s = await requireSession();
  const item = NAV.find((n) => n.slug === "boq");
  if (!item || !canSee(item, s.groups)) notFound();
  let lib: { can_manage: boolean; rates: Rate[] } | null = null, rows: BoqRow[] = [], setup: CostConfig | null = null;
  try { [lib, rows] = await Promise.all([getRates(s), getBoqOverview(s)]); } catch { /* shown below */ }
  if (lib?.can_manage) setup = await getCostSetup(s).catch(() => null);
  if (!lib) return <div className="space-y-3"><h1 className="text-xl font-semibold">Estimation &amp; BOQ</h1><p className="glass p-4 text-sm">BOQ data is not available. Check access and that the FT Pipeline module is upgraded.</p></div>;
  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-semibold">Estimation &amp; BOQ</h1><p className="text-sm text-muted">Rate library for estimates, and the BOQ of estimates in progress</p></div>
      <ImportExport entity="rates" canImport={lib.can_manage} />
      <section className="glass p-5"><h2 className="mb-3 text-sm font-semibold">Estimates in progress</h2>
        {rows.length === 0 ? <p className="text-sm text-muted">No estimates in progress.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-muted"><tr><th className="py-1">Lead</th><th>Stage</th><th className="text-right">Lines</th><th className="text-right">Revisions</th><th className="text-right">Total (excl. tax)</th><th>By category</th></tr></thead>
            <tbody className="divide-y divide-line">{rows.map((r) => (
              <tr key={r.id}><td className="py-2"><Link className="text-gold hover:underline" href={`/m/crm/${r.id}`}>{r.name}</Link><span className="block text-xs text-muted">{r.customer}</span></td><td className="text-xs">{STAGE_LABELS[r.stage as Stage] ?? r.stage}</td><td className="text-right">{r.lines}</td><td className="text-right">{r.revisions}</td><td className="text-right">{fmt(r.untaxed)}</td>
                <td className="text-xs text-muted">{Object.entries(r.categories).map(([k, v]) => `${CATEGORIES[k] ?? k} ${fmt(v)}`).join(" · ")}</td></tr>
            ))}</tbody></table></div>
        )}
      </section>
      {setup && <section className="glass p-5"><h2 className="mb-3 text-sm font-semibold">Cost build: labour, work packages &amp; pricing rules</h2><CostSetup cfg={setup} /></section>}
      <section className="glass p-5"><h2 className="mb-3 text-sm font-semibold">Rate library</h2><RateLibrary rates={lib.rates} canManage={lib.can_manage} /></section>
    </div>
  );
}
