import "server-only";
import { callKw } from "@/lib/odoo/client";
import type { Session } from "@/lib/auth/session";

export type Lead = {
  id: number; name: string; partner_name: string | false; otm_origin: string; otm_stage: string;
  user_id: [number, string] | false; otm_project_manager_id: [number, string] | false; expected_revenue: number; create_date: string;
};
export const PAGE_SIZE = 20;

export async function listLeads(s: Session, opts: { stage?: string; origin?: string; q?: string; page: number }) {
  const domain: unknown[] = [["type", "=", "opportunity"]];
  if (opts.stage) domain.push(["otm_stage", "=", opts.stage]);
  if (opts.origin) domain.push(["otm_origin", "=", opts.origin]);
  if (opts.q) domain.push("|", ["name", "ilike", opts.q], ["partner_name", "ilike", opts.q]);
  const o = { companyIds: [s.companyId] };
  const [rows, total] = await Promise.all([
    callKw<Lead[]>(s.sessionId, "crm.lead", "search_read", [domain], {
      fields: ["name", "partner_name", "otm_origin", "otm_stage", "user_id", "otm_project_manager_id", "expected_revenue", "create_date"],
      limit: PAGE_SIZE, offset: (opts.page - 1) * PAGE_SIZE, order: "id desc",
    }, o),
    callKw<number>(s.sessionId, "crm.lead", "search_count", [domain], {}, o),
  ]);
  return { rows, total };
}

export function runTransition(s: Session, id: number, action: string) {
  return callKw<boolean>(s.sessionId, "crm.lead", "action_otm_transition", [[id]], { context: { otm_action: action } }, { companyIds: [s.companyId] });
}

export type LeadDetail = Lead & { phone: string | false; email_from: string | false; description: string | false; otm_estimate_amount: number; otm_procurement_amount: number; otm_advance_amount: number; log_ids: number[] };
export type Estimate = { order: string | false; total: number; untaxed: number; tax: number; tax_name: string | false; tax_rate: number; lines: { name: string; qty: number; price: number; subtotal: number; category: string; unit: string }[] };
export type LogRow = { id: number; date: string; user_id: [number, string]; action: string; to_stage: string };
const co = (s: Session) => ({ companyIds: [s.companyId] });

export async function getLead(s: Session, id: number) {
  const [lead] = await callKw<LeadDetail[]>(s.sessionId, "crm.lead", "read", [[id], [
    "name", "partner_name", "phone", "email_from", "description", "otm_origin", "otm_stage", "user_id", "otm_project_manager_id",
    "expected_revenue", "create_date", "otm_estimate_amount", "otm_procurement_amount", "otm_advance_amount",
  ]], {}, co(s));
  return lead ?? null;
}
export const getEstimate = (s: Session, id: number) => callKw<Estimate>(s.sessionId, "crm.lead", "otm_estimate_data", [[id]], {}, co(s));
export const getLogs = (s: Session, id: number) =>
  callKw<LogRow[]>(s.sessionId, "otm.ft.stage.log", "search_read", [[["lead_id", "=", id]]], { fields: ["date", "user_id", "action", "to_stage"], limit: 50, order: "id desc" }, co(s));
export const roleUsers = (s: Session, role: "sales_manager" | "project_manager") =>
  callKw<{ id: number; name: string }[]>(s.sessionId, "crm.lead", "otm_role_users", [role], {}, co(s));
export const createLead = (s: Session, vals: Record<string, unknown>) => callKw<number>(s.sessionId, "crm.lead", "create", [vals], {}, co(s));
export const setLeadField = (s: Session, id: number, field: string, value: number) => callKw<boolean>(s.sessionId, "crm.lead", "otm_set_field", [[id], field, value], {}, co(s));
export const saveEstimate = (s: Session, id: number, lines: { name: string; qty: number; price: number; category?: string; unit?: string }[]) =>
  callKw<number>(s.sessionId, "crm.lead", "otm_save_estimate", [[id], lines], {}, co(s));

