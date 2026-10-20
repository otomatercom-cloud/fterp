from datetime import timedelta

from odoo import api, fields, models
from odoo.exceptions import UserError

STAGES = [
    ("new", "New"),
    ("assigned", "Assigned"),
    ("estimate_draft", "Estimate Draft"),
    ("procurement_check", "Procurement - Availability & Costing"),
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
    ("handover", "Handover"),
    ("completed", "Completed"),
    ("lost", "Lost"),
]

SM, MGR, PM, PROC, ACC = "sales_manager", "manager", "project_manager", "procurement", "accounts"
ROLE_GROUPS = {
    SM: "otm_ft_pipeline.group_ft_sales_manager",
    MGR: "otm_ft_pipeline.group_ft_manager",
    PM: "otm_ft_pipeline.group_ft_project_manager",
    PROC: "otm_ft_pipeline.group_ft_procurement",
    ACC: "otm_ft_pipeline.group_ft_accounts",
    "manufacturing": "otm_ft_pipeline.group_ft_manufacturing",
}

# (from_stage, action) -> (to_stage, allowed roles). Mirrors src/lib/workflow/interior.ts in the Next.js app.
TRANSITIONS = {
    ("new", "assign"): ("assigned", [MGR]),
    ("assigned", "create_estimate"): ("estimate_draft", [SM]),
    ("estimate_draft", "submit_to_procurement"): ("procurement_check", [SM]),
    ("procurement_check", "confirm_costing"): ("estimate_manager_review", [PROC]),
    ("procurement_check", "return_to_sales"): ("estimate_draft", [PROC]),
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
    ("work_started", "complete_work"): ("handover", [PM]),
    ("handover", "confirm_handover"): ("completed", [SM, MGR]),
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
    otm_procurement_line_ids = fields.One2many("otm.ft.procurement.line", "lead_id", string="Procurement Prices", copy=False)
    otm_procurement_amount = fields.Monetary(
        string="Procurement Total", currency_field="company_currency", compute="_compute_otm_procurement_amount", store=True, copy=False,
    )
    otm_advance_amount = fields.Monetary(string="Advance Received", currency_field="company_currency", tracking=True, copy=False)
    otm_invoice_id = fields.Many2one("account.move", string="Advance Invoice", copy=False, readonly=True)
    otm_costing_line_ids = fields.One2many("otm.ft.costing.line", "lead_id", string="Costing Lines", copy=False)
    otm_costing_amount = fields.Monetary(string="Confirmed Cost", currency_field="company_currency", compute="_compute_otm_costing", store=True, copy=False)
    otm_log_ids = fields.One2many("otm.ft.stage.log", "lead_id", string="Stage History")
    otm_task_ids = fields.One2many("otm.ft.task", "lead_id", string="Tasks & Snags", copy=False)
    otm_joinery_ids = fields.One2many("otm.ft.joinery", "lead_id", string="Joinery Jobs", copy=False)
    otm_install_ids = fields.One2many("otm.ft.install", "lead_id", string="Site Visits & Installations", copy=False)
    otm_design_ids = fields.One2many("otm.ft.design", "lead_id", string="Design Items", copy=False)
    otm_site_update_ids = fields.One2many("otm.ft.site.update", "lead_id", string="Site Updates", copy=False)
    otm_progress = fields.Integer(string="Site Progress %", compute="_compute_otm_progress", store=True, copy=False)

    @api.depends("otm_site_update_ids.percent")
    def _compute_otm_progress(self):
        for lead in self:
            lead.otm_progress = max(lead.otm_site_update_ids.mapped("percent"), default=0)

    @api.depends("otm_costing_line_ids.cost")
    def _compute_otm_costing(self):
        for lead in self:
            lead.otm_costing_amount = sum(lead.otm_costing_line_ids.mapped("cost"))

    @api.depends("otm_procurement_line_ids.subtotal")
    def _compute_otm_procurement_amount(self):
        for lead in self:
            lead.otm_procurement_amount = sum(lead.otm_procurement_line_ids.mapped("subtotal"))

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

    # ---- tax: always the selling company's own sales tax (e.g. UAE VAT 5%), never hard-coded ----
    def _otm_sale_tax(self):
        company = self.company_id or self.env.company
        tax = company.account_sale_tax_id
        if not tax:
            tax = self.env["account.tax"].sudo().search(
                [("type_tax_use", "=", "sale"), ("company_id", "=", company.id), ("amount_type", "=", "percent")], limit=1, order="sequence, id"
            )
        return tax

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
        if action == "submit_to_procurement" and not self.order_ids:
            raise UserError(self.env._("Create at least one quotation (estimate) before submitting."))
        if action == "confirm_costing":
            lines = self.sudo().otm_costing_line_ids
            if not lines:
                raise UserError(self.env._("There are no estimate lines to cost."))
            for l in lines:
                if not l.availability or l.unit_cost <= 0:
                    raise UserError(self.env._("Set availability and a unit cost for: %s", l.name))
                if l.availability == "unavailable":
                    raise UserError(self.env._("'%s' is not available. Return the estimate to Sales to change it.", l.name))
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
        if action == "confirm_handover":
            open_snags = self.sudo().otm_task_ids.filtered(lambda t: t.kind == "snag" and t.status != "done")
            if open_snags:
                raise UserError(self.env._("Close all snags raised by the client first (%s open).", len(open_snags)))
        if action == "complete_work":
            open_snags = self.sudo().otm_task_ids.filtered(lambda t: t.kind == "snag" and t.status != "done")
            if open_snags:
                raise UserError(self.env._("Close all snags before handover (%s open).", len(open_snags)))
            unfinished = self.sudo().otm_joinery_ids.filtered(lambda j: j.stage != "installed")
            if unfinished:
                raise UserError(self.env._("All joinery items must be installed before handover (%s pending).", len(unfinished)))
            if self.otm_progress < 100:
                raise UserError(self.env._("Site progress must reach 100%% before handover (now %s%%).", self.otm_progress))
            if not (self.env.user.has_group("base.group_system") or self.otm_project_manager_id == self.env.user):
                raise UserError(self.env._("Only the assigned Project Manager can complete the work."))
        if action == "record_payment" and self.otm_advance_amount <= 0:
            raise UserError(self.env._("Enter the advance amount received."))

    def _otm_snapshot_if_estimate(self, action):
        if action in ("submit_to_procurement", "confirm_costing", "return_to_sales", "approve", "reject", "send_to_client", "client_approve", "client_requests_changes"):
            self._otm_snapshot_estimate(action)

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
            lead._otm_snapshot_if_estimate(action)
            vals = {"otm_stage": to_stage}
            if action == "submit_to_procurement":
                latest = lead.order_ids.sorted("id")[-1:]
                vals["otm_estimate_amount"] = latest.amount_untaxed  # pre-tax: comparable with procurement costs
            from_stage = lead.otm_stage
            lead.sudo().write(vals)  # role verified above with the real user
            if action == "submit_to_procurement":
                lead._otm_sync_costing_lines()
            if action == "send_to_procurement" and not lead.sudo().otm_procurement_line_ids:
                lead._otm_costing_to_procurement()
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
        tax = self._otm_sale_tax()
        return {
            "order": order.name or False,
            "total": order.amount_total if order else 0.0,
            "untaxed": order.amount_untaxed if order else 0.0,
            "tax": order.amount_tax if order else 0.0,
            "tax_name": tax.name if tax else False,
            "tax_rate": tax.amount if tax and tax.amount_type == "percent" else 0.0,
            "lines": [
                {"name": l.name, "qty": l.product_uom_qty, "price": l.price_unit, "subtotal": l.price_subtotal, "category": l.otm_category or "other", "unit": l.otm_unit or ""}
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
        tax = self._otm_sale_tax()
        cmds = []
        for l in lines:
            name, qty, price = str(l.get("name", "")).strip()[:200], float(l.get("qty", 0)), float(l.get("price", 0))
            if not name or qty <= 0 or price < 0:
                raise UserError(self.env._("Each line needs a description, a quantity above 0 and a price of 0 or more."))
            cat = l.get("category") if l.get("category") in ("joinery", "ceiling", "flooring", "wall", "kitchen", "lighting", "mep", "furniture", "other") else "other"
            cmds.append((0, 0, {"name": name, "product_uom_qty": qty, "price_unit": price, "tax_ids": [(6, 0, tax.ids)], "otm_category": cat, "otm_unit": str(l.get("unit") or "")[:12]}))
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
        return order.amount_untaxed

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
            "invoice_line_ids": [(0, 0, {
                "name": self.env._("Advance payment - %s", self.name), "quantity": 1, "price_unit": amount,
                "tax_ids": [(6, 0, self._otm_sale_tax().ids)],
            })],
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
                "untaxed": inv.amount_untaxed, "tax": inv.amount_tax,
                "residual": inv.amount_residual, "payment_state": inv.payment_state}

    @api.model
    def otm_journals(self):
        js = self.env["account.journal"].search([("type", "in", ("bank", "cash"))])
        return [{"id": j.id, "name": j.name} for j in js]

    def otm_procurement_data(self):
        self.ensure_one()
        lines = self.sudo().otm_procurement_line_ids
        return {
            "total": sum(lines.mapped("subtotal")),
            "lines": [{"name": l.name, "vendor": l.vendor or "", "qty": l.qty, "price": l.price} for l in lines],
        }

    def otm_save_procurement(self, lines):
        self._otm_require(PROC, ("procurement",))
        if not lines or len(lines) > 200:
            raise UserError(self.env._("Add between 1 and 200 price lines."))
        vals = []
        for l in lines:
            name, qty, price = str(l.get("name", "")).strip()[:200], float(l.get("qty", 0)), float(l.get("price", 0))
            if not name or qty <= 0 or price < 0:
                raise UserError(self.env._("Each line needs an item, a quantity above 0 and a price of 0 or more."))
            vals.append((0, 0, {"name": name, "vendor": str(l.get("vendor", "")).strip()[:120], "qty": qty, "price": price}))
        if self.otm_procurement_line_ids.filtered("purchase_id"):
            raise UserError(self.env._("Purchase orders are already created from these prices. Cancel or delete them in Purchase before changing prices."))
        self.otm_procurement_line_ids.unlink()
        self.write({"otm_procurement_line_ids": vals})
        return self.otm_procurement_amount

    # ---- project execution (after work starts) ----
    def otm_site_updates(self):
        self.ensure_one()
        return [
            {"id": u.id, "date": fields.Datetime.to_string(u.date), "percent": u.percent, "note": u.note, "user": u.user_id.name}
            for u in self.sudo().otm_site_update_ids.sorted("id", reverse=True)[:100]
        ]

    def otm_add_site_update(self, percent, note):
        self.ensure_one()
        roles = self._otm_user_roles()
        is_pm = self.otm_project_manager_id == self.env.user
        if not (self.env.user.has_group("base.group_system") or MGR in roles or (PM in roles and is_pm)):
            raise UserError(self.env._("Only the assigned Project Manager can add site updates."))
        if self.otm_stage != "work_started":
            raise UserError(self.env._("Site updates are available after work has started."))
        percent = int(percent)
        note = str(note or "").strip()[:500]
        if not 0 <= percent <= 100:
            raise UserError(self.env._("Progress must be between 0 and 100."))
        if percent < self.otm_progress:
            raise UserError(self.env._("Progress cannot go below the last update (%s%%).", self.otm_progress))
        if not note:
            raise UserError(self.env._("Add a short note about the work done."))
        self.env["otm.ft.site.update"].sudo().create({"lead_id": self.id, "percent": percent, "note": note, "user_id": self.env.user.id})
        return self.sudo().otm_progress

    # ---- purchase orders from the collected prices (one draft PO per vendor) ----
    def otm_po_data(self):
        self.ensure_one()
        lines = self.sudo().otm_procurement_line_ids
        orders = lines.mapped("purchase_id")
        return {
            "pending": len(lines.filtered(lambda l: not l.purchase_id)),
            "orders": [
                {"id": o.id, "name": o.name, "vendor": o.partner_id.name, "state": o.state, "total": o.amount_total}
                for o in orders
            ],
        }

    def otm_create_purchase_orders(self):
        self._otm_require(PROC, ("procurement",))
        return self._otm_make_pos()

    def _otm_make_pos(self):
        """Create purchase orders from the priced lines. Callers must have checked role and stage."""
        env = self.sudo().env
        lines = self.sudo().otm_procurement_line_ids.filtered(lambda l: not l.purchase_id)
        if not lines:
            raise UserError(self.env._("Save price lines first (or all lines already have purchase orders)."))
        if any(not (l.vendor or "").strip() for l in lines):
            raise UserError(self.env._("Enter a vendor on every line before creating purchase orders."))
        Line = env["purchase.order.line"]
        uom = env.ref("uom.product_uom_unit", raise_if_not_found=False)
        uom_field = "product_uom_id" if "product_uom_id" in Line._fields else "product_uom"
        tax_field = "tax_ids" if "tax_ids" in Line._fields else "taxes_id"
        company = self.company_id or self.env.company
        tax = company.account_purchase_tax_id
        by_vendor = {}
        for l in lines:
            key = l.vendor.strip()
            by_vendor[key] = by_vendor.get(key, lines.browse()) | l
        for vendor, vlines in by_vendor.items():
            partner = env["res.partner"].search([("name", "=ilike", vendor)], limit=1) or env["res.partner"].create({"name": vendor, "company_type": "company"})
            order = env["purchase.order"].create({
                "partner_id": partner.id, "origin": self.name, "company_id": company.id, "otm_lead_id": self.id,
                "otm_expected_date": fields.Date.context_today(self) + timedelta(days=14),
                "order_line": [(0, 0, {
                    "name": l.name, "product_qty": l.qty, "price_unit": l.price,
                    **({uom_field: uom.id} if uom else {}),
                    **({tax_field: [(6, 0, tax.ids)]} if tax else {}),
                }) for l in vlines],
            })
            vlines.write({"purchase_id": order.id})
        return len(by_vendor)

    # ---- role management for administrators (used by the Settings screen) ----
    @api.model
    def otm_users_roles(self):
        if not self.env.user.has_group("base.group_system"):
            raise UserError(self.env._("Only an administrator can manage roles."))
        users = self.env["res.users"].sudo().search([("share", "=", False), ("active", "=", True)], order="name")
        groups = {role: self.env.ref(xmlid) for role, xmlid in ROLE_GROUPS.items()}
        return [
            {"id": u.id, "name": u.name, "login": u.login, "roles": [r for r, g in groups.items() if g.id in u.group_ids.ids]}
            for u in users
        ]

    @api.model
    def otm_set_user_role(self, user_id, role, enabled):
        if not self.env.user.has_group("base.group_system"):
            raise UserError(self.env._("Only an administrator can manage roles."))
        xmlid = ROLE_GROUPS.get(role)
        if not xmlid:
            raise UserError(self.env._("Unknown role."))
        user = self.env["res.users"].sudo().browse(int(user_id))
        if not user.exists() or user.share:
            raise UserError(self.env._("Select an internal user."))
        user.write({"group_ids": [(4 if enabled else 3, self.env.ref(xmlid).id)]})
        return True

    # ---- project tasks & snag list ----
    def _otm_can_manage_project(self):
        self.ensure_one()
        roles = self._otm_user_roles()
        return self.env.user.has_group("base.group_system") or MGR in roles or (PM in roles and self.otm_project_manager_id == self.env.user)

    def otm_tasks(self):
        self.ensure_one()
        return [
            {"id": t.id, "name": t.name, "kind": t.kind, "status": t.status, "due": fields.Date.to_string(t.due_date) if t.due_date else False}
            for t in self.sudo().otm_task_ids.sorted("id")
        ]

    def otm_add_task(self, name, kind, due=False):
        self.ensure_one()
        if not self._otm_can_manage_project():
            raise UserError(self.env._("Only the assigned Project Manager can manage tasks."))
        if self.otm_stage not in ("work_started", "handover"):
            raise UserError(self.env._("Tasks can be added while the project is in progress."))
        name = str(name or "").strip()[:200]
        if not name or kind not in ("task", "snag"):
            raise UserError(self.env._("Enter a task name."))
        self.env["otm.ft.task"].sudo().create({"lead_id": self.id, "name": name, "kind": kind, "due_date": due or False, "user_id": self.env.user.id})
        return True

    def otm_set_task_status(self, task_id, status):
        self.ensure_one()
        if not self._otm_can_manage_project():
            raise UserError(self.env._("Only the assigned Project Manager can manage tasks."))
        task = self.env["otm.ft.task"].sudo().browse(int(task_id))
        if not task.exists() or task.lead_id != self:
            raise UserError(self.env._("Task not found."))
        if status not in ("todo", "doing", "done"):
            raise UserError(self.env._("Invalid status."))
        task.write({"status": status})
        return True

    # ---- joinery workshop ----
    @staticmethod
    def _otm_joinery_dict(j):
        return {"id": j.id, "lead_id": j.lead_id.id, "project": j.lead_id.name, "name": j.name, "qty": j.qty, "stage": j.stage,
                "due": fields.Date.to_string(j.due_date) if j.due_date else False}

    def otm_joinery(self):
        self.ensure_one()
        return [self._otm_joinery_dict(j) for j in self.sudo().otm_joinery_ids.sorted("id")]

    @api.model
    def otm_joinery_all(self):
        """Open joinery jobs across the projects this user can see (record rules apply to the leads)."""
        leads = self.search([("otm_stage", "in", ("work_started", "handover"))])
        return [self._otm_joinery_dict(j) for j in self.sudo().env["otm.ft.joinery"].search([("lead_id", "in", leads.ids)], order="id desc", limit=500)]

    def otm_add_joinery(self, name, qty, due=False):
        self.ensure_one()
        if not self._otm_can_manage_project():
            raise UserError(self.env._("Only the assigned Project Manager can manage joinery jobs."))
        if self.otm_stage not in ("work_started", "handover"):
            raise UserError(self.env._("Joinery jobs can be added while the project is in progress."))
        name, qty = str(name or "").strip()[:200], float(qty or 0)
        if not name or qty <= 0:
            raise UserError(self.env._("Enter an item name and a quantity above 0."))
        self.env["otm.ft.joinery"].sudo().create({"lead_id": self.id, "name": name, "qty": qty, "due_date": due or False})
        return True

    @api.model
    def otm_move_joinery(self, job_id, stage):
        job = self.env["otm.ft.joinery"].sudo().browse(int(job_id))
        if not job.exists():
            raise UserError(self.env._("Joinery job not found."))
        lead = self.browse(job.lead_id.id)
        lead.check_access("read")
        if not lead._otm_can_manage_project():
            raise UserError(self.env._("Only the assigned Project Manager can manage joinery jobs."))
        if stage not in dict(self.env["otm.ft.joinery"]._fields["stage"].selection):
            raise UserError(self.env._("Invalid stage."))
        job.write({"stage": stage})
        return True

    # ---- installation: site visits, schedule, crew, before/after photos ----
    PHOTO_MIMES = ("image/jpeg", "image/png", "image/webp")

    def _otm_install_dict(self, i):
        atts = self.env["ir.attachment"].sudo().search([("res_model", "=", "otm.ft.install"), ("res_id", "=", i.id)], order="id")
        return {
            "id": i.id, "name": i.name, "kind": i.kind, "status": i.status, "team": i.team or "",
            "date": fields.Date.to_string(i.planned_date) if i.planned_date else False,
            "photos": [{"id": a.id, "label": a.description or "photo", "name": a.name} for a in atts],
        }

    def otm_installs(self):
        self.ensure_one()
        return [self._otm_install_dict(i) for i in self.sudo().otm_install_ids]

    def otm_add_install(self, name, kind, date=False, team=""):
        self.ensure_one()
        if not self._otm_can_manage_project():
            raise UserError(self.env._("Only the assigned Project Manager can manage installation."))
        if self.otm_stage not in ("work_started", "handover"):
            raise UserError(self.env._("Visits can be planned while the project is in progress."))
        name = str(name or "").strip()[:200]
        if not name or kind not in ("site_visit", "installation"):
            raise UserError(self.env._("Enter a name for the visit or installation."))
        self.env["otm.ft.install"].sudo().create({"lead_id": self.id, "name": name, "kind": kind, "planned_date": date or False, "team": str(team or "").strip()[:200]})
        return True

    @api.model
    def _otm_install_for_manager(self, install_id):
        inst = self.env["otm.ft.install"].sudo().browse(int(install_id))
        if not inst.exists():
            raise UserError(self.env._("Not found."))
        lead = self.browse(inst.lead_id.id)
        lead.check_access("read")
        if not lead._otm_can_manage_project():
            raise UserError(self.env._("Only the assigned Project Manager can manage installation."))
        return inst

    @api.model
    def otm_set_install_status(self, install_id, status):
        inst = self._otm_install_for_manager(install_id)
        if status not in ("planned", "in_progress", "done"):
            raise UserError(self.env._("Invalid status."))
        inst.write({"status": status})
        return True

    @api.model
    def otm_add_photo(self, install_id, label, filename, data_b64):
        inst = self._otm_install_for_manager(install_id)
        if label not in ("before", "after"):
            raise UserError(self.env._("Photo type must be before or after."))
        import base64
        raw = base64.b64decode(data_b64 or "", validate=True)
        if not raw or len(raw) > 5 * 1024 * 1024:
            raise UserError(self.env._("Photo must be an image up to 5 MB."))
        if raw[:3] == b"\xff\xd8\xff":
            mime = "image/jpeg"
        elif raw[:8] == b"\x89PNG\r\n\x1a\n":
            mime = "image/png"
        elif raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
            mime = "image/webp"
        else:
            raise UserError(self.env._("Only JPEG, PNG or WebP images are allowed."))
        if self.env["ir.attachment"].sudo().search_count([("res_model", "=", "otm.ft.install"), ("res_id", "=", inst.id)]) >= 20:
            raise UserError(self.env._("Maximum 20 photos per visit."))
        self.env["ir.attachment"].sudo().create({
            "name": (str(filename or "photo").replace("/", "_").replace("\\", "_"))[:100], "description": label, "datas": data_b64,
            "mimetype": mime, "res_model": "otm.ft.install", "res_id": inst.id,
        })
        return True

    @api.model
    def otm_photo(self, att_id):
        """Image bytes (base64) of an installation photo, only for users who can see the project."""
        att = self.env["ir.attachment"].sudo().browse(int(att_id))
        if not att.exists() or att.res_model != "otm.ft.install" or att.mimetype not in self.PHOTO_MIMES:
            raise UserError(self.env._("Photo not found."))
        inst = self.env["otm.ft.install"].sudo().browse(att.res_id)
        if self.env.user.share:
            self._otm_portal_lead(inst.lead_id.id)  # customer: only own projects
        else:
            self.browse(inst.lead_id.id).check_access("read")
        return {"mimetype": att.mimetype, "data": att.datas.decode() if isinstance(att.datas, bytes) else att.datas}

    # ---- design studio & shop drawings ----
    DESIGN_MIMES = ("image/jpeg", "image/png", "image/webp", "application/pdf")

    def _otm_can_design(self):
        """Who prepares design items: Manager, the assigned PM, the lead's own Sales Manager, admin."""
        self.ensure_one()
        roles = self._otm_user_roles()
        u = self.env.user
        return u.has_group("base.group_system") or MGR in roles or (PM in roles and self.otm_project_manager_id == u) or (SM in roles and self.user_id == u)

    def _otm_can_review_design(self):
        self.ensure_one()
        roles = self._otm_user_roles()
        u = self.env.user
        return u.has_group("base.group_system") or MGR in roles or (SM in roles and self.user_id == u)

    def _otm_design_dict(self, d):
        atts = self.env["ir.attachment"].sudo().search([("res_model", "=", "otm.ft.design"), ("res_id", "=", d.id)], order="id")
        lead = d.lead_id
        return {
            "id": d.id, "lead_id": lead.id, "lead": lead.name, "name": d.name, "kind": d.kind, "status": d.status, "revision": d.revision,
            "designer": d.designer_id.name or "", "due": fields.Date.to_string(d.due_date) if d.due_date else False,
            "note": d.note or "", "review_note": d.review_note or "",
            "approved_by": d.approved_by_id.name or "", "can_edit": lead._otm_can_design(), "can_review": lead._otm_can_review_design(),
            "files": [{"id": a.id, "name": a.name, "rev": a.description or "r1", "pdf": a.mimetype == "application/pdf"} for a in atts],
        }

    def otm_designs(self):
        self.ensure_one()
        return [self._otm_design_dict(d) for d in self.sudo().otm_design_ids.sorted("id", reverse=True)]

    @api.model
    def otm_design_all(self):
        leads = self.search([("otm_stage", "not in", ("lost", False))])
        designs = self.env["otm.ft.design"].sudo().search([("lead_id", "in", leads.ids)], limit=300)
        return [self._otm_design_dict(d) for d in designs]

    def otm_add_design(self, name, kind, due=False, note=""):
        self.ensure_one()
        self.check_access("read")
        if not self._otm_can_design():
            raise UserError(self.env._("You are not allowed to add design items to this project."))
        name = str(name or "").strip()[:200]
        if not name or kind not in dict(self.env["otm.ft.design"]._fields["kind"].selection):
            raise UserError(self.env._("Enter a name and choose a type."))
        self.env["otm.ft.design"].sudo().create({"lead_id": self.id, "name": name, "kind": kind, "due_date": due or False, "note": str(note or "").strip()[:1000]})
        return True

    @api.model
    def _otm_design_for(self, design_id, review=False):
        d = self.env["otm.ft.design"].sudo().browse(int(design_id))
        if not d.exists():
            raise UserError(self.env._("Not found."))
        lead = self.browse(d.lead_id.id)
        lead.check_access("read")
        if not (lead._otm_can_review_design() if review else lead._otm_can_design()):
            raise UserError(self.env._("You are not allowed to do this."))
        return d, lead

    @api.model
    def otm_add_design_file(self, design_id, filename, data_b64):
        d, lead = self._otm_design_for(design_id)
        if d.status not in ("draft", "changes_requested"):
            raise UserError(self.env._("Files can be added while the item is Draft or Changes requested."))
        import base64
        raw = base64.b64decode(data_b64 or "", validate=True)
        if not raw or len(raw) > 7 * 1024 * 1024:
            raise UserError(self.env._("File must be up to 7 MB."))
        if raw[:3] == b"\xff\xd8\xff":
            mime = "image/jpeg"
        elif raw[:8] == b"\x89PNG\r\n\x1a\n":
            mime = "image/png"
        elif raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
            mime = "image/webp"
        elif raw[:5] == b"%PDF-":
            mime = "application/pdf"
        else:
            raise UserError(self.env._("Only JPEG, PNG, WebP or PDF files are allowed."))
        if self.env["ir.attachment"].sudo().search_count([("res_model", "=", "otm.ft.design"), ("res_id", "=", d.id)]) >= 30:
            raise UserError(self.env._("Maximum 30 files per item."))
        self.env["ir.attachment"].sudo().create({
            "name": (str(filename or "file").replace("/", "_").replace("\\", "_"))[:100], "description": f"r{d.revision}", "datas": data_b64,
            "mimetype": mime, "res_model": "otm.ft.design", "res_id": d.id,
        })
        return True

    @api.model
    def otm_design_action(self, design_id, action, note=""):
        review = action in ("approve", "request_changes")
        d, lead = self._otm_design_for(design_id, review=review)
        note = str(note or "").strip()[:1000]
        if action == "submit":
            if d.status not in ("draft", "changes_requested"):
                raise UserError(self.env._("Only a draft can be sent for review."))
            if not self.env["ir.attachment"].sudo().search_count([("res_model", "=", "otm.ft.design"), ("res_id", "=", d.id)]):
                raise UserError(self.env._("Upload at least one file before sending for review."))
            d.write({"status": "in_review"})
        elif action == "approve":
            if d.status != "in_review":
                raise UserError(self.env._("Only an item in review can be approved."))
            d.write({"status": "approved", "approved_by_id": self.env.user.id, "approved_on": fields.Datetime.now(), "review_note": note})
        elif action == "request_changes":
            if d.status != "in_review":
                raise UserError(self.env._("Only an item in review can be sent back."))
            if not note:
                raise UserError(self.env._("Write what needs to change."))
            d.write({"status": "changes_requested", "revision": d.revision + 1, "review_note": note, "approved_by_id": False, "approved_on": False})
        else:
            raise UserError(self.env._("Unknown action."))
        lead.sudo().message_post(body=self.env._("Design '%(n)s': %(a)s", n=d.name, a=action.replace("_", " ")), author_id=self.env.user.partner_id.id)
        return True

    @api.model
    def otm_design_file(self, att_id):
        att = self.env["ir.attachment"].sudo().browse(int(att_id))
        if not att.exists() or att.res_model != "otm.ft.design" or att.mimetype not in self.DESIGN_MIMES or self.env.user.share:
            raise UserError(self.env._("File not found."))
        self.browse(self.env["otm.ft.design"].sudo().browse(att.res_id).lead_id.id).check_access("read")
        return {"mimetype": att.mimetype, "data": att.datas.decode() if isinstance(att.datas, bytes) else att.datas}

    # ---- procurement check of the estimate (availability + costing) before Manager review / client ----
    def _otm_sync_costing_lines(self):
        """Copy the latest estimate lines into costing lines, keeping what Procurement already entered."""
        self.ensure_one()
        order = self.sudo().order_ids.sorted("id")[-1:]
        existing = {l.name: l for l in self.sudo().otm_costing_line_ids}
        keep = self.env["otm.ft.costing.line"]
        for ol in order.order_line.filtered(lambda x: not x.display_type):
            line = existing.get(ol.name)
            vals = {"name": ol.name, "qty": ol.product_uom_qty, "est_price": ol.price_unit}
            if line:
                line.write(vals)
                keep |= line
            else:
                keep |= self.env["otm.ft.costing.line"].sudo().create({"lead_id": self.id, **vals})
        (self.sudo().otm_costing_line_ids - keep).unlink()

    def _otm_costing_to_procurement(self):
        """After client approval, Procurement starts from the costing they confirmed (they can still change it)."""
        self.ensure_one()
        vals = [(0, 0, {"name": l.name, "vendor": l.vendor or "", "qty": l.qty, "price": l.unit_cost}) for l in self.sudo().otm_costing_line_ids if l.unit_cost > 0]
        if vals:
            self.sudo().write({"otm_procurement_line_ids": vals})

    def otm_costing_data(self):
        self.ensure_one()
        lines = self.sudo().otm_costing_line_ids
        est = sum(l.qty * l.est_price for l in lines)
        cost = sum(lines.mapped("cost"))
        return {
            "estimate": est, "cost": cost, "margin": est - cost,
            "lines": [
                {"id": l.id, "name": l.name, "qty": l.qty, "est_price": l.est_price, "availability": l.availability or "", "lead_days": l.lead_days,
                 "unit_cost": l.unit_cost, "vendor": l.vendor or "", "note": l.note or ""}
                for l in lines
            ],
        }

    def otm_save_costing(self, lines):
        self._otm_require(PROC, ("procurement_check",))
        mine = {l.id: l for l in self.sudo().otm_costing_line_ids}
        if not lines or len(lines) > 200:
            raise UserError(self.env._("Nothing to save."))
        for l in lines:
            rec = mine.get(int(l.get("id", 0)))
            if not rec:
                raise UserError(self.env._("Unknown line."))
            avail = l.get("availability") or False
            if avail and avail not in ("in_stock", "order", "unavailable"):
                raise UserError(self.env._("Invalid availability."))
            cost, days = float(l.get("unit_cost", 0)), int(l.get("lead_days", 0))
            if cost < 0 or days < 0 or days > 365:
                raise UserError(self.env._("Cost and lead time cannot be negative."))
            rec.write({"availability": avail, "unit_cost": cost, "lead_days": days,
                       "vendor": str(l.get("vendor", "")).strip()[:120], "note": str(l.get("note", "")).strip()[:200]})
        return True
