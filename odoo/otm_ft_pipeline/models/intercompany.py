from odoo import api, fields, models
from odoo.exceptions import AccessError, UserError

from .crm_lead import MGR, PM

MFG = "manufacturing"
STAGES = [("queued", "Queued"), ("cutting", "Cutting"), ("assembly", "Assembly"), ("finishing", "Finishing"), ("qc", "Quality check"), ("ready", "Ready")]
STATUSES = [
    ("draft", "Draft"), ("sent", "Sent to factory"), ("accepted", "Accepted"), ("in_production", "In production"), ("ready", "Ready for dispatch"),
    ("delivered", "Dispatched"), ("received", "Received at site"), ("rejected", "Rejected"), ("cancelled", "Cancelled"),
]
CLOSED = ("delivered", "received", "rejected", "cancelled")


class OtmFtIcOrder(models.Model):
    _name = "otm.ft.ic.order"
    _description = "FT Intercompany Order"
    _order = "id desc"

    name = fields.Char(default="New")
    lead_id = fields.Many2one("crm.lead", required=True, ondelete="cascade", index=True)
    supplier_company_id = fields.Many2one("res.company", required=True, string="Factory Company")
    status = fields.Selection(STATUSES, default="draft", required=True, index=True)
    required_date = fields.Date()
    note = fields.Text()
    reject_reason = fields.Char()
    created_by = fields.Many2one("res.users", default=lambda self: self.env.user)
    line_ids = fields.One2many("otm.ft.ic.line", "order_id")
    total = fields.Float(compute="_compute_total", store=True)

    @api.depends("line_ids.qty", "line_ids.unit_price")
    def _compute_total(self):
        for o in self:
            o.total = sum(l.qty * l.unit_price for l in o.line_ids)

    @api.model_create_multi
    def create(self, vals_list):
        recs = super().create(vals_list)
        for r in recs:
            r.name = "IC-%05d" % r.id
        return recs


class OtmFtIcLine(models.Model):
    _name = "otm.ft.ic.line"
    _description = "FT Intercompany Order Line / Production Item"
    _order = "id"

    order_id = fields.Many2one("otm.ft.ic.order", required=True, ondelete="cascade", index=True)
    name = fields.Char(required=True)
    qty = fields.Float(default=1.0)
    unit_price = fields.Float(help="Transfer price per unit, excl. tax")
    stage = fields.Selection(STAGES, default="queued", required=True)


