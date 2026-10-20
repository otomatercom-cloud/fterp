from odoo import fields, models

JOINERY_STAGES = [
    ("drawing", "Shop drawing"), ("approved", "Drawing approved"), ("cutting", "Cutting"),
    ("assembly", "Assembly"), ("finishing", "Finishing"), ("ready", "Ready"), ("installed", "Installed"),
]


class OtmFtJoinery(models.Model):
    _name = "otm.ft.joinery"
    _description = "FT Joinery Job"
    _order = "id desc"

    lead_id = fields.Many2one("crm.lead", required=True, ondelete="cascade", index=True)
    name = fields.Char(string="Item", required=True)
    qty = fields.Float(default=1.0, required=True)
    stage = fields.Selection(JOINERY_STAGES, default="drawing", required=True, index=True)
    due_date = fields.Date()
