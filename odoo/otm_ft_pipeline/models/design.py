from odoo import fields, models


class OtmFtDesign(models.Model):
    _name = "otm.ft.design"
    _description = "FT Design Item / Shop Drawing"
    _order = "id desc"

    lead_id = fields.Many2one("crm.lead", required=True, ondelete="cascade", index=True)
    name = fields.Char(required=True)
    kind = fields.Selection(
        [("concept", "Concept"), ("moodboard", "Mood board"), ("material_board", "Material board"), ("layout", "Layout / plan"),
         ("render_3d", "3D render"), ("shop_drawing", "Shop drawing")], default="concept", required=True,
    )
    status = fields.Selection(
        [("draft", "Draft"), ("in_review", "In review"), ("changes_requested", "Changes requested"), ("approved", "Approved")],
        default="draft", required=True, index=True,
    )
    revision = fields.Integer(default=1)
    designer_id = fields.Many2one("res.users", default=lambda self: self.env.user)
    due_date = fields.Date()
    note = fields.Text()
    review_note = fields.Text()
    approved_by_id = fields.Many2one("res.users")
    approved_on = fields.Datetime()
