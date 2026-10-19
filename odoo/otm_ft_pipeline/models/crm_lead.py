from odoo import api, fields, models
from odoo.exceptions import UserError

STAGES = [
    ("new", "New"),
    ("assigned", "Assigned"),
    ("estimate_draft", "Estimate Draft"),
    ("estimate_manager_review", "Estimate - Manager Review"),
    ("estimate_approved", "Estimate Approved"),
    ("sent_to_client", "Sent to Client"),
    ("client_approved", "Client Approved"),
    ("pm_assigned", "Project Manager Assigned"),
    ("procurement", "Procurement"),
    ("procurement_approved", "Procurement Approved"),
    ("invoice_draft", "Invoice Draft"),
    ("invoice_with_sales", "Invoice with Sales"),
    ("awaiting_advance", "Awaiting Advance"),
    ("payment_verification", "Payment Verification"),
    ("work_started", "Work Started"),
    ("lost", "Lost"),
]

SM, MGR, PM, PROC, ACC = "sales_manager", "manager", "project_manager", "procurement", "accounts"
ROLE_GROUPS = {
    SM: "otm_ft_pipeline.group_ft_sales_manager",
    MGR: "otm_ft_pipeline.group_ft_manager",
    PM: "otm_ft_pipeline.group_ft_project_manager",
    PROC: "otm_ft_pipeline.group_ft_procurement",
    ACC: "otm_ft_pipeline.group_ft_accounts",
}

# (from_stage, action) -> (to_stage, allowed roles). Mirrors src/lib/workflow/interior.ts in the Next.js app.
TRANSITIONS = {
    ("new", "assign"): ("assigned", [MGR]),
    ("assigned", "create_estimate"): ("estimate_draft", [SM]),
    ("estimate_draft", "submit_to_manager"): ("estimate_manager_review", [SM]),
    ("estimate_manager_review", "approve"): ("estimate_approved", [MGR]),
    ("estimate_manager_review", "reject"): ("estimate_draft", [MGR]),
    ("estimate_approved", "send_to_client"): ("sent_to_client", [SM]),
    ("sent_to_client", "client_approve"): ("client_approved", [SM]),
    ("sent_to_client", "client_requests_changes"): ("estimate_draft", [SM]),
    ("sent_to_client", "mark_lost"): ("lost", [SM, MGR]),
    ("client_approved", "assign_project_manager"): ("pm_assigned", [MGR]),
    ("pm_assigned", "send_to_procurement"): ("procurement", [PM]),
    ("procurement", "approve_prices"): ("procurement_approved", [PROC]),
    ("procurement_approved", "start_invoice"): ("invoice_draft", [ACC]),
    ("invoice_draft", "send_to_sales"): ("invoice_with_sales", [ACC]),
    ("invoice_with_sales", "send_to_client"): ("awaiting_advance", [SM]),
    ("awaiting_advance", "record_payment"): ("payment_verification", [SM, ACC]),
    ("payment_verification", "verify_payment"): ("work_started", [ACC]),
}

RR_PARAM = "otm_ft_pipeline.rr_last_user_id"


