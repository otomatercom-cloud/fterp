from odoo import fields, models


class OtmFtStageLog(models.Model):
    _name = "otm.ft.stage.log"
    _description = "FT Pipeline Stage Log"
    _order = "id desc"

    lead_id = fields.Many2one("crm.lead", required=True, ondelete="cascade", index=True)
    action = fields.Char(required=True)
    from_stage = fields.Char()
    to_stage = fields.Char()
    user_id = fields.Many2one("res.users", required=True, default=lambda self: self.env.user)
    date = fields.Datetime(default=fields.Datetime.now, required=True)
