from datetime import timedelta

from odoo import api, fields, models
from odoo.exceptions import UserError

from .crm_lead import MGR, PM, PROC


class OtmFtReceipt(models.Model):
    _name = "otm.ft.receipt"
    _description = "FT Goods Receipt"
    _order = "id desc"

    line_id = fields.Many2one("purchase.order.line", required=True, ondelete="cascade", index=True)
    qty = fields.Float(required=True)
    date = fields.Date(default=fields.Date.context_today)
    user_id = fields.Many2one("res.users", default=lambda self: self.env.user)
    note = fields.Char()


class PurchaseOrderLine(models.Model):
    _inherit = "purchase.order.line"

    otm_receipt_ids = fields.One2many("otm.ft.receipt", "line_id", string="Receipts")
    otm_received_qty = fields.Float(compute="_compute_otm_received", store=True)

    @api.depends("otm_receipt_ids.qty")
    def _compute_otm_received(self):
        for l in self:
            l.otm_received_qty = sum(l.otm_receipt_ids.mapped("qty"))


class PurchaseOrder(models.Model):
    _inherit = "purchase.order"

    otm_lead_id = fields.Many2one("crm.lead", string="FT Project", index=True, copy=False, ondelete="set null")
    otm_expected_date = fields.Date(string="Expected Delivery", copy=False)
    otm_receipt_state = fields.Selection(
        [("none", "Not received"), ("partial", "Partially received"), ("received", "Received")],
        compute="_compute_otm_receipt_state", store=True, default="none",
    )

    @api.depends("order_line.otm_received_qty", "order_line.product_qty", "order_line.display_type")
    def _compute_otm_receipt_state(self):
        for po in self:
            lines = po.order_line.filtered(lambda l: not l.display_type)
            ordered, got = sum(lines.mapped("product_qty")), sum(lines.mapped("otm_received_qty"))
            po.otm_receipt_state = "none" if got <= 0 else "received" if got >= ordered - 1e-6 else "partial"


