import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { OdooError } from "@/lib/odoo/client";
import { getEstimate, getInvoice, getJournals, getLead, getLogs, getProcurement, roleUsers } from "@/lib/odoo/leads";
import { ACTION_LABELS, FIELD_STAGES, STAGE_LABELS, type Stage } from "@/lib/workflow/interior";
import { StageActions } from "@/components/stage-actions";
import { FieldSetter } from "@/components/field-setter";
import { ProcurementEditor } from "@/components/procurement-editor";
import { InvoicePanel } from "@/components/invoice-panel";
import { EstimateEditor } from "@/components/estimate-editor";

const n = (x: number) => x.toLocaleString("en-US", { maximumFractionDigits: 2 });
const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="rounded-lg border border-line bg-card p-4 shadow-sm"><h2 className="mb-3 text-sm font-semibold">{title}</h2>{children}</section>
);

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const s = await requireSession();
  let lead, est, logs, invoice, proc, journals: { id: number; name: string }[] = [], sms: { id: number; name: string }[] = [], pms: { id: number; name: string }[] = [];
  try {
    lead = await getLead(s, id);
    if (!lead) notFound();
    const at = (f: string) => FIELD_STAGES[f].includes(lead!.otm_stage as Stage);
    const invStages = ["procurement_approved", "invoice_draft", "invoice_with_sales", "awaiting_advance", "payment_verification", "work_started", "handover", "completed"];
    [est, logs, invoice, journals, sms, pms, proc] = await Promise.all([
      getEstimate(s, id), getLogs(s, id), invStages.includes(lead.otm_stage) ? getInvoice(s, id) : Promise.resolve(false as const), lead.otm_stage === "payment_verification" ? getJournals(s) : [], at("user_id") ? roleUsers(s, "sales_manager") : [], at("otm_project_manager_id") ? roleUsers(s, "project_manager") : [],
      getProcurement(s, id),
    ]);
  } catch (e) {
    if (e instanceof OdooError) return <p role="alert" className="text-sm text-danger">{e.code === "access" ? "You do not have access to this lead." : e.message}</p>;
    throw e;
  }
  const show = (f: string) => FIELD_STAGES[f].includes(lead.otm_stage as Stage);
  return (
    <div className="space-y-4">
      <Link href="/m/crm" className="text-sm text-muted hover:underline">← Pipeline</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{lead.name}</h1>
        <span className="rounded-full bg-primary px-3 py-1 text-xs text-white">{STAGE_LABELS[lead.otm_stage as Stage]}</span>
        {["work_started", "handover", "completed"].includes(lead.otm_stage) && <Link href={`/m/projects/${lead.id}`} className="rounded-full border border-gold/60 px-3 py-1 text-xs text-gold hover:bg-tint">Open project →</Link>}
      </div>
      <Card title="Next step"><StageActions id={lead.id} stage={lead.otm_stage} /></Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Lead details">
          <dl className="grid grid-cols-[8rem_1fr] gap-y-1.5 text-sm">
            {[["Customer", lead.partner_name], ["Phone", lead.phone], ["Email", lead.email_from], ["Source", lead.otm_origin], ["Budget", n(lead.expected_revenue)],
              ["Sales Manager", lead.user_id && lead.user_id[1]], ["Project Manager", lead.otm_project_manager_id && lead.otm_project_manager_id[1]],
              ["Approved estimate (excl. tax)", lead.otm_estimate_amount ? n(lead.otm_estimate_amount) : ""], ["Procurement total", lead.otm_procurement_amount ? n(lead.otm_procurement_amount) : ""], ["Advance received", lead.otm_advance_amount ? n(lead.otm_advance_amount) : ""]]
              .map(([k, v]) => <div key={String(k)} className="contents"><dt className="text-muted">{k}</dt><dd>{v || "—"}</dd></div>)}
          </dl>
          {lead.description && <p className="mt-3 whitespace-pre-wrap border-t border-line pt-3 text-sm">{lead.description}</p>}
        </Card>
        <Card title="Inputs for this stage">
          <div className="space-y-4">
            {show("user_id") && <FieldSetter leadId={lead.id} field="user_id" label="Assign Sales Manager" options={sms} value={lead.user_id ? lead.user_id[0] : undefined} />}
            {show("otm_project_manager_id") && <FieldSetter leadId={lead.id} field="otm_project_manager_id" label="Assign Project Manager" options={pms} value={lead.otm_project_manager_id ? lead.otm_project_manager_id[0] : undefined} />}
            {show("otm_advance_amount") && <FieldSetter leadId={lead.id} field="otm_advance_amount" label="Advance received" value={lead.otm_advance_amount} />}
            {!["user_id", "otm_project_manager_id", "otm_advance_amount"].some(show) && <p className="text-sm text-muted">Nothing to enter at this stage.</p>}
          </div>
        </Card>
      </div>
      <Card title="Estimate"><EstimateEditor key={est!.lines.length + ":" + est!.total} leadId={lead.id} initial={est!.lines} untaxed={est!.untaxed} tax={est!.tax} taxName={est!.tax_name} taxRate={est!.tax_rate} editable={lead.otm_stage === "estimate_draft"} /></Card>
      {(lead.otm_stage === "procurement" || proc!.lines.length > 0) && <Card title="Procurement prices"><ProcurementEditor key={proc!.total + ":" + proc!.lines.length} leadId={lead.id} initial={proc!.lines} total={proc!.total} estimate={lead.otm_estimate_amount} editable={lead.otm_stage === "procurement"} /></Card>}
      {(invoice || ["invoice_draft", "payment_verification"].includes(lead.otm_stage)) && <Card title="Advance invoice"><InvoicePanel leadId={lead.id} stage={lead.otm_stage} invoice={invoice} journals={journals} /></Card>}
      <Card title="History">
        {logs!.length === 0 ? <p className="text-sm text-muted">No steps yet.</p> : (
          <ul className="space-y-1 text-sm">{logs!.map((l) => <li key={l.id}><span className="text-muted">{new Date(l.date + "Z").toLocaleString("en-US")}</span> · {l.user_id[1]} · {ACTION_LABELS[l.action] ?? l.action} → {STAGE_LABELS[l.to_stage as Stage] ?? l.to_stage}</li>)}</ul>
        )}
      </Card>
    </div>
  );
}
