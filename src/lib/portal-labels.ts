// Customer-friendly stage names (internal stage names stay internal).
export const PORTAL_STAGE: Record<string, string> = {
  sent_to_client: "Estimate awaiting your approval",
  client_approved: "Approved – we are preparing your project",
  pm_assigned: "Approved – we are preparing your project",
  procurement: "Approved – we are preparing your project",
  procurement_approved: "Approved – we are preparing your project",
  invoice_draft: "Preparing advance invoice",
  invoice_with_sales: "Advance invoice ready",
  awaiting_advance: "Advance payment due",
  payment_verification: "Verifying your payment",
  work_started: "Work in progress",
  handover: "Handover – awaiting your sign-off",
  completed: "Completed",
};