export type InvoiceInfo = { id: number; name: string; state: string; total: number; untaxed: number; tax: number; residual: number; payment_state: string } | false;
export const getInvoice = (s: Session, id: number) => callKw<InvoiceInfo>(s.sessionId, "crm.lead", "otm_invoice_data", [[id]], {}, co(s));
export const getJournals = (s: Session) => callKw<{ id: number; name: string }[]>(s.sessionId, "crm.lead", "otm_journals", [], {}, co(s));
export const createInvoice = (s: Session, id: number, amount: number) => callKw<number>(s.sessionId, "crm.lead", "otm_create_advance_invoice", [[id], amount], {}, co(s));
export const postInvoice = (s: Session, id: number) => callKw<boolean>(s.sessionId, "crm.lead", "otm_post_invoice", [[id]], {}, co(s));
export const registerPayment = (s: Session, id: number, journalId: number) => callKw<boolean>(s.sessionId, "crm.lead", "otm_register_payment", [[id], journalId], {}, co(s));

export type ProcLine = { name: string; vendor: string; qty: number; price: number };
export const getProcurement = (s: Session, id: number) => callKw<{ total: number; lines: ProcLine[] }>(s.sessionId, "crm.lead", "otm_procurement_data", [[id]], {}, co(s));
export const saveProcurement = (s: Session, id: number, lines: ProcLine[]) => callKw<number>(s.sessionId, "crm.lead", "otm_save_procurement", [[id], lines], {}, co(s));

export type StatRow = { otm_stage: string; otm_origin: string; expected_revenue: number; create_date: string };
export const pipelineStats = (s: Session) =>
  callKw<StatRow[]>(s.sessionId, "crm.lead", "search_read", [[["type", "=", "opportunity"]]], { fields: ["otm_stage", "otm_origin", "expected_revenue", "create_date"], limit: 5000 }, co(s));

export type Activity = { id: number; date: string; lead_id: [number, string]; user_id: [number, string]; action: string; to_stage: string };
export const recentActivity = (s: Session) =>
  callKw<Activity[]>(s.sessionId, "otm.ft.stage.log", "search_read", [[]], { fields: ["date", "lead_id", "user_id", "action", "to_stage"], limit: 8, order: "id desc" }, co(s));
export async function companyCurrency(s: Session) {
  const [c] = await callKw<{ currency_id: [number, string] }[]>(s.sessionId, "res.company", "read", [[s.companyId], ["currency_id"]], {}, co(s));
  return c?.currency_id?.[1] ?? "";
}

export const demoStatus = (s: Session) => callKw<{ count: number }>(s.sessionId, "crm.lead", "otm_demo_status", [], {}, co(s));
export const loadDemo = (s: Session) => callKw<{ created: number; invoices_skipped: number; password: string }>(s.sessionId, "crm.lead", "otm_load_demo_data", [], {}, { ...co(s), timeoutMs: 170_000 });
export const removeDemo = (s: Session) => callKw<{ removed: number; invoices_kept: number }>(s.sessionId, "crm.lead", "otm_remove_demo_data", [], {}, { ...co(s), timeoutMs: 170_000 });

export type Project = { id: number; otm_stage: string; name: string; partner_name: string | false; otm_progress: number; otm_estimate_amount: number; otm_project_manager_id: [number, string] | false; create_date: string };
export const listProjects = (s: Session) =>
  callKw<Project[]>(s.sessionId, "crm.lead", "search_read", [[["type", "=", "opportunity"], ["otm_stage", "in", ["work_started", "handover", "completed"]]]], {
    fields: ["name", "partner_name", "otm_progress", "otm_estimate_amount", "otm_project_manager_id", "create_date", "otm_stage"], limit: 200, order: "id desc",
  }, co(s));
export type SiteUpdate = { id: number; date: string; percent: number; note: string; user: string };
export const getSiteUpdates = (s: Session, id: number) => callKw<SiteUpdate[]>(s.sessionId, "crm.lead", "otm_site_updates", [[id]], {}, co(s));
export const addSiteUpdate = (s: Session, id: number, percent: number, note: string) => callKw<number>(s.sessionId, "crm.lead", "otm_add_site_update", [[id], percent, note], {}, co(s));
export const getProject = async (s: Session, id: number) => {
  const [p] = await callKw<(Project & { otm_stage: string; phone: string | false; email_from: string | false })[]>(s.sessionId, "crm.lead", "read", [[id], ["name", "partner_name", "otm_progress", "otm_estimate_amount", "otm_project_manager_id", "create_date", "otm_stage", "phone", "email_from"]], {}, co(s));
  return p ?? null;
};