class CrmLead(models.Model):
    _inherit = "crm.lead"

    otm_origin = fields.Selection(
        [("meta", "Meta"), ("walkin", "Walk-in"), ("other", "Other")],
        string="FT Source", default="other", tracking=True,
    )
    otm_stage = fields.Selection(STAGES, string="FT Stage", default="new", tracking=True, copy=False, index=True)
    otm_project_manager_id = fields.Many2one("res.users", string="Project Manager", tracking=True, copy=False)
    otm_estimate_amount = fields.Monetary(string="Approved Estimate", currency_field="company_currency", copy=False)
    otm_procurement_amount = fields.Monetary(string="Procurement Total", currency_field="company_currency", tracking=True, copy=False)
    otm_advance_amount = fields.Monetary(string="Advance Received", currency_field="company_currency", tracking=True, copy=False)
    otm_invoice_id = fields.Many2one("account.move", string="Advance Invoice", copy=False, readonly=True)
    otm_log_ids = fields.One2many("otm.ft.stage.log", "lead_id", string="Stage History")

    # ---- assignment -------------------------------------------------
    @api.model
    def _otm_next_sales_manager(self):
        group = self.env.ref("otm_ft_pipeline.group_ft_sales_manager")
        users = self.env["res.users"].sudo().search([("group_ids", "in", group.id), ("active", "=", True)], order="id")
        if not users:
            return self.env["res.users"]
        # serialise concurrent creates so two Meta leads never get the same person
        self.env.cr.execute("SELECT pg_advisory_xact_lock(%s)", [7340112])
        icp = self.env["ir.config_parameter"].sudo()
        last = int(icp.get_param(RR_PARAM, 0))
        chosen = users.filtered(lambda u: u.id > last)[:1] or users[:1]
        icp.set_param(RR_PARAM, chosen.id)
        return chosen

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            origin = vals.get("otm_origin", "other")
            if origin == "meta" and not vals.get("user_id"):
                user = self._otm_next_sales_manager()
                if user:
                    vals.update(user_id=user.id, otm_stage="assigned")
            elif origin == "walkin" and not vals.get("user_id"):
                vals.update(user_id=self.env.user.id, otm_stage="assigned")
            elif vals.get("user_id"):
                vals.setdefault("otm_stage", "assigned")
        return super().create(vals_list)

    # ---- workflow ---------------------------------------------------
    def _otm_user_roles(self):
        user = self.env.user
        if user.has_group("base.group_system"):
            return list(ROLE_GROUPS)
        return [role for role, xmlid in ROLE_GROUPS.items() if user.has_group(xmlid)]

    def _otm_guard(self, action):
        self.ensure_one()
        if action == "assign" and not self.user_id:
            raise UserError(self.env._("Select the Salesperson (Sales Manager) before assigning."))
        if action == "submit_to_manager" and not self.order_ids:
            raise UserError(self.env._("Create at least one quotation (estimate) before submitting."))
        if action == "assign_project_manager" and not self.otm_project_manager_id:
            raise UserError(self.env._("Select a Project Manager first."))
        if action == "send_to_procurement" and not (
            self.env.user.has_group("base.group_system") or self.otm_project_manager_id == self.env.user
        ):
            raise UserError(self.env._("Only the assigned Project Manager can send this to Procurement."))
        if action == "approve_prices":
            if self.otm_procurement_amount <= 0:
                raise UserError(self.env._("Enter the procurement total first."))
            over = self.otm_procurement_amount > self.otm_estimate_amount
            if over and MGR not in self._otm_user_roles():
                raise UserError(self.env._("Procurement total exceeds the approved estimate. Manager approval is required."))
        if action == "send_to_sales" and not (self.otm_invoice_id and self.otm_invoice_id.state == "posted"):
            raise UserError(self.env._("Create and post the advance invoice first."))
        if action == "verify_payment":
            inv = self.otm_invoice_id
            if not inv or inv.payment_state not in ("paid", "in_payment"):
                raise UserError(self.env._("The invoice has no registered payment in Accounting yet."))
            if abs(inv.amount_total - self.otm_advance_amount) > 0.01:
                raise UserError(self.env._("Advance recorded (%(a)s) differs from the invoice (%(b)s).", a=self.otm_advance_amount, b=inv.amount_total))
        if action == "record_payment" and self.otm_advance_amount <= 0:
            raise UserError(self.env._("Enter the advance amount received."))

    def action_otm_transition(self):
        """Single entry point; buttons pass context {'otm_action': <name>}."""
        action = self.env.context.get("otm_action")
        for lead in self:
            rule = TRANSITIONS.get((lead.otm_stage, action))
            if not rule:
                raise UserError(self.env._("Action not available at stage %s.", lead.otm_stage))
            to_stage, roles = rule
            if not set(roles) & set(lead._otm_user_roles()):
                raise UserError(self.env._("You are not allowed to perform this step."))
            lead._otm_guard(action)
            vals = {"otm_stage": to_stage}
            if action == "submit_to_manager":
                latest = lead.order_ids.sorted("id")[-1:]
                vals["otm_estimate_amount"] = latest.amount_total
            from_stage = lead.otm_stage
            lead.sudo().write(vals)  # role verified above with the real user
            self.env["otm.ft.stage.log"].sudo().create(
                {"lead_id": lead.id, "action": action, "from_stage": from_stage, "to_stage": to_stage, "user_id": self.env.user.id}
            )
        return True

    # ---- UI helpers (called by the Next.js app; every one re-checks role + stage) ----
    @api.model
    def otm_role_users(self, role):
        xmlid = {"sales_manager": ROLE_GROUPS[SM], "project_manager": ROLE_GROUPS[PM]}.get(role)
        if not xmlid:
            raise UserError(self.env._("Unknown role."))
        group = self.env.ref(xmlid)
        users = self.env["res.users"].sudo().search([("group_ids", "in", group.id), ("active", "=", True)], order="name")
        return [{"id": u.id, "name": u.name} for u in users]

    FIELD_RULES = {
        "user_id": ([MGR], ("new", "assigned"), ROLE_GROUPS[SM]),
        "otm_project_manager_id": ([MGR], ("client_approved", "pm_assigned"), ROLE_GROUPS[PM]),
        "otm_procurement_amount": ([PROC, MGR], ("procurement",), None),
        "otm_advance_amount": ([SM, ACC], ("awaiting_advance",), None),
    }

    def otm_set_field(self, field, value):
        self.ensure_one()
        rule = self.FIELD_RULES.get(field)
        if not rule:
            raise UserError(self.env._("This field cannot be changed here."))
        roles, stages, member_group = rule
        if not set(roles) & set(self._otm_user_roles()):
            raise UserError(self.env._("You are not allowed to change this."))
        if self.otm_stage not in stages:
            raise UserError(self.env._("This cannot be changed at stage %s.", self.otm_stage))
        if member_group:
            uid = int(value)
            user = self.env["res.users"].sudo().browse(uid)
            if not user.exists() or not user.has_group(member_group):
                raise UserError(self.env._("Selected user does not have the required role."))
            value = uid
        else:
            value = float(value)
            if value < 0:
                raise UserError(self.env._("Amount cannot be negative."))
        self.sudo().write({field: value})
        return True

    def otm_estimate_data(self):
        self.ensure_one()
        order = self.sudo().order_ids.sorted("id")[-1:]
        return {
            "order": order.name or False,
            "total": order.amount_total if order else 0.0,
            "lines": [
                {"name": l.name, "qty": l.product_uom_qty, "price": l.price_unit, "subtotal": l.price_subtotal}
                for l in order.order_line if not l.display_type
            ],
        }

    def otm_save_estimate(self, lines):
        self.ensure_one()
        if SM not in self._otm_user_roles():
            raise UserError(self.env._("Only a Sales Manager can edit the estimate."))
        if self.otm_stage != "estimate_draft":
            raise UserError(self.env._("Click 'Create estimate' first; the estimate is editable only as a draft."))
        if not lines or len(lines) > 200:
            raise UserError(self.env._("Add between 1 and 200 estimate lines."))
        cmds = []
        for l in lines:
            name, qty, price = str(l.get("name", "")).strip()[:200], float(l.get("qty", 0)), float(l.get("price", 0))
            if not name or qty <= 0 or price < 0:
                raise UserError(self.env._("Each line needs a description, a quantity above 0 and a price of 0 or more."))
            cmds.append((0, 0, {"name": name, "product_uom_qty": qty, "price_unit": price}))
        if not self.partner_id:
            self.partner_id = self.env["res.partner"].create({
                "name": self.partner_name or self.name, "phone": self.phone, "email": self.email_from,
            })
        order = self.order_ids.filtered(lambda o: o.state == "draft")[:1]
        if order:
            order.order_line.unlink()
            order.write({"order_line": cmds})
        else:
            order = self.env["sale.order"].create({"partner_id": self.partner_id.id, "opportunity_id": self.id, "order_line": cmds})
        return order.amount_total

    # ---- accounting (runs as the real user, so Odoo accounting ACLs apply) ----
    def _otm_require(self, role, stages):
        self.ensure_one()
        if role not in self._otm_user_roles():
            raise UserError(self.env._("You are not allowed to do this."))
        if self.otm_stage not in stages:
            raise UserError(self.env._("Not available at stage %s.", self.otm_stage))

    def otm_create_advance_invoice(self, amount):
        self._otm_require(ACC, ("invoice_draft",))
        if self.otm_invoice_id:
            raise UserError(self.env._("An invoice already exists for this lead."))
        amount = float(amount)
        if amount <= 0:
            raise UserError(self.env._("Invoice amount must be above 0."))
        if not self.partner_id:
            self.sudo().partner_id = self.env["res.partner"].sudo().create({
                "name": self.partner_name or self.name, "phone": self.phone, "email": self.email_from,
            })
        move = self.env["account.move"].create({
            "move_type": "out_invoice",
            "partner_id": self.partner_id.id,
            "invoice_origin": self.name,
            "invoice_line_ids": [(0, 0, {"name": self.env._("Advance payment - %s", self.name), "quantity": 1, "price_unit": amount})],
        })
        self.sudo().write({"otm_invoice_id": move.id})
        return move.id

    def otm_post_invoice(self):
        self._otm_require(ACC, ("invoice_draft",))
        inv = self.otm_invoice_id
        if not inv or inv.state != "draft":
            raise UserError(self.env._("There is no draft invoice to post."))
        inv.action_post()
        return True

    def otm_register_payment(self, journal_id):
        self._otm_require(ACC, ("payment_verification",))
        inv = self.otm_invoice_id
        if not inv or inv.state != "posted":
            raise UserError(self.env._("The invoice is not posted."))
        if inv.payment_state in ("paid", "in_payment"):
            raise UserError(self.env._("The invoice is already paid."))
        wiz = self.env["account.payment.register"].with_context(
            active_model="account.move", active_ids=inv.ids
        ).create({"journal_id": int(journal_id)})
        wiz.action_create_payments()
        return True

    def otm_invoice_data(self):
        self.ensure_one()
        inv = self.sudo().otm_invoice_id
        if not inv:
            return False
        return {"id": inv.id, "name": inv.name or "Draft", "state": inv.state, "total": inv.amount_total,
                "residual": inv.amount_residual, "payment_state": inv.payment_state}

    @api.model
    def otm_journals(self):
        js = self.env["account.journal"].search([("type", "in", ("bank", "cash"))])
        return [{"id": j.id, "name": j.name} for j in js]
