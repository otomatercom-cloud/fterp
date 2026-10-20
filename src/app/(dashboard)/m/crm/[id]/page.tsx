import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { OdooError } from "@/lib/odoo/client";
import { getDesigns, type Design } from "@/lib/odoo/leads";
import { DesignAdd, DesignList } from "@/components/design-panel";
import { getMilestones, getJournals as getJournalsFin, type MilestoneData } from "@/lib/odoo/leads";
import { PaymentSchedule } from "@/components/payment-schedule";
import { getRates, getEstRevisions, type Rate, type EstRev } from "@/lib/odoo/leads";
import { EstimateRevisions } from "@/components/estimate-revisions";
import { getEstimate, getInvoice, getJournals, getLead, getCosting, getLogs, getProcurement, getPurchaseOrders, portalUserInfo, roleUsers } from "@/lib/odoo/leads";
import { ACTION_LABELS, FIELD_STAGES, STAGE_LABELS, type Stage } from "@/lib/workflow/interior";
import { ProjectGuide } from "@/components/project-guide";
import { getInvItems, type InvItem } from "@/lib/odoo/leads";
import { ContactLinks } from "@/components/contact-links";
import { StageActions } from "@/components/stage-actions";
import { FieldSetter } from "@/components/field-setter";
import { ProcurementEditor } from "@/components/procurement-editor";
import { InvoicePanel } from "@/components/invoice-panel";
import { CostingEditor } from "@/components/costing-editor";
import { PortalAccess } from "@/components/portal-access";
import { PurchaseOrders } from "@/components/purchase-orders";
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
  let lead, est, logs, invoice, proc, pos, portal, costing, journals: { id: number; name: string }[] = [], sms: { id: number; name: string }[] = [], pms: { id: number; name: string }[] = [];
  try {
    lead = await getLead(s, id);
    if (!lead) notFound();
    const at = (f: string) => FIELD_STAGES[f].includes(lead!.otm_stage as Stage);
    const invStages = ["procurement_approved", "invoice_draft", "invoice_with_sales", "awaiting_advance", "payment_verification", "work_started", "handover", "completed"];
    [est, logs, invoice, journals, sms, pms, proc, pos, portal, costing] = await Promise.all([
      getEstimate(s, id), getLogs(s, id), invStages.includes(lead.otm_stage) ? getInvoice(s, id) : Promise.resolve(false as const), lead.otm_stage === "payment_verification" ? getJournals(s) : [], at("user_id") ? roleUsers(s, "sales_manager") : [], at("otm_project_manager_id") ? roleUsers(s, "project_manager") : [],
      getProcurement(s, id), getPurchaseOrders(s, id), portalUserInfo(s, id), getCosting(s, id),
    ]);
  } catch (e) {
    if (e instanceof OdooError) return <p role="alert" className="text-sm text-danger">{e.code === "access" ? "You do not have access to this lead." : e.message}</p>;
    throw e;
  }
  let designs: Design[] = [];
  try { designs = await getDesigns(s, id); } catch { /* module not upgraded yet */ }
  let invItems: InvItem[] = [];
  if (lead.otm_stage === "procurement") { try { invItems = (await getInvItems(s)).items; } catch { /* no inventory access */ } }
  let rates: Rate[] = [], revs: EstRev[] = [];
  try {
    if (lead.otm_stage === "estimate_draft") rates = (await getRates(s)).rates;
    revs = await getEstRevisions(s, id);
  } catch { /* module not upgraded yet */ }
  let ms: MilestoneData | null = null, msJournals: { id: number; name: string }[] = [];
  if (["invoice_draft", "invoice_with_sales", "awaiting_advance", "payment_verification", "work_started", "handover", "completed"].includes(lead.otm_stage) && ["base.group_system", "otm_ft_pipeline.group_ft_accounts", "otm_ft_pipeline.group_ft_manager"].some((g) => s.groups.includes(g))) {
    try { [ms, msJournals] = await Promise.all([getMilestones(s, id), getJournalsFin(s)]); } catch { /* module not upgraded yet */ }
  }
  const canAddDesign = ["base.group_system", "otm_ft_pipeline.group_ft_manager", "otm_ft_pipeline.group_ft_sales_manager", "otm_ft_pipeline.group_ft_project_manager"].some((g) => s.groups.includes(g)) && lead.otm_stage !== "lost";
  const show = (f: string) => FIELD_STAGES[f].includes(lead.otm_stage as Stage);
  return (
    <div className="space-y-4">
      <Link href="/m/crm" className="text-sm text-muted hover:underline">← Pipeline</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{lead.name}</h1>
        <span className="rounded-full bg-primary px-3 py-1 text-xs text-white">{STAGE_LABELS[lead.otm_stage as Stage]}</span>
        {["work_started", "handover", "completed"].includes(lead.otm_stage) && <Link href={`/m/projects/${lead.id}`} className="rounded-full border border-gold/60 px-3 py-1 text-xs text-gold hover:bg-tint">Open project →</Link>}
      </div>
      <ProjectGuide stage={lead.otm_stage as Stage} groups={s.groups} />
      <Card title="Next step"><StageActions id={lead.id} stage={lead.otm_stage} /></Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Lead details">
          <div className="mb-3 flex flex-wrap items-center gap-2"><ContactLinks phone={lead.phone || undefined} email={lead.email_from || undefined} />{["sales_manager", "manager", "project_manager", "accounts"].some((r) => s.groups.includes(`otm_ft_pipeline.group_ft_${r}`)) || s.groups.includes("base.group_system") ? <Link href={`/m/customers/${lead.id}`} className="rounded-full border border-gold/50 px-3 py-1 text-xs text-gold hover:bg-tint">Customer profile &amp; follow-ups →</Link> : null}</div>
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
      {["sales_manager", "manager"].some((r) => s.groups.includes(`otm_ft_pipeline.group_ft_${r}`)) || s.groups.includes("base.group_system") ? <Card title="Customer portal access"><PortalAccess leadId={lead.id} login={portal!.login} hasPartner={portal!.has_partner} /></Card> : null}
      {costing!.lines.length > 0 && <Card title="Availability & costing (Procurement check)"><CostingEditor key={costing!.cost + ":" + costing!.lines.length + ":" + lead.otm_stage} leadId={lead.id} data={costing!} editable={lead.otm_stage === "procurement_check"} /></Card>}
      {ms && <Card title="Payment schedule (milestones)"><PaymentSchedule key={ms.rows.map((r) => r.id + r.status).join()} leadId={lead.id} data={ms} journals={msJournals} canPlan={ms.can_plan} /></Card>}
      <Card title="Design & drawings">{canAddDesign && <div className="mb-3"><DesignAdd leadId={lead.id} /></div>}<DesignList items={designs} /></Card>
      <Card title="Estimate"><EstimateEditor rates={rates} key={est!.lines.length + ":" + est!.total} leadId={lead.id} initial={est!.lines} untaxed={est!.untaxed} tax={est!.tax} taxName={est!.tax_name} taxRate={est!.tax_rate} editable={lead.otm_stage === "estimate_draft"} /></Card>
      {revs.length > 0 && <Card title="Estimate revisions"><EstimateRevisions leadId={lead.id} revs={revs} canRestore={lead.otm_stage === "estimate_draft" && (s.groups.includes("otm_ft_pipeline.group_ft_sales_manager") || s.groups.includes("base.group_system"))} /></Card>}
      {(lead.otm_stage === "procurement" || proc!.lines.length > 0) && <Card title="Procurement prices"><ProcurementEditor key={proc!.total + ":" + proc!.lines.length} leadId={lead.id} initial={proc!.lines} total={proc!.total} estimate={lead.otm_estimate_amount} editable={lead.otm_stage === "procurement" && pos!.orders.length === 0}  items={invItems} /></Card>}
      {(lead.otm_stage === "procurement" || pos!.orders.length > 0) && <Card title="Purchase orders"><PurchaseOrders key={pos!.pending + ":" + pos!.orders.length} leadId={lead.id} data={pos!} canCreate={lead.otm_stage === "procurement"} /></Card>}
      {(invoice || ["invoice_draft", "payment_verification"].includes(lead.otm_stage)) && <Card title="Advance invoice"><InvoicePanel leadId={lead.id} stage={lead.otm_stage} invoice={invoice} journals={journals} /></Card>}
      <Card title="History">
        {logs!.length === 0 ? <p className="text-sm text-muted">No steps yet.</p> : (
          <ul className="space-y-1 text-sm">{logs!.map((l) => <li key={l.id}><span className="text-muted">{new Date(l.date + "Z").toLocaleString("en-US")}</span> · {l.user_id[1]} · {ACTION_LABELS[l.action] ?? l.action} → {STAGE_LABELS[l.to_stage as Stage] ?? l.to_stage}</li>)}</ul>
        )}
      </Card>
    </div>
  );
}
