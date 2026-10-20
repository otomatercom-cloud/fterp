from odoo import api, fields, models


class OtmFtCostingLine(models.Model):
    _name = "otm.ft.costing.line"
    _description = "FT Estimate Costing & Availability Line"
    _order = "id"

    lead_id = fields.Many2one("crm.lead", required=True, ondelete="cascade", index=True)
    name = fields.Char(string="Item", required=True)
    qty = fields.Float(default=1.0)
    est_price = fields.Float(string="Estimate Unit Price")
    availability = fields.Selection([("in_stock", "In stock"), ("order", "Needs ordering"), ("unavailable", "Not available")])
    lead_days = fields.Integer(string="Lead Time (days)")
    unit_cost = fields.Float(string="Unit Cost")
    vendor = fields.Char()
    note = fields.Char()
    cost = fields.Float(compute="_compute_cost", store=True)

    @api.depends("qty", "unit_cost")
    def _compute_cost(self):
        for line in self:
            line.cost = line.qty * line.unit_cost
