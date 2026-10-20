import random
from datetime import timedelta

from odoo import api, fields, models
from odoo.exceptions import UserError

from .crm_lead import ROLE_GROUPS, ACC, MGR, PM, PROC, SM

DEMO_TAG = "FT Demo"
DEMO_REF = "FT-DEMO"

# (lead name, customer, source, stage, estimate total, age in days)
DEMO = [
    ("Marina Penthouse Fit-out", "Rashid Al Mansoori", "meta", "completed", 320000, 330),
    ("Palm Villa Renovation", "Sara Khan", "walkin", "completed", 410000, 290),
    ("Downtown Cafe Interior", "Brew & Co", "other", "handover", 150000, 250),
    ("Business Bay Office Fit-out", "Nexora Technologies", "meta", "work_started", 275000, 200),
    ("JLT Apartment Makeover", "Imran Siddiqui", "meta", "payment_verification", 120000, 120),
    ("Dental Clinic Interior", "SmileCare Clinic", "walkin", "payment_verification", 210000, 95),
    ("Arabian Ranches Villa", "Fatima Al Hashmi", "other", "awaiting_advance", 380000, 85),
    ("Boutique Retail Store", "Zaina Fashions", "meta", "awaiting_advance", 95000, 70),
    ("Studio Apartment Design", "Daniel Joseph", "walkin", "invoice_with_sales", 60000, 60),
    ("Corporate Lounge Fit-out", "Gulf Meridian Group", "other", "invoice_draft", 450000, 55),
    ("Restaurant Renovation", "Spice Route Kitchen", "meta", "procurement_approved", 230000, 48),
    ("Townhouse Joinery Package", "Omar Farooq", "walkin", "procurement", 180000, 42),
    ("Hotel Suite Refurbishment", "Palmview Hotels", "other", "procurement", 520000, 38),
    ("Salon Interior", "Glow Beauty Lounge", "meta", "pm_assigned", 85000, 33),
    ("Duplex Apartment Fit-out", "Anita Menon", "meta", "pm_assigned", 265000, 30),
    ("Showroom Interior", "Alpha Motors", "other", "client_approved", 340000, 27),
    ("Villa Majlis Design", "Khalid Al Suwaidi", "walkin", "client_approved", 190000, 24),
    ("Co-working Space Fit-out", "HiveSpace", "meta", "sent_to_client", 300000, 20),
    ("Kids Nursery Interior", "Little Stars Nursery", "walkin", "sent_to_client", 75000, 18),
    ("Pharmacy Fit-out", "CityCare Pharmacy", "other", "sent_to_client", 110000, 16),
    ("Luxury Bedroom Suite", "Layla Hassan", "meta", "estimate_approved", 98000, 14),
    ("Law Office Interior", "Barakat & Partners", "other", "estimate_manager_review", 160000, 12),
    ("Gym Interior Design", "FitZone", "meta", "procurement_check", 205000, 10),
    ("Home Cinema Room", "Vikram Nair", "walkin", "estimate_draft", 70000, 8),
    ("Studio Loft Conversion", "Hana Yusuf", "meta", "estimate_draft", 125000, 6),
    ("Bakery Interior", "Golden Crust Bakery", "meta", "assigned", 0, 4),
    ("Villa Landscape & Interior", "Nasser Al Falasi", "walkin", "assigned", 0, 3),
    ("Office Pantry Revamp", "Orbit Logistics", "other", "new", 0, 2),
    ("Apartment Wardrobe Project", "Priya Raman", "other", "new", 0, 1),
    ("Spa Interior", "Serene Spa", "other", "new", 0, 0),
    ("Cafe Franchise Fit-out", "Bean There", "other", "lost", 140000, 150),
    ("Warehouse Office Partition", "SwiftCargo", "meta", "lost", 90000, 110),
]

PATH = [
    ("assign", "assigned", MGR), ("create_estimate", "estimate_draft", SM), ("submit_to_procurement", "procurement_check", SM), ("confirm_costing", "estimate_manager_review", PROC),
    ("approve", "estimate_approved", MGR), ("send_to_client", "sent_to_client", SM), ("client_approve", "client_approved", SM),
    ("assign_project_manager", "pm_assigned", MGR), ("send_to_procurement", "procurement", PM), ("approve_prices", "procurement_approved", PROC),
    ("start_invoice", "invoice_draft", ACC), ("send_to_sales", "invoice_with_sales", ACC), ("send_to_client", "awaiting_advance", SM),
    ("record_payment", "payment_verification", SM), ("verify_payment", "work_started", ACC),
    ("complete_work", "handover", PM), ("confirm_handover", "completed", SM),
]
ORDER = ["new"] + [p[1] for p in PATH]
EST_LINES = [("Living & dining joinery, wardrobes", 0.35), ("False ceiling & lighting", 0.2), ("Flooring & wall finishes", 0.25), ("Kitchen cabinetry & fittings", 0.2)]
VENDORS = ["Al Noor Timber Trading", "Gulf Gypsum LLC", "Stonehill Marble", "Lumina Lighting"]


