import { getSession } from "@/lib/auth/session";
import { NAV, canSee } from "@/lib/permissions/nav";
import { reportRows } from "@/lib/odoo/leads";
import { STAGE_LABELS, type Stage } from "@/lib/workflow/interior";

// Spreadsheet formula injection guard: prefix risky leading characters.
const cell = (v: unknown) => {
  let t = v === false || v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return `"${t.replace(/"/g, '""')}"`;
};

export async function GET() {
  const s = await getSession();
  const item = NAV.find((n) => n.slug === "reports");
  if (!s || !item || !canSee(item, s.groups)) return new Response("Forbidden", { status: 403 });
  try {
    const rows = await reportRows(s);
    const head = ["Lead", "Customer", "Source", "Stage", "Sales Manager", "Expected value", "Estimate (excl. tax)", "Procurement", "Progress %", "Created"];
    const lines = rows.map((r) => [r.name, r.partner_name, r.otm_origin, STAGE_LABELS[r.otm_stage as Stage] ?? r.otm_stage, r.user_id ? r.user_id[1] : "", r.expected_revenue, r.otm_estimate_amount, r.otm_procurement_amount, r.otm_progress, r.create_date].map(cell).join(","));
    return new Response("﻿" + [head.map(cell).join(","), ...lines].join("\r\n"), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="ft-leads.csv"', "Cache-Control": "no-store" },
    });
  } catch {
    return new Response("Report unavailable", { status: 502 });
  }
}