export type PoData = { pending: number; orders: { id: number; name: string; vendor: string; state: string; total: number }[] };
export const getPurchaseOrders = (s: Session, id: number) => callKw<PoData>(s.sessionId, "crm.lead", "otm_po_data", [[id]], {}, co(s));
export const createPurchaseOrders = (s: Session, id: number) => callKw<number>(s.sessionId, "crm.lead", "otm_create_purchase_orders", [[id]], {}, co(s));

import { rolesFromGroups, tasksDomain } from "@/lib/workflow/roles";
export const taskDomain = (s: Session) => tasksDomain(rolesFromGroups(s.groups), s.uid);
export const taskCount = (s: Session) => callKw<number>(s.sessionId, "crm.lead", "search_count", [[["type", "=", "opportunity"], ...(taskDomain(s) as never[])]], {}, co(s));
export const listTasks = (s: Session) =>
  callKw<Lead[]>(s.sessionId, "crm.lead", "search_read", [[["type", "=", "opportunity"], ...(taskDomain(s) as never[])]], {
    fields: ["name", "partner_name", "otm_origin", "otm_stage", "user_id", "otm_project_manager_id", "expected_revenue", "create_date"], limit: 100, order: "write_date asc",
  }, co(s));

export type ReportRow = { id: number; name: string; partner_name: string | false; otm_origin: string; otm_stage: string; user_id: [number, string] | false;
  expected_revenue: number; otm_estimate_amount: number; otm_procurement_amount: number; otm_progress: number; create_date: string };
export const reportRows = (s: Session) =>
  callKw<ReportRow[]>(s.sessionId, "crm.lead", "search_read", [[["type", "=", "opportunity"]]], {
    fields: ["name", "partner_name", "otm_origin", "otm_stage", "user_id", "expected_revenue", "otm_estimate_amount", "otm_procurement_amount", "otm_progress", "create_date"], limit: 5000, order: "id desc",
  }, co(s));

export type UserRoles = { id: number; name: string; login: string; roles: string[] };
export const usersRoles = (s: Session) => callKw<UserRoles[]>(s.sessionId, "crm.lead", "otm_users_roles", [], {}, co(s));
export const setUserRole = (s: Session, uid: number, role: string, enabled: boolean) => callKw<boolean>(s.sessionId, "crm.lead", "otm_set_user_role", [uid, role, enabled], {}, co(s));

export type Task = { id: number; name: string; kind: "task" | "snag"; status: "todo" | "doing" | "done"; due: string | false };
export const getTasks = (s: Session, id: number) => callKw<Task[]>(s.sessionId, "crm.lead", "otm_tasks", [[id]], {}, co(s));
export const addTask = (s: Session, id: number, name: string, kind: string, due: string | false) => callKw<boolean>(s.sessionId, "crm.lead", "otm_add_task", [[id], name, kind, due], {}, co(s));
export const setTaskStatus = (s: Session, id: number, taskId: number, status: string) => callKw<boolean>(s.sessionId, "crm.lead", "otm_set_task_status", [[id], taskId, status], {}, co(s));

export type Joinery = { id: number; lead_id: number; project: string; name: string; qty: number; stage: string; due: string | false };
export const getJoinery = (s: Session, id: number) => callKw<Joinery[]>(s.sessionId, "crm.lead", "otm_joinery", [[id]], {}, co(s));
export const getJoineryAll = (s: Session) => callKw<Joinery[]>(s.sessionId, "crm.lead", "otm_joinery_all", [], {}, co(s));
export const addJoinery = (s: Session, id: number, name: string, qty: number, due: string | false) => callKw<boolean>(s.sessionId, "crm.lead", "otm_add_joinery", [[id], name, qty, due], {}, co(s));
export const moveJoinery = (s: Session, jobId: number, stage: string) => callKw<boolean>(s.sessionId, "crm.lead", "otm_move_joinery", [jobId, stage], {}, co(s));

// ---- customer portal ----
export type PortalLead = { id: number; name: string; stage: string; progress: number };
export type PortalDetail = { id: number; name: string; stage: string; progress: number; estimate: Estimate; invoice: InvoiceInfo; updates: SiteUpdate[]; installs: Install[]; snags: { id: number; name: string; status: string }[]; can_raise_snag: boolean; can_approve: boolean; can_signoff: boolean };
export const portalProfile = (sessionId: string) =>
  callKw<{ portal: boolean; company_id: number; company_name: string }>(sessionId, "crm.lead", "otm_portal_profile", [], {});
