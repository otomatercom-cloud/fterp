import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { OdooError } from "@/lib/odoo/client";
import { portalDetail, type PortalDetail } from "@/lib/odoo/leads";
import { PORTAL_STAGE } from "@/lib/portal-labels";
import { PortalActions } from "@/components/portal-actions";

const f = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const day = (iso: string) => new Date(iso.replace(" ", "T") + "Z").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export default async function PortalProject({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const s = await requireSession();
  let d: PortalDetail;
  try { d = await portalDetail(s, id); } catch (e) {
    if (e instanceof OdooError) return <p role="alert" className="text-sm text-danger">{e.message}</p>;
    throw e;
  }
  const e = d.estimate, inv = d.invoice;
  return (
    <div className="space-y-4">
      <Link href="/m/portal" className="text-sm text-muted hover:underline">← My Projects</Link>
      <div><h1 className="text-xl font-semibold">{d.name}</h1><p className="text-sm text-gold">{PORTAL_STAGE[d.stage] ?? d.stage}</p></div>
      {(d.can_approve || d.can_signoff) && <section className="glass p-5"><h2 className="mb-3 text-sm font-semibold">Your action</h2><PortalActions leadId={d.id} canApprove={d.can_approve} canSignoff={d.can_signoff} /></section>}
      {e.lines.length > 0 && (
        <section className="glass overflow-x-auto p-5">
          <h2 className="mb-3 text-sm font-semibold">Estimate {e.order || ""}</h2>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted"><th className="py-1">Description</th><th className="py-1 text-right">Qty</th><th className="py-1 text-right">Price</th><th className="py-1 text-right">Amount</th></tr></thead>
            <tbody className="divide-y divide-line">{e.lines.map((l, i) => <tr key={i}><td className="py-1.5">{l.name}</td><td className="py-1.5 text-right">{f(l.qty)}</td><td className="py-1.5 text-right">{f(l.price)}</td><td className="py-1.5 text-right">{f(l.subtotal)}</td></tr>)}</tbody>
          </table>
          <dl className="mt-3 ml-auto grid w-fit grid-cols-[auto_auto] gap-x-6 text-right text-sm">
            <dt className="text-muted">Subtotal</dt><dd>{f(e.untaxed)}</dd><dt className="text-muted">{e.tax_name || "Tax"}</dt><dd>{f(e.tax)}</dd><dt className="font-semibold">Total</dt><dd className="font-semibold">{f(e.total)}</dd>
          </dl>
        </section>
      )}
      {inv && (
        <section className="glass p-5 text-sm">
          <h2 className="mb-2 font-semibold">Advance invoice</h2>
          <p><b>{inv.name}</b> · total {f(inv.total)} · balance due {f(inv.residual)} · {inv.payment_state.replace("_", " ")}</p>
          {inv.state === "posted" && <p className="mt-1"><a className="text-gold underline" target="_blank" rel="noreferrer" href={`/api/leads/${d.id}/invoice-pdf`}>Download invoice (PDF)</a></p>}
          {inv.residual > 0 && inv.state === "posted" && <p className="mt-2 text-xs text-muted">Please pay by bank transfer and share the receipt with your Sales contact; we verify the payment and start work.</p>}
        </section>
      )}
      {["work_started", "handover", "completed"].includes(d.stage) && (
        <section className="glass p-5">
          <div className="flex justify-between text-sm"><h2 className="font-semibold">Progress</h2><b className="text-gold">{d.progress}%</b></div>
          <div className="mt-2 h-3 rounded-full bg-white/10"><div className="h-3 rounded-full bg-gradient-to-r from-primary to-gold" style={{ width: `${d.progress}%` }} /></div>
          {d.updates.length > 0 && (
            <ol className="mt-4 space-y-3 border-l border-line pl-4">
              {d.updates.map((u) => <li key={u.id} className="relative"><span className="absolute -left-[1.4rem] top-1.5 size-2.5 rounded-full bg-gold" /><p className="text-sm"><b className="text-gold">{u.percent}%</b> · {u.note}</p><p className="text-xs text-muted">{day(u.date)}</p></li>)}
            </ol>
          )}
        </section>
      )}
    </div>
  );
}
