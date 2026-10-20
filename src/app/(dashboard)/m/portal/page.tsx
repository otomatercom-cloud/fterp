import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { portalLeads, type PortalLead } from "@/lib/odoo/leads";
import { PORTAL_STAGE } from "@/lib/portal-labels";

export default async function PortalHome() {
  const s = await requireSession();
  let rows: PortalLead[] | null = null;
  try { rows = await portalLeads(s); } catch { /* shown below */ }
  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-semibold">My Projects</h1><p className="text-sm text-muted">Welcome, {s.name}</p></div>
      {!rows ? <p className="glass p-4 text-sm">Your projects are not available right now. Please contact FT Interior Design.</p> : rows.length === 0 ? (
        <p className="glass p-4 text-sm text-muted">No project is shared with you yet.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((p) => (
            <Link key={p.id} href={`/m/portal/${p.id}`} className="glass block p-4 transition hover:border-gold/60">
              <p className="font-medium">{p.name}</p>
              <p className="text-xs text-gold">{PORTAL_STAGE[p.stage] ?? p.stage}</p>
              {["work_started", "handover", "completed"].includes(p.stage) && (
                <><div className="mt-3 flex justify-between text-xs"><span className="text-muted">Progress</span><b>{p.progress}%</b></div>
                <div className="mt-1 h-2 rounded-full bg-white/10"><div className="h-2 rounded-full bg-gradient-to-r from-primary to-gold" style={{ width: `${p.progress}%` }} /></div></>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
