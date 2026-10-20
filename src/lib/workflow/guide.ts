// Shared (client + server) guidance for every pipeline stage. No server-only imports.
import { TRANSITIONS, type Stage } from "./interior.ts";

export const PHASES = ["Lead", "Estimate", "Approval", "Procurement", "Billing", "Execution", "Handover"] as const;
export const STAGE_PHASE: Record<Stage, number> = {
  new: 0, assigned: 0, estimate_draft: 1, procurement_check: 1, estimate_manager_review: 1, estimate_approved: 2, sent_to_client: 2, client_approved: 2, pm_assigned: 3,
  procurement: 3, procurement_approved: 4, invoice_draft: 4, invoice_with_sales: 4, awaiting_advance: 4, payment_verification: 4, work_started: 5, handover: 6, completed: 6, lost: 0,
};

export type Guide = { owner: string; title: string; steps: string[]; link?: { href: string; label: string }; next: string; ifWrong?: string };

export const GUIDE: Record<Stage, Guide> = {
  new: { owner: "Manager", title: "Assign this lead to a Sales Manager", steps: ["Check the customer name, phone and requirement.", "Choose the Sales Manager under \"Inputs for this stage\".", "Click Assign."], next: "The Sales Manager is notified and creates the estimate." },
  assigned: { owner: "Sales Manager", title: "Meet the customer and start the estimate", steps: ["Call the customer, confirm the requirement and budget (write notes in the lead description).", "Add design items if needed (concept, moodboard, layout) in Design & drawings.", "Click Create estimate."], next: "The lead moves to Estimate draft." },
  estimate_draft: { owner: "Sales Manager", title: "Prepare the estimate (BOQ)", steps: ["Add lines in the Estimate card (use the rate library for standard items); set category, unit, qty and price.", "Check the total and tax, then save.", "Click Send to procurement for costing."], link: { href: "/m/boq", label: "Open Estimation & BOQ" }, next: "Procurement checks availability and cost.", ifWrong: "If Procurement or the Manager sends it back, fix the lines and submit again (revisions are kept)." },
  procurement_check: { owner: "Procurement", title: "Check availability and costing", steps: ["Open Availability & costing and enter the real cost and availability for every line.", "Confirm the margin is acceptable.", "Click Confirm availability & costing."], next: "The Manager reviews the estimate.", ifWrong: "If an item is not available, click Return to sales with the reason." },
  estimate_manager_review: { owner: "Manager", title: "Review and approve the estimate", steps: ["Check pricing, margin, scope and the costing.", "Click Approve estimate."], next: "The Sales Manager sends it to the customer.", ifWrong: "Click Reject to send it back to the Sales Manager." },
  estimate_approved: { owner: "Sales Manager", title: "Send the estimate to the customer", steps: ["Make sure the customer has portal access (Customer portal access card).", "Click Send to client. The customer gets a WhatsApp message and can view it in the portal."], next: "Wait for the customer's decision." },
  sent_to_client: { owner: "Sales Manager", title: "Follow up and record the customer's decision", steps: ["Call the customer for the decision.", "Approved: click Client approved. Changes wanted: click Client wants changes (back to Estimate draft). Not interested: Mark lost."], next: "On approval the Manager assigns a Project Manager." },
  client_approved: { owner: "Manager", title: "Assign the Project Manager", steps: ["Choose the Project Manager under \"Inputs for this stage\".", "Click Assign PM."], next: "The Project Manager prepares the material list." },
  pm_assigned: { owner: "Project Manager", title: "Send the material list to Procurement", steps: ["Review the approved estimate and the site plan.", "Click Send to procurement."], next: "Procurement enters vendors and prices and raises purchase orders." },
  procurement: { owner: "Procurement", title: "Buy the materials", steps: ["Enter vendor and price for every line (Procurement prices) and save.", "Click Create purchase orders (one PO per vendor).", "Confirm the POs on the Procurement page.", "Click Approve prices."], link: { href: "/m/procurement", label: "Open Procurement" }, next: "Accounts raises the advance invoice." },
  procurement_approved: { owner: "Accounts", title: "Start the advance invoice", steps: ["Set the Payment schedule (advance / progress / final / retention, total 100%) in Finance.", "Click Start invoice."], link: { href: "/m/finance", label: "Open Finance" }, next: "Accounts finishes the invoice and passes it to Sales." },
  invoice_draft: { owner: "Accounts", title: "Create and post the advance invoice", steps: ["In Advance invoice: create the invoice, check lines and tax, post it.", "Click Send to sales."], next: "The Sales Manager sends it to the customer." },
  invoice_with_sales: { owner: "Sales Manager", title: "Send the invoice to the customer", steps: ["Click Send to client. The customer is told the advance invoice is shared."], next: "Wait for the advance payment." },
  awaiting_advance: { owner: "Sales Manager / Accounts", title: "Collect the advance", steps: ["When the customer pays, enter the amount under Advance received.", "Click Record advance."], next: "Accounts verifies the payment." },
  payment_verification: { owner: "Accounts", title: "Verify the payment", steps: ["Check the money is in the bank.", "Choose the journal, register the payment on the invoice and click Verify payment."], next: "Work starts and the project appears under Projects." },
  work_started: { owner: "Project Manager", title: "Run the project", steps: ["Add tasks, joinery jobs and site visits/installations; post site updates with photos so progress reaches 100%.", "Send furniture to the factory with an Intercompany order if needed.", "Receive purchase orders as goods arrive; invoice milestones in Finance.", "When all work and snags are done, click Complete work (handover)."], link: { href: "/m/projects", label: "Open Projects" }, next: "Handover to the customer." },
  handover: { owner: "Sales Manager / Manager", title: "Hand over and close", steps: ["Walk through with the customer; close open snags.", "Click Confirm client handover."], next: "The project is completed; Accounts collects the final and retention payments." },
  completed: { owner: "Accounts", title: "Project completed", steps: ["Collect any remaining milestone payments (Finance).", "Review profitability (estimate vs procurement, petty cash and labour cost)."], link: { href: "/m/finance", label: "Open Finance" }, next: "Nothing further in the pipeline." },
  lost: { owner: "—", title: "Lead closed as lost", steps: ["No further steps."], next: "—" },
};

/** Roles that can act on this stage (from the transition table). */
export function stageActors(stage: Stage): string[] {
  return [...new Set(TRANSITIONS.filter((t) => t.from === stage).flatMap((t) => t.by as string[]))];
}