export const portalLeads = (s: Session) => callKw<PortalLead[]>(s.sessionId, "crm.lead", "otm_portal_leads", [], {}, co(s));
export const portalDetail = (s: Session, id: number) => callKw<PortalDetail>(s.sessionId, "crm.lead", "otm_portal_detail", [id], {}, co(s));
export const portalAction = (s: Session, id: number, action: string) => callKw<boolean>(s.sessionId, "crm.lead", "otm_portal_action", [id, action], {}, co(s));
export const portalUserInfo = (s: Session, id: number) => callKw<{ login: string | false; has_partner: boolean }>(s.sessionId, "crm.lead", "otm_portal_user_info", [[id]], {}, co(s));
export const createPortalUser = (s: Session, id: number, login: string, password: string) => callKw<boolean>(s.sessionId, "crm.lead", "otm_create_portal_user", [[id], login, password], {}, co(s));

// ---- installation ----
export type Install = { id: number; name: string; kind: "site_visit" | "installation"; status: "planned" | "in_progress" | "done"; team: string; date: string | false; photos: { id: number; label: string; name: string }[] };
export const getInstalls = (s: Session, id: number) => callKw<Install[]>(s.sessionId, "crm.lead", "otm_installs", [[id]], {}, co(s));
export const addInstall = (s: Session, id: number, name: string, kind: string, date: string | false, team: string) => callKw<boolean>(s.sessionId, "crm.lead", "otm_add_install", [[id], name, kind, date, team], {}, co(s));
export const setInstallStatus = (s: Session, installId: number, status: string) => callKw<boolean>(s.sessionId, "crm.lead", "otm_set_install_status", [installId, status], {}, co(s));
export const addInstallPhoto = (s: Session, installId: number, label: string, filename: string, b64: string) => callKw<boolean>(s.sessionId, "crm.lead", "otm_add_photo", [installId, label, filename, b64], {}, co(s));
export const getPhoto = (s: Session, attId: number) => callKw<{ mimetype: string; data: string }>(s.sessionId, "crm.lead", "otm_photo", [attId], {}, co(s));
export const raiseSnag = (s: Session, id: number, name: string) => callKw<boolean>(s.sessionId, "crm.lead", "otm_portal_raise_snag", [id, name], {}, co(s));

// ---- availability & costing check ----
export type CostLine = { id: number; name: string; qty: number; est_price: number; availability: "" | "in_stock" | "order" | "unavailable"; lead_days: number; unit_cost: number; vendor: string; note: string };
export type Costing = { estimate: number; cost: number; margin: number; lines: CostLine[] };
export const getCosting = (s: Session, id: number) => callKw<Costing>(s.sessionId, "crm.lead", "otm_costing_data", [[id]], {}, co(s));
export const saveCosting = (s: Session, id: number, lines: CostLine[]) => callKw<boolean>(s.sessionId, "crm.lead", "otm_save_costing", [[id], lines], {}, co(s));

// ---- design studio & shop drawings ----
export type DesignStatus = "draft" | "in_review" | "changes_requested" | "approved";
export type Design = { id: number; lead_id: number; lead: string; name: string; kind: string; status: DesignStatus; revision: number; designer: string; due: string | false; note: string; review_note: string; approved_by: string; can_edit: boolean; can_review: boolean; files: { id: number; name: string; rev: string; pdf: boolean }[] };
export const getDesigns = (s: Session, id: number) => callKw<Design[]>(s.sessionId, "crm.lead", "otm_designs", [[id]], {}, co(s));
export const getDesignsAll = (s: Session) => callKw<Design[]>(s.sessionId, "crm.lead", "otm_design_all", [], {}, co(s));
export const addDesign = (s: Session, id: number, name: string, kind: string, due: string | false, note: string) => callKw<boolean>(s.sessionId, "crm.lead", "otm_add_design", [[id], name, kind, due, note], {}, co(s));
export const addDesignFile = (s: Session, designId: number, filename: string, b64: string) => callKw<boolean>(s.sessionId, "crm.lead", "otm_add_design_file", [designId, filename, b64], {}, co(s));
export const designAction = (s: Session, designId: number, action: string, note: string) => callKw<boolean>(s.sessionId, "crm.lead", "otm_design_action", [designId, action, note], {}, co(s));
export const getDesignFile = (s: Session, attId: number) => callKw<{ mimetype: string; data: string }>(s.sessionId, "crm.lead", "otm_design_file", [attId], {}, co(s));

