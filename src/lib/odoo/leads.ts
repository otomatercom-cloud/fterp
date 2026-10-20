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
export type Estimate = { order: string | false; total: number; untaxed: number; tax: number; tax_name: string | false; tax_rate: number; lines: { name: string; qty: number; price: number; subtotal: number }[] };
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
export const saveEstimate = (s: Session, id: number, lines: { name: string; qty: number; price: number }[]) =>
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
export const loadDemo = (s: Session) => callKw<{ created: number; invoices_skipped: number }>(s.sessionId, "crm.lead", "otm_load_demo_data", [], {}, co(s));
export const removeDemo = (s: Session) => callKw<{ removed: number; invoices_kept: number }>(s.sessionId, "crm.lead", "otm_remove_demo_data", [], {}, co(s));

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
