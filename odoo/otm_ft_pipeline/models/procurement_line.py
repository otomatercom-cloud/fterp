from odoo import api, fields, models


class OtmFtProcurementLine(models.Model):
    _name = "otm.ft.procurement.line"
    _description = "FT Procurement Price Line"
    _order = "id"

    lead_id = fields.Many2one("crm.lead", required=True, ondelete="cascade", index=True)
    name = fields.Char(string="Item", required=True)
    vendor = fields.Char()
    qty = fields.Float(default=1.0, required=True)
    price = fields.Float(string="Unit Price", required=True)
    subtotal = fields.Float(compute="_compute_subtotal", store=True)

    @api.depends("qty", "price")
    def _compute_subtotal(self):
        for line in self:
            line.subtotal = line.qty * line.price
