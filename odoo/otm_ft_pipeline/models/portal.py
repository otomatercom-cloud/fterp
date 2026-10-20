from odoo import api, fields, models
from odoo.exceptions import UserError

from .crm_lead import MGR, SM

PORTAL_VISIBLE = (
    "sent_to_client", "client_approved", "pm_assigned", "procurement", "procurement_approved", "invoice_draft", "invoice_with_sales",
    "awaiting_advance", "payment_verification", "work_started", "handover", "completed",
)
# (stage, action) a customer may perform for their own project -> new stage
PORTAL_ACTIONS = {
    ("sent_to_client", "client_approve"): "client_approved",
    ("sent_to_client", "client_requests_changes"): "estimate_draft",
    ("handover", "confirm_handover"): "completed",
}


class CrmLead(models.Model):
    _inherit = "crm.lead"

    # ---- customer portal (portal users have no CRM access: every call is scoped by the user's own partner, then sudo) ----
    @api.model
    def _otm_portal_leads(self):
        user = self.env.user
        if not user.share:
            raise UserError(self.env._("This is available to customer portal users only."))
        partner = user.partner_id.commercial_partner_id
        return self.sudo().search([("partner_id", "child_of", partner.id), ("type", "=", "opportunity"), ("otm_stage", "in", PORTAL_VISIBLE)], order="id desc")

    @api.model
    def otm_portal_profile(self):
        user = self.env.user
        return {"portal": bool(user.share), "company_id": user.sudo().company_id.id, "company_name": user.sudo().company_id.name}

    @api.model
    def otm_portal_leads(self):
        return [
            {"id": l.id, "name": l.name, "stage": l.otm_stage, "progress": l.otm_progress}
            for l in self._otm_portal_leads()
        ]

    @api.model
    def _otm_portal_lead(self, lead_id):
        lead = self._otm_portal_leads().filtered(lambda l: l.id == int(lead_id))
        if not lead:
            raise UserError(self.env._("Project not found."))
        return lead

    @api.model
    def otm_portal_detail(self, lead_id):
        lead = self._otm_portal_lead(lead_id)
        return {
            "id": lead.id, "name": lead.name, "stage": lead.otm_stage, "progress": lead.otm_progress,
            "estimate": lead.otm_estimate_data(),
            "invoice": lead.otm_invoice_data(),
            "updates": lead.otm_site_updates() if lead.otm_stage in ("work_started", "handover", "completed") else [],
            "installs": [lead._otm_install_dict(i) for i in lead.otm_install_ids] if lead.otm_stage in ("work_started", "handover", "completed") else [],
            "snags": [{"id": t.id, "name": t.name, "status": t.status} for t in lead.otm_task_ids.filtered(lambda t: t.kind == "snag")],
            "can_raise_snag": lead.otm_stage == "handover",
            "can_approve": lead.otm_stage == "sent_to_client",
            "can_signoff": lead.otm_stage == "handover",
        }

    @api.model
    def otm_portal_action(self, lead_id, action):
        lead = self._otm_portal_lead(lead_id)
        to_stage = PORTAL_ACTIONS.get((lead.otm_stage, action))
        if not to_stage:
            raise UserError(self.env._("This action is not available now."))
        if action == "confirm_handover":
            open_snags = lead.otm_task_ids.filtered(lambda t: t.kind == "snag" and t.status != "done")
            if open_snags:
                raise UserError(self.env._("%s snag(s) are still open. They must be fixed before handover.", len(open_snags)))
        if action == "client_approve" and not lead.order_ids:
            raise UserError(self.env._("There is no estimate to approve yet."))
        from_stage = lead.otm_stage
        lead.write({"otm_stage": to_stage})
        self.env["otm.ft.stage.log"].sudo().create(
            {"lead_id": lead.id, "action": action, "from_stage": from_stage, "to_stage": to_stage, "user_id": self.env.user.id}
        )
        return True

    @api.model
    def otm_portal_raise_snag(self, lead_id, name):
        lead = self._otm_portal_lead(lead_id)
        if lead.otm_stage != "handover":
            raise UserError(self.env._("Snags can be raised during handover."))
        name = str(name or "").strip()[:200]
        if not name:
            raise UserError(self.env._("Describe the issue."))
        if len(lead.otm_task_ids.filtered(lambda t: t.kind == "snag" and t.status != "done")) >= 30:
            raise UserError(self.env._("Too many open snags. Please contact FT Interior Design."))
        self.env["otm.ft.task"].sudo().create({"lead_id": lead.id, "name": "[Client] " + name, "kind": "snag", "user_id": self.env.user.id})
        return True

    # ---- staff side: give a customer portal access ----
    def otm_portal_user_info(self):
        self.ensure_one()
        user = self.sudo().partner_id.user_ids[:1]
        return {"login": user.login if user else False, "has_partner": bool(self.partner_id)}

    def otm_create_portal_user(self, login, password):
        self.ensure_one()
        roles = self._otm_user_roles()
        if not (SM in roles or MGR in roles):
            raise UserError(self.env._("Only a Sales Manager or Manager can give portal access."))
        login, password = str(login or "").strip().lower(), str(password or "")
        if "@" not in login or len(login) > 128:
            raise UserError(self.env._("Enter the customer's email as the login."))
        if len(password) < 8:
            raise UserError(self.env._("Password must be at least 8 characters."))
        partner = self.sudo().partner_id
        if not partner:
            raise UserError(self.env._("Create the estimate first so the customer contact exists."))
        if partner.user_ids:
            raise UserError(self.env._("This customer already has a login."))
        Users = self.env["res.users"].sudo()
        if Users.with_context(active_test=False).search_count([("login", "=", login)]):
            raise UserError(self.env._("This login is already used."))
        Users.create({
            "name": partner.name, "login": login, "email": login, "partner_id": partner.id,
            "group_ids": [(6, 0, [self.env.ref("base.group_portal").id])], "password": password,
            "company_id": (self.company_id or self.env.company).id, "company_ids": [(6, 0, [(self.company_id or self.env.company).id])],
        })
        return True
