import base64

from odoo import api, fields, models
from odoo.exceptions import UserError

from .crm_lead import ACC, MGR, PM, PROC, SM

P_TERMS, P_BANK = "otm_ft_pipeline.doc_terms", "otm_ft_pipeline.doc_bank"
DOC_KINDS = {"contract": "Contract", "quotation": "Signed quotation", "lpo": "Customer LPO / PO", "id": "ID / trade licence", "vendor_bill": "Vendor bill", "receipt": "Payment receipt", "other": "Other"}
TAG = "otm_doc:"
DOC_ROLES = (SM, MGR, PM, PROC, ACC)


class CrmLeadDocs(models.Model):
    _inherit = "crm.lead"

    # ---- company details for printed documents ----
    @api.model
    def _otm_doc_company(self):
        c = self.env.company.sudo()
        logo = ""
        if c.logo:
            raw = c.logo.decode() if isinstance(c.logo, bytes) else c.logo
            mime = "image/jpeg" if raw.startswith("/9j/") else "image/svg+xml" if raw.startswith(("PHN2Zy", "PD94b")) else "image/png"
            logo = f"data:{mime};base64,{raw}"
        icp = self.env["ir.config_parameter"].sudo()
        addr = ", ".join(x for x in (c.street, c.street2, c.city, c.state_id.name, c.country_id.name) if x)
        return {"name": c.name, "address": addr, "phone": c.phone or "", "email": c.email or "", "website": c.website or "", "vat": c.vat or "", "logo": logo,
                "currency": c.currency_id.name, "terms": icp.get_param(P_TERMS) or "", "bank": icp.get_param(P_BANK) or ""}

    @api.model
    def otm_doc_settings(self):
        self._otm_admin_or_mgr()
        c = self._otm_doc_company()
        return {"terms": c["terms"], "bank": c["bank"], "company": c["name"], "has_logo": bool(c["logo"]), "vat": c["vat"], "address": c["address"]}

    @api.model
    def _otm_admin_or_mgr(self):
        if not (self.env.user.has_group("base.group_system") or MGR in self._otm_user_roles()):
            raise UserError(self.env._("Only an administrator or Manager can change document settings."))

    @api.model
    def otm_doc_settings_save(self, terms, bank):
        self._otm_admin_or_mgr()
        icp = self.env["ir.config_parameter"].sudo()
        icp.set_param(P_TERMS, str(terms or "").strip()[:3000])
        icp.set_param(P_BANK, str(bank or "").strip()[:1000])
        return True

    # ---- printable documents ----
    @api.model
    def otm_doc_print(self, kind, rec_id):
        rec_id = int(rec_id)
        company = self._otm_doc_company()
        if kind in ("quotation", "handover", "receipt", "invoice"):
            lead = self.browse(rec_id)
            lead.check_access("read")
            return dict(getattr(self, f"_otm_print_{kind}")(lead.sudo()), kind=kind, company=company)
        if kind == "po":
            po = self._otm_po_for(rec_id, PROC, MGR, PM)
            return dict(self._otm_print_po(po), kind=kind, company=company)
        if kind == "payslip":
            return dict(self._otm_print_payslip(rec_id), kind=kind, company=company)
        raise UserError(self.env._("Unknown document."))

    def _otm_print_quotation(self, lead):
        order = lead.order_ids.sorted("id")[-1:]
        if not order:
            raise UserError(self.env._("There is no estimate to print yet."))
        tax = lead._otm_sale_tax()
        return {"number": order.name, "date": fields.Date.to_string(fields.Date.context_today(self)), "valid_until": fields.Date.to_string(lead.otm_est_valid_until) if lead.otm_est_valid_until else "",
                "project": lead.name, "customer": {"name": lead.partner_name or lead.partner_id.name or "", "phone": lead.phone or "", "email": lead.email_from or "", "address": lead.otm_address or "", "person": lead.otm_contact_person or ""},
                "lines": [{"name": l.name, "qty": l.product_uom_qty, "unit": l.otm_unit or "", "price": l.price_unit, "subtotal": l.price_subtotal, "category": l.otm_category or "other"} for l in order.order_line if not l.display_type],
                "untaxed": order.amount_untaxed, "tax": order.amount_tax, "total": order.amount_total, "tax_name": tax.name if tax else "Tax", "prepared_by": lead.user_id.name or ""}

    def _otm_print_handover(self, lead):
        inv = lead.otm_invoice_id
        return {"project": lead.name, "date": fields.Date.to_string(fields.Date.context_today(self)), "progress": lead.otm_progress,
                "customer": {"name": lead.partner_name or lead.partner_id.name or "", "phone": lead.phone or "", "address": lead.otm_address or ""},
                "project_manager": lead.otm_project_manager_id.name or "", "sales_manager": lead.user_id.name or "", "contract": lead.otm_estimate_amount or 0.0,
                "invoice": inv.name if inv else "", "stage": lead.otm_stage}

    def _otm_print_invoice(self, lead):
        if not any(r in self._otm_user_roles() for r in (ACC, MGR, SM)):
            raise UserError(self.env._("Invoices are available to Accounts, Managers and Sales Managers."))
        inv = lead.otm_invoice_id
        if not inv:
            raise UserError(self.env._("There is no invoice for this project yet."))
        return {"project": lead.name, "number": inv.name if inv.state == "posted" else "DRAFT", "state": inv.state, "payment_state": inv.payment_state,
                "date": fields.Date.to_string(inv.invoice_date or fields.Date.context_today(self)), "due": fields.Date.to_string(inv.invoice_date_due) if inv.invoice_date_due else "",
                "customer": {"name": lead.partner_name or lead.partner_id.name or "", "phone": lead.phone or "", "email": lead.email_from or "", "address": lead.otm_address or ""},
                "lines": [{"name": l.name, "qty": l.quantity, "price": l.price_unit, "subtotal": l.price_subtotal} for l in inv.invoice_line_ids if l.display_type == "product"],
                "untaxed": inv.amount_untaxed, "tax": inv.amount_tax, "total": inv.amount_total, "balance": inv.amount_residual}

    def _otm_print_receipt(self, lead):
        if not any(r in self._otm_user_roles() for r in (ACC, MGR, SM)):
            raise UserError(self.env._("Receipts are available to Accounts, Managers and Sales Managers."))
        inv = lead.otm_invoice_id
        if not inv or inv.state != "posted":
            raise UserError(self.env._("There is no posted invoice for this project yet."))
        pays = inv._get_reconciled_payments()
        if not pays:
            raise UserError(self.env._("No payment has been recorded for this invoice yet."))
        return {"project": lead.name, "customer": {"name": lead.partner_name or lead.partner_id.name or "", "phone": lead.phone or "", "address": lead.otm_address or ""},
                "invoice": inv.name, "invoice_total": inv.amount_total, "balance": inv.amount_residual, "payment_state": inv.payment_state,
                "payments": [{"number": p.name or "", "date": fields.Date.to_string(p.date), "amount": p.amount, "journal": p.journal_id.name} for p in pays.sorted("date")],
                "received_by": self.env.user.name}

    def _otm_print_po(self, po):
        vendor = po.partner_id
        return {"number": po.name, "date": fields.Date.to_string(po.date_order.date()) if po.date_order else "", "expected": fields.Date.to_string(po.otm_expected_date) if po.otm_expected_date else "",
                "project": po.otm_lead_id.name or "", "state": po.state,
                "vendor": {"name": vendor.name or "", "phone": vendor.phone or "", "email": vendor.email or "", "address": ", ".join(x for x in (vendor.street, vendor.city, vendor.country_id.name) if x)},
                "lines": [{"name": l.name, "qty": l.product_qty, "price": l.price_unit, "subtotal": l.price_subtotal} for l in po.order_line if not l.display_type],
                "untaxed": po.amount_untaxed, "tax": po.amount_tax, "total": po.amount_total, "prepared_by": self.env.user.name}

    def _otm_print_payslip(self, slip_id):
        roles = self._otm_hr_roles()
        slip = self.env["otm.ft.payslip"].sudo().browse(int(slip_id))
        if not slip.exists():
            raise UserError(self.env._("Payslip not found."))
        own = slip.employee_id == self._otm_my_employee() and slip.status != "draft"
        if not (MGR in roles or ACC in roles or own):
            raise UserError(self.env._("You are not allowed to print this payslip."))
        d = self._otm_slip_dict(slip)
        d.update(designation=slip.employee_id.designation or "", code=slip.employee_id.code or "", paid_on=fields.Date.to_string(slip.paid_on) if slip.paid_on else "")
        return d

    # ---- project documents (uploads) ----
    def _otm_doc_lead(self, lead_id):
        if not any(r in self._otm_user_roles() for r in DOC_ROLES):
            raise UserError(self.env._("You are not allowed to use project documents."))
        lead = self.browse(int(lead_id))
        lead.check_access("read")
        return lead

    def otm_docs(self, lead_id=None):
        lead = self._otm_doc_lead(lead_id or self.id)
        is_boss = MGR in self._otm_user_roles() or self.env.user.has_group("base.group_system")
        atts = self.env["ir.attachment"].sudo().search([("res_model", "=", "crm.lead"), ("res_id", "=", lead.id), ("description", "=like", TAG + "%")], order="id desc")
        return {"kinds": DOC_KINDS, "docs": [{"id": a.id, "name": a.name, "kind": (a.description or "")[len(TAG):], "size": a.file_size, "mimetype": a.mimetype or "", "user": a.create_uid.name or "",
                                              "date": fields.Datetime.to_string(a.create_date), "can_delete": is_boss or a.create_uid == self.env.user} for a in atts]}

    def otm_doc_add(self, name, data_b64, kind):
        self.ensure_one()
        lead = self._otm_doc_lead(self.id)
        if kind not in DOC_KINDS:
            raise UserError(self.env._("Choose a document type."))
        name = str(name or "").strip().replace("/", "_").replace("\\", "_")[:120]
        if not name:
            raise UserError(self.env._("File name is missing."))
        try:
            raw = base64.b64decode(data_b64, validate=True)
        except Exception:
            raise UserError(self.env._("The file could not be read."))
        if not raw or len(raw) > 5 * 1024 * 1024:
            raise UserError(self.env._("File must be up to 5 MB."))
        att = self.env["ir.attachment"].sudo().create({"name": name, "datas": base64.b64encode(raw), "res_model": "crm.lead", "res_id": lead.id, "description": TAG + kind})
        return att.id

    @api.model
    def _otm_doc_att(self, att_id):
        att = self.env["ir.attachment"].sudo().browse(int(att_id))
        if not att.exists() or att.res_model != "crm.lead" or not (att.description or "").startswith(TAG):
            raise UserError(self.env._("Document not found."))
        self._otm_doc_lead(att.res_id)  # real user must be able to read the project
        return att

    @api.model
    def otm_doc_get(self, att_id):
        att = self._otm_doc_att(att_id)
        return {"name": att.name, "mimetype": att.mimetype or "application/octet-stream", "data": att.datas.decode() if att.datas else ""}

    @api.model
    def otm_doc_delete(self, att_id):
        att = self._otm_doc_att(att_id)
        if not (att.create_uid == self.env.user or MGR in self._otm_user_roles() or self.env.user.has_group("base.group_system")):
            raise UserError(self.env._("Only the uploader or a Manager can delete this document."))
        att.unlink()
        return True
