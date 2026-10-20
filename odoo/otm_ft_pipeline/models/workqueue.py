from odoo import api, fields, models
from odoo.exceptions import UserError

from .crm_lead import ACC, MGR


QUEUES = {
    "finance": (("procurement_approved", "invoice_draft", "invoice_with_sales", "awaiting_advance", "payment_verification"),
                {"procurement_approved": "Create the advance invoice", "invoice_draft": "Finish and send the invoice to Sales", "invoice_with_sales": "Waiting for Sales to send to the customer",
                 "awaiting_advance": "Waiting for the customer advance", "payment_verification": "Verify the payment"}),
    "design": (("assigned", "estimate_draft", "procurement_check", "estimate_manager_review", "estimate_approved", "sent_to_client", "client_approved", "pm_assigned", "procurement",
                "procurement_approved", "invoice_draft", "invoice_with_sales", "awaiting_advance", "payment_verification", "work_started", "handover"), {}),
    "site": (("work_started", "handover"), {}),
}


class CrmLeadQueue(models.Model):
    _inherit = "crm.lead"

    @api.model
    def otm_work_queue(self, kind):
        """Projects relevant to a module, even when the module has no records yet (record rules apply to the real user)."""
        stages, notes = QUEUES.get(kind, ((), {}))
        labels = dict(self._fields["otm_stage"].selection)
        out = []
        for l in self.search([("otm_stage", "in", list(stages))], limit=100, order="write_date desc"):
            n = ""
            if kind == "design":
                n = f"{len(l.sudo().otm_design_ids)} design item(s)"
            elif kind == "site":
                s = l.sudo()
                n = f"{len(s.otm_joinery_ids)} joinery · {len(s.otm_install_ids)} installation · progress {int(s.otm_progress)}%"
            out.append({"id": l.id, "name": l.name, "customer": l.partner_name or l.partner_id.name or "", "stage": labels.get(l.otm_stage, l.otm_stage), "note": notes.get(l.otm_stage) or n})
        return out

    @api.model
    def otm_install_all(self):
        leads = self.search([("otm_stage", "in", ("work_started", "handover", "completed"))])
        return [{**self._otm_install_dict(i), "lead_id": i.lead_id.id, "project": i.lead_id.name}
                for i in self.sudo().env["otm.ft.install"].search([("lead_id", "in", leads.ids)], order="id desc", limit=300)]

    @api.model
    def otm_calendar(self, date_from, date_to):
        """Dated work for the calendar/today panel, limited to what the user can see (record rules apply to the leads)."""
        d0, d1 = fields.Date.from_string(date_from), fields.Date.from_string(date_to)
        if (d1 - d0).days > 70:
            raise UserError(self.env._("Choose a shorter date range."))
        roles = self._otm_user_roles()
        leads = self.search([("otm_stage", "not in", ("lost", False))], limit=500)
        ids = leads.ids
        env = self.sudo().env
        ev = []

        def add(d, title, kind, lead, extra=""):
            if d and d0 <= d <= d1:
                ev.append({"date": fields.Date.to_string(d), "title": title, "kind": kind, "link": f"/m/crm/{lead.id}", "project": lead.name, "extra": extra})

        for t in env["otm.ft.task"].search([("lead_id", "in", ids), ("status", "!=", "done"), ("due_date", ">=", d0), ("due_date", "<=", d1)]):
            add(t.due_date, t.name, "snag" if t.kind == "snag" else "task", t.lead_id, "Snag" if t.kind == "snag" else "Task")
        for j in env["otm.ft.joinery"].search([("lead_id", "in", ids), ("stage", "!=", "installed"), ("due_date", ">=", d0), ("due_date", "<=", d1)]):
            add(j.due_date, f"Joinery: {j.name}", "joinery", j.lead_id)
        for i in env["otm.ft.install"].search([("lead_id", "in", ids), ("status", "!=", "done"), ("planned_date", ">=", d0), ("planned_date", "<=", d1)]):
            add(i.planned_date, f"{i.kind or 'Site'}: {i.name}", "install", i.lead_id)
        for d in env["otm.ft.design"].search([("lead_id", "in", ids), ("status", "!=", "approved"), ("due_date", ">=", d0), ("due_date", "<=", d1)]):
            add(d.due_date, f"Design: {d.name}", "design", d.lead_id)
        if ACC in roles or MGR in roles or self.env.user.has_group("base.group_system"):
            for m in env["otm.ft.milestone"].search([("lead_id", "in", ids)]):
                inv = m.invoice_id
                if inv and inv.state == "posted" and inv.payment_state not in ("paid", "in_payment"):
                    add(inv.invoice_date_due or m.due_date, f"Payment due: {m.name} ({inv.amount_residual:g})", "payment", m.lead_id)
        if any(r in roles for r in ("procurement", "manager", "project_manager")) or self.env.user.has_group("base.group_system"):
            for po in env["purchase.order"].search([("otm_lead_id", "in", ids), ("state", "in", ("purchase", "done")), ("otm_receipt_state", "!=", "received"), ("otm_expected_date", ">=", d0), ("otm_expected_date", "<=", d1)]):
                add(po.otm_expected_date, f"Delivery: {po.name} · {po.partner_id.name}", "delivery", po.otm_lead_id)
        for g in env["otm.ft.contact.log"].search([("lead_id", "in", ids), ("followup_done", "=", False), ("followup_date", ">=", d0), ("followup_date", "<=", d1)]):
            add(g.followup_date, f"Follow up: {g.lead_id.partner_name or g.lead_id.name} — {g.text[:60]}", "followup", g.lead_id)
        ev.sort(key=lambda e: (e["date"], e["kind"]))
        return ev
