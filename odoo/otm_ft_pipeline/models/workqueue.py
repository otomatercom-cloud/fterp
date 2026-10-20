from odoo import api, models


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
