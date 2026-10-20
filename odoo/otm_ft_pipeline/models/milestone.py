from odoo import fields, models


class OtmFtMilestone(models.Model):
    _name = "otm.ft.milestone"
    _description = "FT Payment Milestone"
    _order = "sequence, id"

    lead_id = fields.Many2one("crm.lead", required=True, ondelete="cascade", index=True)
    sequence = fields.Integer(default=10)
    name = fields.Char(required=True)
    kind = fields.Selection(
        [("advance", "Advance"), ("progress", "Progress"), ("final", "Final (handover)"), ("retention", "Retention release"), ("other", "Other")],
        default="progress", required=True,
    )
    percent = fields.Float(required=True, help="Share of the contract value (excl. tax)")
    trigger_progress = fields.Integer(help="Progress milestones become billable at this site progress %")
    invoice_id = fields.Many2one("account.move", ondelete="set null")
    due_date = fields.Date()
    followup_date = fields.Date()
    followup_note = fields.Text()