// ---- finance: payment milestones, receivables, profitability ----
export type MsStatus = "planned" | "draft" | "invoiced" | "overdue" | "paid";
export type MsKind = "advance" | "progress" | "final" | "retention" | "other";
export type Milestone = { id: number; name: string; kind: MsKind; percent: number; trigger: number; amount: number; amount_total: number; status: MsStatus; invoice: string; invoice_id: number | false; residual: number; due: string | false; blocker: string; followup_note: string; followup_date: string | false };
export type MilestoneData = { untaxed: number; tax: number; total: number; cost: number; invoiced: number; outstanding: number; can_plan: boolean; can_bill: boolean; rows: Milestone[] };
export const getMilestones = (s: Session, id: number) => callKw<MilestoneData>(s.sessionId, "crm.lead", "otm_milestones", [[id]], {}, co(s));
export const setMilestones = (s: Session, id: number, lines: { name: string; kind: string; percent: number; trigger: number }[]) => callKw<boolean>(s.sessionId, "crm.lead", "otm_set_milestones", [[id], lines], {}, co(s));
export const invoiceMilestone = (s: Session, id: number, msId: number) => callKw<number>(s.sessionId, "crm.lead", "otm_ms_invoice", [[id], msId], {}, co(s));
export const payMilestone = (s: Session, id: number, msId: number, journalId: number) => callKw<boolean>(s.sessionId, "crm.lead", "otm_ms_pay", [[id], msId, journalId], {}, co(s));
export const followupMilestone = (s: Session, id: number, msId: number, note: string) => callKw<boolean>(s.sessionId, "crm.lead", "otm_ms_followup", [[id], msId, note], {}, co(s));
export type FinRow = { id: number; name: string; customer: string; stage: string; contract: number; revenue: number; invoiced: number; paid: number; outstanding: number; overdue: number; cost: number; margin: number; margin_pct: number; planned: boolean };
export type Overdue = { lead_id: number; lead: string; customer: string; milestone_id: number; milestone: string; residual: number; due: string | false; days: number; followup_note: string; followup_date: string | false };
export const getFinance = (s: Session) => callKw<{ rows: FinRow[]; overdue: Overdue[]; can_bill: boolean }>(s.sessionId, "crm.lead", "otm_finance_overview", [], {}, co(s));

// ---- estimation & BOQ: rate library, revisions ----
export type Rate = { id: number; code: string; name: string; category: string; unit: string; rate: number; cost: number };
export const getRates = (s: Session) => callKw<{ can_manage: boolean; rates: Rate[] }>(s.sessionId, "crm.lead", "otm_rates", [], {}, co(s));
export const saveRate = (s: Session, vals: Partial<Rate>) => callKw<boolean>(s.sessionId, "crm.lead", "otm_save_rate", [vals], {}, co(s));
export const archiveRate = (s: Session, id: number) => callKw<boolean>(s.sessionId, "crm.lead", "otm_archive_rate", [id], {}, co(s));
export type EstRev = { id: number; number: number; reason: string; user: string; date: string; untaxed: number; total: number; lines: { name: string; qty: number; price: number; category: string; unit: string }[] };
export const getEstRevisions = (s: Session, id: number) => callKw<EstRev[]>(s.sessionId, "crm.lead", "otm_estimate_revisions", [[id]], {}, co(s));
export const restoreRevision = (s: Session, id: number, revId: number) => callKw<boolean>(s.sessionId, "crm.lead", "otm_restore_revision", [[id], revId], {}, co(s));
export type BoqRow = { id: number; name: string; customer: string; stage: string; untaxed: number; lines: number; revisions: number; categories: Record<string, number> };
export const getBoqOverview = (s: Session) => callKw<BoqRow[]>(s.sessionId, "crm.lead", "otm_boq_overview", [], {}, co(s));

