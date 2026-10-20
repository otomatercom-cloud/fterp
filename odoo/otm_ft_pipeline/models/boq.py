import json

from odoo import api, fields, models
from odoo.exceptions import UserError

from .crm_lead import ACC, MGR, PROC, SM

CATEGORIES = [
    ("joinery", "Joinery"), ("ceiling", "False ceiling"), ("flooring", "Flooring"), ("wall", "Wall finishes"), ("kitchen", "Kitchen"),
    ("lighting", "Lighting"), ("mep", "Electrical & plumbing"), ("furniture", "Furniture"), ("other", "Other"),
]
EST_ACTIONS = {
    "submit_to_procurement": "Submitted to Procurement", "confirm_costing": "Costing confirmed", "return_to_sales": "Returned by Procurement",
    "approve": "Approved by Manager", "reject": "Rejected by Manager", "send_to_client": "Sent to client",
    "client_approve": "Approved by client", "client_requests_changes": "Client requested changes",
}


class OtmFtRate(models.Model):
    _name = "otm.ft.rate"
    _description = "FT Rate Library Item"
    _order = "category, name"

    code = fields.Char(required=True, index=True)
    name = fields.Char(required=True)
    category = fields.Selection(CATEGORIES, default="other", required=True)
    unit = fields.Char(default="nos", required=True)
    rate = fields.Float(required=True, help="Selling rate excl. tax")
    cost = fields.Float(help="Internal cost estimate (visible to Manager and Procurement only)")
    active = fields.Boolean(default=True)
    company_id = fields.Many2one("res.company", default=lambda self: self.env.company)

    _code_uniq = models.Constraint("unique(code, company_id)", "Rate code must be unique.")


class OtmFtEstimateRev(models.Model):
    _name = "otm.ft.estimate.rev"
    _description = "FT Estimate Revision"
    _order = "number desc, id desc"

    lead_id = fields.Many2one("crm.lead", required=True, ondelete="cascade", index=True)
    number = fields.Integer(required=True)
    reason = fields.Char()
    user_id = fields.Many2one("res.users", default=lambda self: self.env.user)
    untaxed = fields.Float()
    tax = fields.Float()
    lines_json = fields.Text()


class SaleOrderLine(models.Model):
    _inherit = "sale.order.line"

    otm_category = fields.Selection(CATEGORIES)
    otm_unit = fields.Char()


