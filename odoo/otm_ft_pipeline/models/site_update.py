from odoo import fields, models


class OtmFtSiteUpdate(models.Model):
    _name = "otm.ft.site.update"
    _description = "FT Project Site Progress Update"
    _order = "id desc"

    lead_id = fields.Many2one("crm.lead", required=True, ondelete="cascade", index=True)
    date = fields.Datetime(default=fields.Datetime.now, required=True)
    percent = fields.Integer(string="Progress %", required=True)
    note = fields.Text(required=True)
    user_id = fields.Many2one("res.users", required=True, default=lambda self: self.env.user)
