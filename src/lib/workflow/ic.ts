// Shared (client + server) constants. Must not import server-only modules.
export const IC_STAGES = [["queued", "Queued"], ["cutting", "Cutting"], ["assembly", "Assembly"], ["finishing", "Finishing"], ["qc", "Quality check"], ["ready", "Ready"]] as const;
export const IC_STATUS: Record<string, string> = { draft: "Draft", sent: "Sent to factory", accepted: "Accepted", in_production: "In production", ready: "Ready for dispatch", delivered: "Dispatched", received: "Received at site", rejected: "Rejected", cancelled: "Cancelled" };
