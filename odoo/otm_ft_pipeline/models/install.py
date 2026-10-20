from odoo import fields, models


class OtmFtInstall(models.Model):
    _name = "otm.ft.install"
    _description = "FT Site Visit / Installation"
    _order = "planned_date desc, id desc"

    lead_id = fields.Many2one("crm.lead", required=True, ondelete="cascade", index=True)
    name = fields.Char(required=True)
    kind = fields.Selection([("site_visit", "Site visit"), ("installation", "Installation")], default="installation", required=True)
    planned_date = fields.Date()
    team = fields.Char(help="Installation crew / visitors, free text")
    status = fields.Selection([("planned", "Planned"), ("in_progress", "In progress"), ("done", "Done")], default="planned", required=True)
