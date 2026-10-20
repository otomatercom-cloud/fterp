// FT interior pipeline: Lead → Work start. Pure rules, no I/O.
// Odoo stays the authority: the same rules must be enforced in the Odoo addon; this copy drives UI + tests.
export type Role = "sales_manager" | "manager" | "project_manager" | "procurement" | "accounts" | "client";
export type Source = "meta" | "walkin" | "other";

export type Stage =
  | "new" | "assigned"
  | "estimate_draft" | "procurement_check" | "estimate_manager_review" | "estimate_approved" | "sent_to_client"
  | "client_approved" | "pm_assigned"
  | "procurement" | "procurement_approved"
  | "invoice_draft" | "invoice_with_sales" | "awaiting_advance" | "payment_verification"
  | "work_started" | "handover" | "completed" | "lost";

export type Transition = { from: Stage; action: string; to: Stage; by: Role[] };

export const TRANSITIONS: Transition[] = [
  { from: "new", action: "assign", to: "assigned", by: ["manager"] }, // meta: auto round-robin (system); walk-in: creator; other: manager
  { from: "assigned", action: "create_estimate", to: "estimate_draft", by: ["sales_manager"] },
  { from: "estimate_draft", action: "submit_to_procurement", to: "procurement_check", by: ["sales_manager"] }, // Procurement checks availability + costing first
  { from: "procurement_check", action: "confirm_costing", to: "estimate_manager_review", by: ["procurement"] },
  { from: "procurement_check", action: "return_to_sales", to: "estimate_draft", by: ["procurement"] }, // e.g. item not available
  { from: "estimate_manager_review", action: "approve", to: "estimate_approved", by: ["manager"] },
  { from: "estimate_manager_review", action: "reject", to: "estimate_draft", by: ["manager"] },
  { from: "estimate_approved", action: "send_to_client", to: "sent_to_client", by: ["sales_manager"] },
  { from: "sent_to_client", action: "client_approve", to: "client_approved", by: ["sales_manager"] }, // recorded by sales on client's behalf, with evidence
  { from: "sent_to_client", action: "client_requests_changes", to: "estimate_draft", by: ["sales_manager"] },
  { from: "sent_to_client", action: "mark_lost", to: "lost", by: ["sales_manager", "manager"] },
  { from: "client_approved", action: "assign_project_manager", to: "pm_assigned", by: ["manager"] },
  { from: "pm_assigned", action: "send_to_procurement", to: "procurement", by: ["project_manager"] },
  { from: "procurement", action: "approve_prices", to: "procurement_approved", by: ["procurement"] },
  { from: "procurement_approved", action: "start_invoice", to: "invoice_draft", by: ["accounts"] },
  { from: "invoice_draft", action: "send_to_sales", to: "invoice_with_sales", by: ["accounts"] },
  { from: "invoice_with_sales", action: "send_to_client", to: "awaiting_advance", by: ["sales_manager"] },
  { from: "awaiting_advance", action: "record_payment", to: "payment_verification", by: ["sales_manager", "accounts"] },
  { from: "payment_verification", action: "verify_payment", to: "work_started", by: ["accounts"] }, // PM may start only after this
  { from: "work_started", action: "complete_work", to: "handover", by: ["project_manager"] }, // only at 100% site progress
  { from: "handover", action: "confirm_handover", to: "completed", by: ["sales_manager", "manager"] }, // client sign-off recorded by sales
];

export function allowedActions(stage: Stage, roles: Role[]): Transition[] {
  return TRANSITIONS.filter((t) => t.from === stage && t.by.some((r) => roles.includes(r)));
}

export function transition(stage: Stage, action: string, roles: Role[]): Stage {
  const t = allowedActions(stage, roles).find((x) => x.action === action);
  if (!t) throw new Error(`Action "${action}" not allowed from "${stage}" for roles [${roles.join(", ")}]`);
  return t.to;
}

/** Who owns a new lead. meta → round-robin pool of Sales Managers; walk-in → the creating Sales Manager; other → Manager picks. */
export function assignmentRule(source: Source): "round_robin" | "creator" | "manager_assigns" {
  return source === "meta" ? "round_robin" : source === "walkin" ? "creator" : "manager_assigns";
}

/** Next user id in the pool after `last` (stable order). Returns null for an empty pool. */
export function nextRoundRobin(pool: number[], last?: number | null): number | null {
  if (pool.length === 0) return null;
  const sorted = [...pool].sort((a, b) => a - b);
  return sorted.find((id) => last == null || id > last) ?? sorted[0];
}

/** Procurement must match the approved estimate; anything above needs Manager sign-off (assumption — confirm with FT). */
export function procurementCheck(quoted: number, estimated: number): "ok" | "needs_manager_approval" {
  return quoted <= estimated ? "ok" : "needs_manager_approval";
}

export const STAGE_LABELS: Record<Stage, string> = {
  new: "New", assigned: "Assigned", estimate_draft: "Estimate draft", procurement_check: "Procurement check", estimate_manager_review: "Manager review",
  estimate_approved: "Estimate approved", sent_to_client: "Sent to client", client_approved: "Client approved",
  pm_assigned: "PM assigned", procurement: "Procurement", procurement_approved: "Procurement approved",
  invoice_draft: "Invoice draft", invoice_with_sales: "Invoice with sales", awaiting_advance: "Awaiting advance",
  payment_verification: "Payment verification", work_started: "Work started", handover: "Handover", completed: "Completed", lost: "Lost",
};
export const ACTION_LABELS: Record<string, string> = {
  assign: "Assign lead", create_estimate: "Create estimate", submit_to_procurement: "Send to procurement for costing", confirm_costing: "Confirm availability & costing", return_to_sales: "Return to sales", approve: "Approve estimate",
  reject: "Reject", send_to_client: "Send to client", client_approve: "Client approved", client_requests_changes: "Client wants changes",
  mark_lost: "Mark lost", assign_project_manager: "Assign PM", send_to_procurement: "Send to procurement", approve_prices: "Approve prices",
  start_invoice: "Start invoice", send_to_sales: "Send to sales", record_payment: "Record advance", verify_payment: "Verify payment", complete_work: "Complete work (handover)", confirm_handover: "Confirm client handover",
};

/** Inputs the UI shows per stage (Odoo re-checks role + stage on every write). */
export const FIELD_STAGES: Record<string, Stage[]> = {
  user_id: ["new", "assigned"],
  otm_project_manager_id: ["client_approved", "pm_assigned"],
  otm_advance_amount: ["awaiting_advance"],
};
