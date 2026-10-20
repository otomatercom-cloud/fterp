from odoo import fields, models


class OtmFtTask(models.Model):
    _name = "otm.ft.task"
    _description = "FT Project Task / Snag"
    _order = "id desc"

    lead_id = fields.Many2one("crm.lead", required=True, ondelete="cascade", index=True)
    name = fields.Char(required=True)
    kind = fields.Selection([("task", "Task"), ("snag", "Snag")], default="task", required=True)
    status = fields.Selection([("todo", "To do"), ("doing", "In progress"), ("done", "Done")], default="todo", required=True)
    due_date = fields.Date()
    user_id = fields.Many2one("res.users", string="Created by", default=lambda self: self.env.user)
