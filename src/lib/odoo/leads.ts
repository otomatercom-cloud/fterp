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
export type Estimate = { order: string | false; total: number; lines: { name: string; qty: number; price: number; subtotal: number }[] };
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

export type InvoiceInfo = { id: number; name: string; state: string; total: number; residual: number; payment_state: string } | false;
export const getInvoice = (s: Session, id: number) => callKw<InvoiceInfo>(s.sessionId, "crm.lead", "otm_invoice_data", [[id]], {}, co(s));
export const getJournals = (s: Session) => callKw<{ id: number; name: string }[]>(s.sessionId, "crm.lead", "otm_journals", [], {}, co(s));
export const createInvoice = (s: Session, id: number, amount: number) => callKw<number>(s.sessionId, "crm.lead", "otm_create_advance_invoice", [[id], amount], {}, co(s));
export const postInvoice = (s: Session, id: number) => callKw<boolean>(s.sessionId, "crm.lead", "otm_post_invoice", [[id]], {}, co(s));
export const registerPayment = (s: Session, id: number, journalId: number) => callKw<boolean>(s.sessionId, "crm.lead", "otm_register_payment", [[id], journalId], {}, co(s));
