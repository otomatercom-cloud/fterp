// Shared (client + server) label tables. Never export values like these from a "use client" file:
// a server component importing them gets a client reference, not the object, and the page crashes.
export const KIND_LABEL: Record<string, string> = { concept: "Concept", moodboard: "Mood board", material_board: "Material board", layout: "Layout / plan", render_3d: "3D render", shop_drawing: "Shop drawing" };
export const STATUS_LABEL: Record<string, string> = { draft: "Draft", in_review: "In review", changes_requested: "Changes requested", approved: "Approved" };

export type CalKind = "task" | "snag" | "joinery" | "install" | "design" | "payment" | "delivery" | "followup";
export const CAL_KIND: Record<CalKind, { label: string; dot: string }> = {
  task: { label: "Task", dot: "bg-gold" }, snag: { label: "Snag", dot: "bg-danger" }, joinery: { label: "Joinery", dot: "bg-bronze" }, install: { label: "Installation", dot: "bg-success" },
  design: { label: "Design", dot: "bg-rose" }, followup: { label: "Customer follow-up", dot: "bg-ink" }, payment: { label: "Payment due", dot: "bg-warning" }, delivery: { label: "Delivery", dot: "bg-primary" },
};