class CrmLeadProcurement(models.Model):
    _inherit = "crm.lead"

    # ---- helpers ----
    def _otm_proc_role(self, *roles):
        if not any(r in self._otm_user_roles() for r in roles):
            raise UserError(self.env._("You are not allowed to do this."))

    @api.model
    def _otm_po_dict(self, po):
        today = fields.Date.context_today(self)
        lead = po.otm_lead_id
        lines = po.order_line.filtered(lambda l: not l.display_type)
        done = po.state in ("purchase", "done")
        exp = po.otm_expected_date
        return {
            "id": po.id, "name": po.name, "vendor": po.partner_id.name or "", "lead_id": lead.id or False, "lead": lead.name or "",
            "state": po.state, "receipt": po.otm_receipt_state, "untaxed": po.amount_untaxed, "total": po.amount_total,
            "expected": fields.Date.to_string(exp) if exp else False,
            "overdue": bool(done and exp and exp < today and po.otm_receipt_state != "received"),
            "lines": [{"id": l.id, "name": l.name, "qty": l.product_qty, "received": l.otm_received_qty, "price": l.price_unit} for l in lines],
            "receipts": [{"line": r.line_id.name, "qty": r.qty, "date": fields.Date.to_string(r.date), "user": r.user_id.name or "", "note": r.note or ""}
                         for r in lines.mapped("otm_receipt_ids").sorted("id", reverse=True)][:20],
        }

    @api.model
    def _otm_visible_pos(self):
        roles = self._otm_user_roles()
        if not any(r in roles for r in (PROC, MGR, PM)):
            raise UserError(self.env._("Procurement is available to Procurement, Managers and Project Managers."))
        leads = self.search([("otm_stage", "not in", ("lost", False))])  # crm.lead record rules apply to the real user
        return self.env["purchase.order"].sudo().search([("otm_lead_id", "in", leads.ids)], order="id desc", limit=300)

    # ---- purchase orders ----
    @api.model
    def otm_pos(self):
        roles = self._otm_user_roles()
        pos = self._otm_visible_pos()
        return {"can_manage": PROC in roles or MGR in roles, "can_receive": True, "orders": [self._otm_po_dict(p) for p in pos]}

    @api.model
    def _otm_po_for(self, po_id, *roles):
        self._otm_proc_role(*roles)
        po = self.env["purchase.order"].sudo().browse(int(po_id))
        if not po.exists() or not po.otm_lead_id:
            raise UserError(self.env._("Purchase order not found."))
        self.browse(po.otm_lead_id.id).check_access("read")
        return po

    @api.model
    def otm_po_confirm(self, po_id, expected=False):
        po = self._otm_po_for(po_id, PROC)
        if po.state not in ("draft", "sent"):
            raise UserError(self.env._("Only a draft purchase order can be confirmed."))
        po.write({"otm_expected_date": expected or po.otm_expected_date or fields.Date.context_today(self) + timedelta(days=14)})
        po.button_confirm()
        return True

    @api.model
    def otm_po_set_expected(self, po_id, expected):
        po = self._otm_po_for(po_id, PROC)
        if po.state in ("cancel", "done") or po.otm_receipt_state == "received":
            raise UserError(self.env._("This order can no longer be rescheduled."))
        po.write({"otm_expected_date": expected or False})
        return True

    @api.model
    def otm_po_cancel(self, po_id):
        po = self._otm_po_for(po_id, PROC)
        if po.state not in ("draft", "sent") or po.otm_receipt_state != "none":
            raise UserError(self.env._("Only an unconfirmed order without receipts can be cancelled."))
        po.button_cancel()
        return True

    @api.model
    def otm_po_receive(self, po_id, lines, note=""):
        po = self._otm_po_for(po_id, PROC, MGR, PM)
        lead = self.browse(po.otm_lead_id.id)
        roles = self._otm_user_roles()
        if PM in roles and PROC not in roles and MGR not in roles and lead.otm_project_manager_id != self.env.user and not self.env.user.has_group("base.group_system"):
            raise UserError(self.env._("Only the assigned Project Manager can record goods for this project."))
        if po.state not in ("purchase", "done"):
            raise UserError(self.env._("Confirm the purchase order before receiving goods."))
        if not isinstance(lines, list) or not lines:
            raise UserError(self.env._("Enter the quantity received."))
        Receipt = self.env["otm.ft.receipt"].sudo()
        by_id = {l.id: l for l in po.order_line}
        made = 0
        for row in lines:
            line = by_id.get(int(row.get("line_id") or 0))
            qty = float(row.get("qty") or 0)
            if not line or qty <= 0:
                continue
            if qty > line.product_qty - line.otm_received_qty + 1e-6:
                raise UserError(self.env._("Received quantity for '%s' exceeds what is still due.", line.name))
            Receipt.create({"line_id": line.id, "qty": qty, "note": str(note or "").strip()[:200]})
            made += 1
        if not made:
            raise UserError(self.env._("Enter a quantity above 0 for at least one line."))
        lead.sudo().message_post(body=self.env._("Goods received on %s.", po.name), author_id=self.env.user.partner_id.id)
        return True

    # ---- vendors ----
    @api.model
    def otm_vendors(self):
        self._otm_proc_role(PROC, MGR)
        Partner = self.env["res.partner"].sudo()
        pos = self.env["purchase.order"].sudo().search([("otm_lead_id", "!=", False), ("state", "!=", "cancel")])
        stat = {}
        for p in pos:
            s = stat.setdefault(p.partner_id.id, {"n": 0, "total": 0.0, "open": 0})
            s["n"] += 1
            s["total"] += p.amount_total
            s["open"] += 1 if p.otm_receipt_state != "received" else 0
        vendors = Partner.search(["|", ("supplier_rank", ">", 0), ("id", "in", list(stat))], limit=300)
        return [{"id": v.id, "name": v.name, "phone": v.phone or "", "email": v.email or "", "orders": stat.get(v.id, {}).get("n", 0),
                 "total": stat.get(v.id, {}).get("total", 0.0), "open": stat.get(v.id, {}).get("open", 0)} for v in vendors.sorted("name")]

    @api.model
    def otm_add_vendor(self, name, phone="", email=""):
        self._otm_proc_role(PROC, MGR)
        name = str(name or "").strip()[:120]
        if not name:
            raise UserError(self.env._("Enter the vendor name."))
        Partner = self.env["res.partner"].sudo()
        if Partner.search_count([("name", "=ilike", name), ("supplier_rank", ">", 0)]):
            raise UserError(self.env._("This vendor already exists."))
        Partner.create({"name": name, "company_type": "company", "phone": str(phone or "").strip()[:40], "email": str(email or "").strip()[:120], "supplier_rank": 1})
        return True