// ---- procurement module: purchase order tracking, goods receipt, vendors ----
export type PoLine = { id: number; name: string; qty: number; received: number; price: number };
export type PoRow = { id: number; name: string; vendor: string; lead_id: number | false; lead: string; state: string; receipt: "none" | "partial" | "received"; untaxed: number; total: number; expected: string | false; overdue: boolean; lines: PoLine[]; receipts: { line: string; qty: number; date: string; user: string; note: string }[] };
export const getPos = (s: Session) => callKw<{ can_manage: boolean; orders: PoRow[]; queue: { id: number; name: string; stage: string; lines: number; pending: number }[] }>(s.sessionId, "crm.lead", "otm_pos", [], {}, co(s));
export const confirmPo = (s: Session, id: number, expected: string | false) => callKw<boolean>(s.sessionId, "crm.lead", "otm_po_confirm", [id, expected], {}, co(s));
export const setPoExpected = (s: Session, id: number, expected: string | false) => callKw<boolean>(s.sessionId, "crm.lead", "otm_po_set_expected", [id, expected], {}, co(s));
export const cancelPo = (s: Session, id: number) => callKw<boolean>(s.sessionId, "crm.lead", "otm_po_cancel", [id], {}, co(s));
export const receivePo = (s: Session, id: number, lines: { line_id: number; qty: number }[], note: string) => callKw<boolean>(s.sessionId, "crm.lead", "otm_po_receive", [id, lines, note], {}, co(s));
export type Vendor = { id: number; name: string; phone: string; email: string; orders: number; total: number; open: number };
export const getVendors = (s: Session) => callKw<Vendor[]>(s.sessionId, "crm.lead", "otm_vendors", [], {}, co(s));
export const addVendor = (s: Session, name: string, phone: string, email: string) => callKw<boolean>(s.sessionId, "crm.lead", "otm_add_vendor", [name, phone, email], {}, co(s));

// ---- manufacturing (factory) & intercompany orders ----
export type IcStage = "queued" | "cutting" | "assembly" | "finishing" | "qc" | "ready";
export type IcLine = { id: number; name: string; qty: number; price: number; stage: IcStage };
export type IcOrder = { id: number; name: string; lead_id: number; lead: string; customer: string; factory: string; status: string; required: string | false; note: string; reject_reason: string; total: number; by: string; overdue: boolean; lines: IcLine[]; can_edit: boolean; can_send: boolean; can_cancel: boolean; can_decide: boolean; can_move: boolean; can_dispatch: boolean; can_receive: boolean };
export type IcData = { factory: boolean; can_create: boolean; leads: { id: number; name: string }[]; companies: { id: number; name: string }[]; orders: IcOrder[] };
export const getIcOrders = (s: Session) => callKw<IcData>(s.sessionId, "crm.lead", "otm_ic_orders", [], {}, co(s));
export const createIcOrder = (s: Session, leadId: number, companyId: number, required: string | false, note: string) => callKw<number>(s.sessionId, "crm.lead", "otm_ic_create", [leadId, companyId, required, note], {}, co(s));
export const setIcLines = (s: Session, orderId: number, lines: { name: string; qty: number; price: number }[]) => callKw<boolean>(s.sessionId, "crm.lead", "otm_ic_set_lines", [orderId, lines], {}, co(s));
export const importIcJoinery = (s: Session, orderId: number) => callKw<number>(s.sessionId, "crm.lead", "otm_ic_import_joinery", [orderId], {}, co(s));
export const icAction = (s: Session, orderId: number, action: string, note: string) => callKw<boolean>(s.sessionId, "crm.lead", "otm_ic_action", [orderId, action, note], {}, co(s));
export const moveIcLine = (s: Session, lineId: number, stage: string) => callKw<boolean>(s.sessionId, "crm.lead", "otm_ic_move_line", [lineId, stage], {}, co(s));