class CrmLeadIc(models.Model):
    _inherit = "crm.lead"

    # ---- helpers ----
    @api.model
    def _otm_ic_scope(self):
        """(roles, visible lead ids, factory company ids) for the real user."""
        roles = self._otm_user_roles()
        user = self.env.user
        leads = []
        if any(r in roles for r in ("sales_manager", MGR, PM, "procurement", "accounts")):
            try:
                leads = self.search([("otm_stage", "not in", ("lost", False))]).ids
            except AccessError:
                leads = []
        factory = []
        if MFG in roles:
            factory = self.env["res.company"].sudo().search([]).ids if user.has_group("base.group_system") else user.company_ids.ids
        return roles, set(leads), set(factory)

    @api.model
    def _otm_ic_dict(self, o, roles, leads, factory):
        lead = o.lead_id
        src = lead.id in leads
        fac = o.supplier_company_id.id in factory
        manage = src and lead.browse(lead.id)._otm_can_manage_project()
        today = fields.Date.context_today(self)
        return {
            "id": o.id, "name": o.name, "lead_id": lead.id, "lead": lead.name, "customer": lead.partner_name or "", "factory": o.supplier_company_id.name,
            "status": o.status, "required": fields.Date.to_string(o.required_date) if o.required_date else False, "note": o.note or "",
            "reject_reason": o.reject_reason or "", "total": o.total, "by": o.created_by.name or "",
            "overdue": bool(o.required_date and o.required_date < today and o.status not in CLOSED),
            "lines": [{"id": l.id, "name": l.name, "qty": l.qty, "price": l.unit_price, "stage": l.stage} for l in o.line_ids],
            "can_edit": manage and o.status == "draft", "can_send": manage and o.status == "draft", "can_cancel": manage and o.status in ("draft", "sent"),
            "can_decide": fac and o.status == "sent", "can_move": fac and o.status in ("accepted", "in_production"),
            "can_dispatch": fac and o.status == "ready", "can_receive": manage and o.status == "delivered",
        }

    @api.model
    def _otm_ic_order(self, order_id):
        o = self.env["otm.ft.ic.order"].sudo().browse(int(order_id))
        roles, leads, factory = self._otm_ic_scope()
        if not o.exists() or not (o.lead_id.id in leads or o.supplier_company_id.id in factory):
            raise UserError(self.env._("Order not found."))
        return o, roles, leads, factory

    # ---- queries ----
    @api.model
    def otm_ic_orders(self):
        roles, leads, factory = self._otm_ic_scope()
        if not leads and not factory:
            raise UserError(self.env._("Intercompany orders are available to Project Managers, Managers and the factory team."))
        Order = self.env["otm.ft.ic.order"].sudo()
        orders = Order.search(["|", ("lead_id", "in", list(leads)), ("supplier_company_id", "in", list(factory))], limit=300)
        creators = []
        companies = []
        if leads:
            for lead in self.browse(list(leads)):
                if lead.otm_stage in ("client_approved", "pm_assigned", "procurement", "procurement_approved", "invoice_draft", "invoice_with_sales", "awaiting_advance", "payment_verification", "work_started", "handover") and lead._otm_can_manage_project():
                    creators.append({"id": lead.id, "name": lead.name})
            companies = [{"id": c.id, "name": c.name} for c in self.env["res.company"].sudo().search([])]
        return {
            "factory": bool(factory), "can_create": bool(creators), "leads": creators, "companies": companies,
            "orders": [self._otm_ic_dict(o, roles, leads, factory) for o in orders],
        }

    # ---- source side: create / edit / send ----
    @api.model
    def otm_ic_create(self, lead_id, company_id, required=False, note=""):
        roles, leads, _f = self._otm_ic_scope()
        lead = self.browse(int(lead_id))
        if lead.id not in leads or not lead._otm_can_manage_project():
            raise UserError(self.env._("Only the assigned Project Manager or a Manager can order from the factory."))
        company = self.env["res.company"].sudo().browse(int(company_id))
        if not company.exists():
            raise UserError(self.env._("Choose the factory company."))
        o = self.env["otm.ft.ic.order"].sudo().create({"lead_id": lead.id, "supplier_company_id": company.id, "required_date": required or False, "note": str(note or "").strip()[:1000], "created_by": self.env.user.id})
        return o.id

    @api.model
    def otm_ic_set_lines(self, order_id, lines):
        o, _r, _l, _f = self._otm_ic_order(order_id)
        if o.status != "draft" or not o.lead_id._otm_can_manage_project():
            raise UserError(self.env._("Lines can be edited by the project owner while the order is a draft."))
        if not isinstance(lines, list) or not 1 <= len(lines) <= 100:
            raise UserError(self.env._("Add between 1 and 100 lines."))
        cmds = [(5, 0, 0)]
        for l in lines:
            name, qty, price = str(l.get("name") or "").strip()[:200], float(l.get("qty") or 0), float(l.get("price") or 0)
            if not name or qty <= 0 or price < 0:
                raise UserError(self.env._("Each line needs a description, a quantity above 0 and a price of 0 or more."))
            cmds.append((0, 0, {"name": name, "qty": qty, "unit_price": price}))
        o.write({"line_ids": cmds})
        return True

    @api.model
    def otm_ic_import_joinery(self, order_id):
        o, _r, _l, _f = self._otm_ic_order(order_id)
        if o.status != "draft" or not o.lead_id._otm_can_manage_project():
            raise UserError(self.env._("Only a draft order can be changed."))
        have = {l.name for l in o.line_ids}
        new = [(0, 0, {"name": j.name, "qty": j.qty or 1.0}) for j in o.lead_id.sudo().otm_joinery_ids if j.name not in have]
        if not new:
            raise UserError(self.env._("All joinery jobs of this project are already on the order (or there are none)."))
        o.write({"line_ids": new})
        return len(new)

    # ---- workflow ----
    @api.model
    def otm_ic_action(self, order_id, action, note=""):
        o, roles, leads, factory = self._otm_ic_order(order_id)
        d = self._otm_ic_dict(o, roles, leads, factory)
        note = str(note or "").strip()[:300]
        lead = o.lead_id.sudo()
        if action == "send":
            if not d["can_send"]:
                raise UserError(self.env._("You cannot send this order."))
            if not o.line_ids:
                raise UserError(self.env._("Add at least one line before sending."))
            o.write({"status": "sent"})
        elif action == "cancel":
            if not d["can_cancel"]:
                raise UserError(self.env._("You cannot cancel this order."))
            o.write({"status": "cancelled"})
        elif action == "accept":
            if not d["can_decide"]:
                raise UserError(self.env._("Only the factory team can accept a sent order."))
            o.write({"status": "accepted"})
        elif action == "reject":
            if not d["can_decide"]:
                raise UserError(self.env._("Only the factory team can reject a sent order."))
            if not note:
                raise UserError(self.env._("Write the reason for rejecting."))
            o.write({"status": "rejected", "reject_reason": note})
        elif action == "dispatch":
            if not d["can_dispatch"]:
                raise UserError(self.env._("Only a ready order can be dispatched by the factory."))
            o.write({"status": "delivered"})
        elif action == "receive":
            if not d["can_receive"]:
                raise UserError(self.env._("Only the project owner can confirm receipt of a dispatched order."))
            o.write({"status": "received"})
        else:
            raise UserError(self.env._("Unknown action."))
        try:
            if action == "send":
                self._otm_notify(self._otm_hook_users("manufacturing"), f"New factory order: {o.name}", lead.name or "", "/m/manufacturing", "task", lead)
            elif action in ("accept", "reject", "dispatch"):
                self._otm_notify((lead.otm_project_manager_id | lead.user_id), f"Factory order {o.name}: {action}", note or lead.name or "", f"/m/crm/{lead.id}", "info", lead)
        except Exception:
            pass
        lead.message_post(body=self.env._("Factory order %(n)s: %(a)s.", n=o.name, a=action.replace("_", " ")), author_id=self.env.user.partner_id.id)
        return True

    @api.model
    def otm_ic_move_line(self, line_id, stage):
        line = self.env["otm.ft.ic.line"].sudo().browse(int(line_id))
        if not line.exists():
            raise UserError(self.env._("Item not found."))
        o, roles, leads, factory = self._otm_ic_order(line.order_id.id)
        if not self._otm_ic_dict(o, roles, leads, factory)["can_move"]:
            raise UserError(self.env._("Only the factory team can update production."))
        if stage not in dict(STAGES):
            raise UserError(self.env._("Invalid stage."))
        line.write({"stage": stage})
        stages = o.line_ids.mapped("stage")
        o.write({"status": "ready" if all(s == "ready" for s in stages) else "in_production" if any(s != "queued" for s in stages) else "accepted"})
        return True