class CrmLeadBoq(models.Model):
    _inherit = "crm.lead"

    otm_rev_ids = fields.One2many("otm.ft.estimate.rev", "lead_id", string="Estimate Revisions", copy=False)

    # ---- rate library ----
    def _otm_can_see_cost(self):
        roles = self._otm_user_roles()
        return MGR in roles or PROC in roles

    @api.model
    def otm_rates(self):
        see_cost = self._otm_can_see_cost()
        rows = self.env["otm.ft.rate"].sudo().search([("company_id", "in", [False, self.env.company.id])], limit=1000)
        return {
            "can_manage": see_cost,
            "rates": [{"id": r.id, "code": r.code, "name": r.name, "category": r.category, "unit": r.unit, "rate": r.rate, "cost": r.cost if see_cost else 0.0} for r in rows],
        }

    @api.model
    def otm_save_rate(self, vals):
        if not self._otm_can_see_cost():
            raise UserError(self.env._("Only Manager or Procurement can edit the rate library."))
        code, name, unit = str(vals.get("code") or "").strip()[:30], str(vals.get("name") or "").strip()[:200], str(vals.get("unit") or "").strip()[:12]
        rate, cost = float(vals.get("rate") or 0), float(vals.get("cost") or 0)
        if not code or not name or not unit or rate < 0 or cost < 0 or vals.get("category") not in dict(CATEGORIES):
            raise UserError(self.env._("Enter code, name, unit, category and non-negative rates."))
        Rate = self.env["otm.ft.rate"].sudo()
        data = {"code": code, "name": name, "unit": unit, "category": vals["category"], "rate": rate, "cost": cost}
        rid = int(vals.get("id") or 0)
        dup = Rate.search([("code", "=", code), ("id", "!=", rid), ("company_id", "=", self.env.company.id)], limit=1)
        if dup:
            raise UserError(self.env._("Code %s is already used.", code))
        if rid:
            rec = Rate.browse(rid)
            if not rec.exists():
                raise UserError(self.env._("Rate not found."))
            rec.write(data)
        else:
            Rate.create({**data, "company_id": self.env.company.id})
        return True

    @api.model
    def otm_archive_rate(self, rate_id):
        if not self._otm_can_see_cost():
            raise UserError(self.env._("Only Manager or Procurement can edit the rate library."))
        self.env["otm.ft.rate"].sudo().browse(int(rate_id)).write({"active": False})
        return True

    # ---- estimate revisions ----
    def _otm_est_lines(self):
        self.ensure_one()
        order = self.sudo().order_ids.sorted("id")[-1:]
        return [{"name": l.name, "qty": l.product_uom_qty, "price": l.price_unit, "category": l.otm_category or "other", "unit": l.otm_unit or ""} for l in order.order_line if not l.display_type]

    def _otm_snapshot_estimate(self, action, lines=None, force_reason=None):
        """Keep a revision when the estimate content changed since the last one."""
        self.ensure_one()
        lines = lines if lines is not None else self._otm_est_lines()
        if not lines:
            return False
        payload = json.dumps(lines, sort_keys=True)
        last = self.sudo().otm_rev_ids[:1]
        if last and last.lines_json == payload:
            return False
        order = self.sudo().order_ids.sorted("id")[-1:]
        untaxed = sum(l["qty"] * l["price"] for l in lines)
        rate = (order.amount_tax / order.amount_untaxed) if order and order.amount_untaxed else 0.0
        self.env["otm.ft.estimate.rev"].sudo().create({
            "lead_id": self.id, "number": (last.number if last else 0) + 1, "reason": force_reason or EST_ACTIONS.get(action, action),
            "untaxed": untaxed, "tax": untaxed * rate, "lines_json": payload,
        })
        return True

    def otm_estimate_revisions(self):
        self.ensure_one()
        revs = self.sudo().otm_rev_ids
        out = []
        for r in revs:
            out.append({
                "id": r.id, "number": r.number, "reason": r.reason or "", "user": r.user_id.name or "", "date": fields.Datetime.to_string(r.create_date),
                "untaxed": r.untaxed, "total": r.untaxed + r.tax, "lines": json.loads(r.lines_json or "[]"),
            })
        return out

    def otm_restore_revision(self, rev_id):
        self.ensure_one()
        if SM not in self._otm_user_roles():
            raise UserError(self.env._("Only a Sales Manager can restore an estimate revision."))
        rev = self.sudo().otm_rev_ids.filtered(lambda r: r.id == int(rev_id))
        if not rev:
            raise UserError(self.env._("Revision not found."))
        self.otm_save_estimate(json.loads(rev.lines_json))
        return True

    # ---- overview for the BOQ page ----
    @api.model
    def otm_boq_overview(self):
        leads = self.search([("otm_stage", "in", ("estimate_draft", "procurement_check", "estimate_manager_review", "estimate_approved", "sent_to_client"))])
        out = []
        for lead in leads.sudo():
            lines = lead._otm_est_lines()
            by_cat = {}
            for l in lines:
                by_cat[l["category"]] = by_cat.get(l["category"], 0.0) + l["qty"] * l["price"]
            out.append({"id": lead.id, "name": lead.name, "customer": lead.partner_name or lead.partner_id.name or "", "stage": lead.otm_stage,
                        "untaxed": sum(by_cat.values()), "lines": len(lines), "revisions": len(lead.otm_rev_ids), "categories": by_cat})
        return out