// ---- petty cash ----
export type PettyEntry = { ref?: string; entry?: string; unposted?: boolean; id: number; kind: "topup" | "expense" | "adjust"; category: string; amount: number; date: string | false; description: string; status: "pending" | "approved" | "rejected"; holder: string; holder_id: number; lead_id: number | false; lead: string; reviewed_by: string; reject_reason: string; files: { id: number; name: string }[]; needs_manager?: boolean; own?: boolean };
export type PettyData = { me: { id: number; name: string }; limit: number; balance: number; pending: number; can_review: boolean; can_topup: boolean; is_manager: boolean; mine: PettyEntry[]; approvals: PettyEntry[]; floats: { id: number; name: string; balance: number; pending: number }[]; leads: { id: number; name: string }[]; month: Record<string, number>; counts: PettyCount[]; unposted: number; configured: boolean; has_request: boolean };
export type PettyCount = { id: number; holder: string; date: string; expected: number; counted: number; difference: number; note: string; by: string };
export type PettySetup = { can_edit: boolean; configured: boolean; journal: number; source: number; diff_account: number; map: Record<string, number>; limit: number; low: number; journals: { id: number; name: string }[]; sources: { id: number; name: string }[]; accounts: { id: number; name: string }[]; cats: { key: string; label: string }[] };
export type PettyStatement = { holder: string; opening: number; topups: number; expenses: number; adjust: number; closing: number; lines: (string | number)[][] }[];
export const getPetty = (s: Session) => callKw<PettyData>(s.sessionId, "crm.lead", "otm_petty_overview", [], {}, co(s));
export const addPetty = (s: Session, lead: number | false, category: string, amount: number, date: string, description: string) => callKw<number>(s.sessionId, "crm.lead", "otm_petty_add", [lead, category, amount, date, description], {}, co(s));
export const addPettyFile = (s: Session, id: number, filename: string, b64: string) => callKw<boolean>(s.sessionId, "crm.lead", "otm_petty_file_add", [id, filename, b64], {}, co(s));
export const cancelPetty = (s: Session, id: number) => callKw<boolean>(s.sessionId, "crm.lead", "otm_petty_cancel", [id], {}, co(s));
export const getPettyFile = (s: Session, id: number) => callKw<{ mimetype: string; data: string }>(s.sessionId, "crm.lead", "otm_petty_file", [id], {}, co(s));
export const topupPetty = (s: Session, userId: number, amount: number, note: string) => callKw<boolean>(s.sessionId, "crm.lead", "otm_petty_topup", [userId, amount, note], {}, co(s));
export const reviewPetty = (s: Session, id: number, decision: string, note: string) => callKw<boolean>(s.sessionId, "crm.lead", "otm_petty_review", [id, decision, note], {}, co(s));

// ---- HR & payroll ----
export type Employee = { id: number; name: string; code: string; user_id: number | false; user: string; kind: "office" | "site"; designation: string; pay_type: "monthly" | "daily"; rate: number; join_date: string | false; phone: string };
export type AttRow = { id: number; name: string; kind: string; status: "" | "present" | "half" | "absent" | "leave"; lead_id: number; month: { present: number; half: number; absent: number; leave: number } };
export type LeaveRow = { id: number; employee: string; employee_id: number; from: string; to: string; days: number; reason: string; status: "pending" | "approved" | "rejected"; reviewed_by: string; reject_reason: string; own: boolean };
export type Payslip = { id: number; employee: string; employee_id: number; pay_type: string; rate: number; month: string; paid_days: number; working_days: number; base: number; allowances: number; deductions: number; net: number; status: "draft" | "approved" | "paid"; note: string };
export const getEmployees = (s: Session) => callKw<{ can_manage: boolean; employees: Employee[]; users: { id: number; name: string }[] }>(s.sessionId, "crm.lead", "otm_hr_employees", [], {}, co(s));
export const saveEmployee = (s: Session, vals: Record<string, unknown>) => callKw<boolean>(s.sessionId, "crm.lead", "otm_hr_save_employee", [vals], {}, co(s));
export const archiveEmployee = (s: Session, id: number) => callKw<boolean>(s.sessionId, "crm.lead", "otm_hr_archive_employee", [id], {}, co(s));
export const getAttendance = (s: Session, day: string) => callKw<{ leads: { id: number; name: string }[]; rows: AttRow[] }>(s.sessionId, "crm.lead", "otm_hr_attendance", [day], {}, co(s));
export const markAttendance = (s: Session, day: string, rows: { id: number; status: string; lead_id: number }[]) => callKw<number>(s.sessionId, "crm.lead", "otm_hr_mark", [day, rows], {}, co(s));
export const getLeaves = (s: Session) => callKw<{ has_employee: boolean; entitlement: number; taken: number; can_review: boolean; mine: LeaveRow[]; pending: LeaveRow[] }>(s.sessionId, "crm.lead", "otm_hr_leaves", [], {}, co(s));
export const requestLeave = (s: Session, from: string, to: string, reason: string) => callKw<boolean>(s.sessionId, "crm.lead", "otm_hr_leave_request", [from, to, reason], {}, co(s));
export const reviewLeave = (s: Session, id: number, decision: string, note: string) => callKw<boolean>(s.sessionId, "crm.lead", "otm_hr_leave_review", [id, decision, note], {}, co(s));
export const getPayroll = (s: Session, month: string) => callKw<{ can_generate: boolean; can_approve: boolean; can_pay: boolean; full: boolean; slips: Payslip[] }>(s.sessionId, "crm.lead", "otm_hr_payroll", [month], {}, co(s));
export const generatePayroll = (s: Session, month: string) => callKw<number>(s.sessionId, "crm.lead", "otm_hr_payroll_generate", [month], {}, co(s));
export const editPayslip = (s: Session, id: number, allowances: number, deductions: number, note: string) => callKw<boolean>(s.sessionId, "crm.lead", "otm_hr_payslip_edit", [id, allowances, deductions, note], {}, co(s));
export const payslipAction = (s: Session, id: number, action: string) => callKw<boolean>(s.sessionId, "crm.lead", "otm_hr_payslip_action", [id, action], {}, co(s));