class CrmLead(models.Model):
    _inherit = "crm.lead"

    @api.model
    def _otm_demo_admin_check(self):
        if not self.env.user.has_group("base.group_system"):
            raise UserError(self.env._("Only an administrator can manage demo data."))

    @api.model
    def otm_demo_status(self):
        self._otm_demo_admin_check()
        tag = self.env["crm.tag"].sudo().search([("name", "=", DEMO_TAG)], limit=1)
        return {"count": self.sudo().search_count([("tag_ids", "in", tag.ids)]) if tag else 0}

    @api.model
    def _otm_role_user(self, role):
        group = self.env.ref(ROLE_GROUPS[role])
        user = self.env["res.users"].sudo().search([("group_ids", "in", group.id), ("active", "=", True)], limit=1, order="id")
        return user or self.env.user

    @api.model
    def otm_load_demo_data(self):
        """Create sample leads across every stage (admin only). Safe to run once; remove with otm_remove_demo_data."""
        self._otm_demo_admin_check()
        if self.otm_demo_status()["count"]:
            raise UserError(self.env._("Demo data is already loaded. Remove it first to reload."))
        env = self.with_context(tracking_disable=True, mail_create_nolog=True, mail_notrack=True).sudo().env
        Lead, Log = env["crm.lead"], env["otm.ft.stage.log"]
        tag = env["crm.tag"].create({"name": DEMO_TAG})
        users = {r: self._otm_role_user(r) for r in ROLE_GROUPS}
        sms = env["res.users"].search([("group_ids", "in", self.env.ref(ROLE_GROUPS[SM]).id), ("active", "=", True)], order="id") or users[SM]
        journal = env["account.journal"].search([("type", "in", ("bank", "cash"))], limit=1)
        rnd = random.Random(19)
        now = fields.Datetime.now()
        skipped = 0
        for i, (name, cust, origin, stage, est, age) in enumerate(DEMO):
            rank = ORDER.index("sent_to_client" if stage == "lost" else stage)
            created = now - timedelta(days=age, hours=rnd.randint(0, 8))
            vals = {
                "name": name, "type": "opportunity", "partner_name": cust, "otm_origin": origin, "otm_stage": stage,
                "tag_ids": [(6, 0, tag.ids)], "expected_revenue": est or rnd.choice([60000, 90000, 150000]),
                "phone": f"+971 50 {rnd.randint(1000000, 9999999)}", "email_from": cust.split()[0].lower() + "@example.com",
            }
            if rank >= 1:
                vals["user_id"] = sms[i % len(sms)].id
            if rank >= ORDER.index("pm_assigned"):
                vals["otm_project_manager_id"] = users[PM].id
            lead = Lead.create(vals)
            env.cr.execute("UPDATE crm_lead SET create_date=%s WHERE id=%s", [created, lead.id])

            if rank >= ORDER.index("estimate_draft") and est:
                partner = env["res.partner"].create({"name": cust, "ref": DEMO_REF, "phone": vals["phone"], "email": vals["email_from"]})
                lead.partner_id = partner.id
                tax = lead._otm_sale_tax()
                order = env["sale.order"].create({
                    "partner_id": partner.id, "opportunity_id": lead.id,
                    "order_line": [(0, 0, {"name": n, "product_uom_qty": 1, "price_unit": round(est * share, 2), "tax_ids": [(6, 0, tax.ids)]}) for n, share in EST_LINES],
                })
                if rank >= ORDER.index("procurement_check"):
                    lead.otm_estimate_amount = order.amount_untaxed
                total = order.amount_untaxed
                if rank >= ORDER.index("procurement_check"):
                    lead._otm_sync_costing_lines()
                    confirmed = rank >= ORDER.index("estimate_manager_review")
                    for k, cl in enumerate(lead.otm_costing_line_ids):
                        if confirmed or k == 0:
                            cl.write({"availability": ["in_stock", "order", "order", "in_stock"][k % 4], "lead_days": [0, 10, 14, 3][k % 4],
                                      "unit_cost": round(cl.est_price * rnd.choice([0.72, 0.8, 0.85]), 2), "vendor": VENDORS[k % 4]})
                if rank >= ORDER.index("procurement"):
                    factor = rnd.choice([0.88, 0.93, 0.97, 1.0])
                    if stage == "procurement" and i % 2:
                        factor = 1.08  # over estimate -> needs Manager approval
                    lines = [(0, 0, {"name": n, "vendor": VENDORS[k % 4], "qty": 1, "price": round(total * share * factor, 2)}) for k, (n, share) in enumerate(EST_LINES)]
                    lead.otm_procurement_line_ids = lines
                if rank >= ORDER.index("invoice_draft"):
                    advance = round(total * 0.3, 2)
                    try:
                        with env.cr.savepoint():
                            move = env["account.move"].create({
                                "move_type": "out_invoice", "partner_id": partner.id, "invoice_origin": lead.name,
                                "invoice_line_ids": [(0, 0, {"name": f"Advance payment - {lead.name}", "quantity": 1, "price_unit": advance, "tax_ids": [(6, 0, tax.ids)]})],
                            })
                            lead.otm_invoice_id = move.id
                            if rank >= ORDER.index("invoice_with_sales"):
                                move.action_post()
                            if rank >= ORDER.index("payment_verification"):
                                lead.otm_advance_amount = move.amount_total
                                paid = rank >= ORDER.index("work_started") or i % 2 == 0
                                if paid and journal:
                                    env["account.payment.register"].with_context(active_model="account.move", active_ids=move.ids).create({"journal_id": journal.id}).action_create_payments()
                    except Exception:  # accounting not fully configured: keep the lead, skip the invoice
                        skipped += 1
                        lead.otm_invoice_id = False

            # history: one log row per step taken, spread from creation to now
            steps = [p for p in PATH if ORDER.index(p[1]) <= rank]
            if stage == "lost":
                steps.append(("mark_lost", "lost", SM))
            prev = "new"
            span = max(age, 1) * 86400
            for k, (action, to, role) in enumerate(steps):
                when = created + timedelta(seconds=span * (k + 1) / (len(steps) + 1))
                Log.create({"lead_id": lead.id, "action": action, "from_stage": prev, "to_stage": to, "user_id": users[role].id, "date": when})
                prev = to
            if rank >= ORDER.index("work_started"):
                done = rank > ORDER.index("work_started")
                for nm, kd, stt in [("Site measurements and marking", "task", "done"), ("Electrical first fix", "task", "done"), ("Install joinery units", "task", "done" if done else "doing"),
                                    ("Paint touch-up in lobby", "snag", "done" if done else "todo"), ("Replace damaged skirting", "snag", "done" if done else "doing")]:
                    env["otm.ft.task"].create({"lead_id": lead.id, "name": nm, "kind": kd, "status": stt, "due_date": (now + timedelta(days=7)).date(), "user_id": users[PM].id})
                for k, (nm, q) in enumerate([("Wardrobe units", 4), ("Kitchen cabinets", 1), ("TV console & wall panel", 1), ("Vanity units", 3)]):
                    st = "installed" if done else ["installed", "ready", "finishing", "assembly"][k]
                    env["otm.ft.joinery"].create({"lead_id": lead.id, "name": nm, "qty": q, "stage": st, "due_date": (now + timedelta(days=10 + k * 3)).date()})
                for nm, kd, stt, dd in [("Site visit and measurement", "site_visit", "done", -20), ("Joinery installation - phase 1", "installation", "done" if done else "in_progress", -5), ("Final installation and touch-up", "installation", "done" if done else "planned", 5)]:
                    env["otm.ft.install"].create({"lead_id": lead.id, "name": nm, "kind": kd, "status": stt, "planned_date": (now + timedelta(days=dd)).date(), "team": "Crew A: Ravi, Suresh"})
                notes = ["Site mobilised, measurements verified", "Ceiling framing and electrical first fix done", "Joinery installation in progress", "Flooring and wall finishes completed", "Snagging and final touch-ups"]
                final = 100 if (age > 200 or rank > ORDER.index("work_started")) else rnd.choice([35, 55, 70])
                marks = [p for p in (15, 35, 55, 80, 100) if p <= final] or [final]
                for k, pc in enumerate(marks):
                    when = created + timedelta(days=age * 0.5 + k * max(age * 0.1, 1))
                    env["otm.ft.site.update"].create({"lead_id": lead.id, "percent": pc, "note": notes[k % 5], "user_id": users[PM].id, "date": min(when, now)})
        return {"created": len(DEMO), "invoices_skipped": skipped}

    @api.model
    def otm_remove_demo_data(self):
        self._otm_demo_admin_check()
        env = self.sudo().env
        tag = env["crm.tag"].search([("name", "=", DEMO_TAG)], limit=1)
        leads = env["crm.lead"].search([("tag_ids", "in", tag.ids)]) if tag else env["crm.lead"]
        kept = 0
        for lead in leads:
            for inv in lead.otm_invoice_id:
                try:
                    with env.cr.savepoint():
                        if inv.state == "posted":
                            inv.button_draft()
                        inv.unlink()
                except Exception:
                    kept += 1
            try:
                with env.cr.savepoint():
                    lead.order_ids.filtered(lambda o: o.state in ("draft", "cancel")).unlink()
            except Exception:
                pass
        removed = len(leads)
        try:
            with env.cr.savepoint():
                leads.unlink()
        except Exception as e:
            raise UserError(self.env._("Could not remove some demo leads: %s", e))
        env["res.partner"].search([("ref", "=", DEMO_REF)]).filtered(lambda p: not p.sale_order_ids and not p.invoice_ids).unlink()
        tag.unlink()
        return {"removed": removed, "invoices_kept": kept}
