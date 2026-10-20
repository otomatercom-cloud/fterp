import re
from datetime import timedelta

from odoo import api, fields, models
from odoo.exceptions import UserError

from .crm_lead import ACC, MGR, PM, SM

KINDS = [("call", "Call"), ("whatsapp", "WhatsApp"), ("meeting", "Meeting"), ("visit", "Site visit"), ("email", "Email"), ("note", "Note")]


class OtmFtContactLog(models.Model):
    _name = "otm.ft.contact.log"
    _description = "FT Customer Contact Log"
    _order = "date desc, id desc"

    lead_id = fields.Many2one("crm.lead", required=True, ondelete="cascade", index=True)
    kind = fields.Selection(KINDS, default="call", required=True)
    text = fields.Char(required=True)
    date = fields.Datetime(default=fields.Datetime.now)
    user_id = fields.Many2one("res.users", default=lambda self: self.env.user)
    followup_date = fields.Date()
    followup_done = fields.Boolean(default=False)


class CrmLeadCustomer(models.Model):
    _inherit = "crm.lead"

    otm_whatsapp = fields.Char(string="WhatsApp", copy=False)
    otm_contact_person = fields.Char(string="Contact person", copy=False)
    otm_address = fields.Char(string="Address / site location", copy=False)
    otm_contact_log_ids = fields.One2many("otm.ft.contact.log", "lead_id")

    @api.model
    def _otm_cust_role(self):
        roles = self._otm_user_roles()
        if not any(r in roles for r in (SM, MGR, PM, ACC)):
            raise UserError(self.env._("Customers are available to Sales, Managers, Project Managers and Accounts."))
        return roles

    @staticmethod
    def _otm_cust_key(lead):
        digits = re.sub(r"\D", "", lead.phone or "")
        if lead.partner_id:
            return f"p{lead.partner_id.id}"
        if len(digits) >= 7:
            return f"t{digits[-9:]}"
        if lead.email_from:
            return f"e{lead.email_from.strip().lower()}"
        return f"l{lead.id}"

    def _otm_cust_leads(self, lead):
        """All leads of the same customer that this user can see (record rules apply)."""
        key = self._otm_cust_key(lead)
        return self.search([("type", "=", "opportunity")], limit=2000).filtered(lambda l: self._otm_cust_key(l) == key)

    def _otm_cust_dict(self, leads):
        lead = leads.sorted("id")[-1]
        logs = self.env["otm.ft.contact.log"].sudo().search([("lead_id", "in", leads.ids)])
        pend = logs.filtered(lambda g: g.followup_date and not g.followup_done)
        s = lead.sudo()
        return {
            "id": lead.id, "name": s.partner_name or s.partner_id.name or lead.name, "phone": s.phone or s.partner_id.phone or "", "whatsapp": s.otm_whatsapp or s.phone or "",
            "email": s.email_from or s.partner_id.email or "", "address": s.otm_address or "", "person": s.otm_contact_person or "",
            "projects": [{"id": l.id, "name": l.name, "stage": l.otm_stage, "estimate": l.otm_estimate_amount, "origin": l.otm_origin} for l in leads.sorted("id", reverse=True)],
            "last_contact": fields.Datetime.to_string(logs[:1].date) if logs else False,
            "next_followup": fields.Date.to_string(min(pend.mapped("followup_date"))) if pend else False,
        }

    @api.model
    def otm_customers(self):
        roles = self._otm_cust_role()
        groups = {}
        for l in self.search([("type", "=", "opportunity")], order="id desc", limit=2000):
            groups.setdefault(self._otm_cust_key(l), self.browse())
            groups[self._otm_cust_key(l)] |= l
        rows = [self._otm_cust_dict(g) for g in groups.values()]
        rows.sort(key=lambda r: r["name"].lower())
        return {"can_edit": SM in roles or MGR in roles, "customers": rows}

    @api.model
    def otm_customer(self, lead_id):
        roles = self._otm_cust_role()
        lead = self.browse(int(lead_id))
        lead.check_access("read")
        leads = self._otm_cust_leads(lead) | lead
        d = self._otm_cust_dict(leads)
        logs = self.env["otm.ft.contact.log"].sudo().search([("lead_id", "in", leads.ids)], limit=200)
        d["logs"] = [{"id": g.id, "kind": g.kind, "text": g.text, "date": fields.Datetime.to_string(g.date), "user": g.user_id.name or "", "project": g.lead_id.name, "lead_id": g.lead_id.id,
                      "followup": fields.Date.to_string(g.followup_date) if g.followup_date else False, "done": g.followup_done} for g in logs]
        d["can_edit"] = (SM in roles and any(l.user_id == self.env.user for l in leads)) or MGR in roles or self.env.user.has_group("base.group_system")
        d["can_log"] = SM in roles or MGR in roles or PM in roles
        d["focus_lead"] = lead.id
        return d

    @api.model
    def otm_customer_save(self, lead_id, name, phone, whatsapp, email, address, person):
        roles = self._otm_cust_role()
        lead = self.browse(int(lead_id))
        lead.check_access("read")
        name, phone, whatsapp, email = str(name or "").strip()[:120], str(phone or "").strip()[:40], str(whatsapp or "").strip()[:40], str(email or "").strip()[:120]
        if not name or not (phone or email):
            raise UserError(self.env._("Enter the customer name and a phone or email."))
        if email and not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
            raise UserError(self.env._("Enter a valid email address."))
        for l in (self._otm_cust_leads(lead) | lead):
            if MGR in roles or self.env.user.has_group("base.group_system") or (SM in roles and l.user_id == self.env.user):
                l.sudo().write({"partner_name": name, "phone": phone, "email_from": email, "otm_whatsapp": whatsapp, "otm_address": str(address or "").strip()[:200], "otm_contact_person": str(person or "").strip()[:120]})
                if l.sudo().partner_id:
                    l.sudo().partner_id.write({"name": name, "phone": phone, "email": email})
        if not (MGR in roles or self.env.user.has_group("base.group_system") or lead.user_id == self.env.user):
            raise UserError(self.env._("Only the Sales Manager of this lead or a Manager can edit contact details."))
        return True

    @api.model
    def otm_contact_log_add(self, lead_id, kind, text, followup=False):
        roles = self._otm_cust_role()
        if not any(r in roles for r in (SM, MGR, PM)):
            raise UserError(self.env._("Only Sales, Project Managers and Managers can log customer contact."))
        lead = self.browse(int(lead_id))
        lead.check_access("read")
        text = str(text or "").strip()[:300]
        if kind not in dict(KINDS) or not text:
            raise UserError(self.env._("Choose the type and write what was discussed."))
        fu = fields.Date.from_string(followup) if followup else False
        if fu and fu < fields.Date.context_today(self) - timedelta(days=1):
            raise UserError(self.env._("The follow-up date cannot be in the past."))
        self.env["otm.ft.contact.log"].sudo().create({"lead_id": lead.id, "kind": kind, "text": text, "followup_date": fu or False})
        return True

    @api.model
    def otm_contact_followup_done(self, log_id):
        self._otm_cust_role()
        g = self.env["otm.ft.contact.log"].sudo().browse(int(log_id))
        if not g.exists():
            raise UserError(self.env._("Follow-up not found."))
        g.lead_id.check_access("read")
        g.write({"followup_done": True})
        return True