export type Notif = { id: number; title: string; body: string; link: string; kind: "task" | "info" | "alert"; read: boolean; date: string };
export type MsgLog = { id: number; channel: string; to: string; text: string; status: string; error: string; kind: string; lead: string; date: string };
export type NotifySettings = { email: boolean; wa_url: string; has_token: boolean; has_meta_secret: boolean };
export const getNotifications = (s: Session) => callKw<{ unread: number; items: Notif[] }>(s.sessionId, "crm.lead", "otm_notifications", [], {}, co(s));
export const notifCount = (s: Session) => callKw<number>(s.sessionId, "crm.lead", "otm_notif_count", [], {}, co(s));
export const readNotif = (s: Session, id: number) => callKw<boolean>(s.sessionId, "crm.lead", "otm_notif_read", [id], {}, co(s));
export const getMsgLog = (s: Session) => callKw<MsgLog[]>(s.sessionId, "crm.lead", "otm_msg_log", [], {}, co(s));
export const remindMilestone = (s: Session, msId: number) => callKw<boolean>(s.sessionId, "crm.lead", "otm_ms_remind", [msId], {}, co(s));
export const getNotifySettings = (s: Session) => callKw<NotifySettings>(s.sessionId, "crm.lead", "otm_notify_settings", [], {}, co(s));
export const saveNotifySettings = (s: Session, email: boolean, url: string, token: string, meta: string) => callKw<boolean>(s.sessionId, "crm.lead", "otm_notify_save", [email, url, token, meta], {}, co(s));
export const testNotify = (s: Session, phone: string) => callKw<boolean>(s.sessionId, "crm.lead", "otm_notify_test", [phone], {}, co(s));

export type QueueItem = { id: number; name: string; customer: string; stage: string; note: string };
export const getQueue = (s: Session, kind: "finance" | "design" | "site") => callKw<QueueItem[]>(s.sessionId, "crm.lead", "otm_work_queue", [kind], {}, co(s)).catch(() => [] as QueueItem[]);
export type InstallRow = Install & { lead_id: number; project: string };
export const getInstallAll = (s: Session) => callKw<InstallRow[]>(s.sessionId, "crm.lead", "otm_install_all", [], {}, co(s));
export const requestPettyTopup = (s: Session, amount: number, note: string) => callKw<boolean>(s.sessionId, "crm.lead", "otm_petty_topup_request", [amount, note], {}, co(s));
export const countPetty = (s: Session, userId: number, counted: number, note: string) => callKw<number>(s.sessionId, "crm.lead", "otm_petty_count", [userId, counted, note], {}, co(s));
export const getPettySetup = (s: Session) => callKw<PettySetup>(s.sessionId, "crm.lead", "otm_petty_setup", [], {}, co(s));
export const savePettySetup = (s: Session, journal: number, source: number, diff: number, mapping: Record<string, number>, limit: number, low: number) => callKw<boolean>(s.sessionId, "crm.lead", "otm_petty_setup_save", [journal, source, diff, mapping, limit, low], {}, co(s));
export const postPettyPending = (s: Session) => callKw<{ posted: number; failed: number }>(s.sessionId, "crm.lead", "otm_petty_post_pending", [], {}, co(s));
export const getPettyStatement = (s: Session, month: string) => callKw<PettyStatement>(s.sessionId, "crm.lead", "otm_petty_statement", [month], {}, co(s));
export const getPettyStatementCsv = (s: Session, month: string) => callKw<string>(s.sessionId, "crm.lead", "otm_petty_statement_csv", [month], {}, co(s));
