import base64
import random
import struct
import zlib
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
FACTORY_NAME = "FT Furniture Factory (Demo)"
IC_FLOW = ["in_production", "ready", "sent", "draft", "accepted", "delivered", "received"]
DEMO_PASS = "Demo@2026"
DEMO_DOMAIN = "ftdemo.com"
# (login prefix, display name, role)
DEMO_USERS = [
    ("sales1", "Demo Sales Manager 1", SM), ("sales2", "Demo Sales Manager 2", SM), ("manager", "Demo Manager", MGR),
    ("pm1", "Demo Project Manager 1", PM), ("pm2", "Demo Project Manager 2", PM), ("procurement", "Demo Procurement", PROC), ("accounts", "Demo Accounts", ACC),
    ("factory", "Demo Factory Manager", "manufacturing"),
]
# portal customers: (login prefix, lead name whose customer they are)
DEMO_CUSTOMERS = [
    ("customer1", "Business Bay Office Fit-out"),  # work in progress: progress, snags
    ("customer2", "Co-working Space Fit-out"),  # estimate sent: approve / request changes
    ("customer3", "Downtown Cafe Interior"),  # handover: confirm handover
]
DESIGN_NAMES = [("Living room concept", "concept"), ("Colour & material mood board", "moodboard"), ("Master bedroom 3D render", "render_3d"), ("Floor plan & layout", "layout")]
DESIGN_STATUS = ["approved", "in_review", "changes_requested", "draft"]


def _png(rgb):
    """A small valid PNG so demo thumbnails render and pass the magic-byte check."""
    w = h = 64
    raw = b"".join(b"\x00" + bytes(rgb) * w for _ in range(h))
    def chunk(t, d):
        c = struct.pack(">I", len(d)) + t + d
        return c + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


PALETTE = [(107, 41, 59), (232, 191, 126), (217, 143, 160), (196, 138, 106), (90, 110, 120), (150, 130, 110)]
LINE_META = {"Living & dining joinery, wardrobes": ("joinery", "ls"), "False ceiling & lighting": ("ceiling", "ls"), "Flooring & wall finishes": ("flooring", "ls"), "Kitchen cabinetry & fittings": ("kitchen", "ls")}
# (code, name, category, unit, rate, cost)
DEMO_RATES = [
    ("DEMO-JN-001", "Wardrobe, laminate finish", "joinery", "sqm", 950, 640), ("DEMO-JN-002", "Wardrobe, veneer finish", "joinery", "sqm", 1250, 860),
    ("DEMO-JN-003", "TV unit with wall panel", "joinery", "rm", 1800, 1250), ("DEMO-JN-004", "Vanity unit", "joinery", "nos", 2400, 1650),
    ("DEMO-CL-001", "Gypsum false ceiling, plain", "ceiling", "sqm", 120, 78), ("DEMO-CL-002", "Gypsum ceiling with cove lighting", "ceiling", "sqm", 185, 120),
    ("DEMO-FL-001", "Porcelain tile flooring 60x60", "flooring", "sqm", 140, 92), ("DEMO-FL-002", "Engineered wood flooring", "flooring", "sqm", 210, 150),
    ("DEMO-FL-003", "Marble flooring", "flooring", "sqm", 360, 250), ("DEMO-WL-001", "Emulsion paint, 2 coats", "wall", "sqm", 28, 16),
    ("DEMO-WL-002", "Wallpaper supply and fix", "wall", "sqm", 85, 55), ("DEMO-WL-003", "Fluted wall panel", "wall", "sqm", 310, 210),
    ("DEMO-KT-001", "Kitchen base cabinets", "kitchen", "rm", 1450, 980), ("DEMO-KT-002", "Kitchen wall cabinets", "kitchen", "rm", 1150, 780),
    ("DEMO-KT-003", "Quartz countertop", "kitchen", "rm", 820, 560), ("DEMO-LT-001", "Recessed LED downlight", "lighting", "nos", 65, 38),
    ("DEMO-LT-002", "Decorative pendant light", "lighting", "nos", 480, 310), ("DEMO-LT-003", "LED strip lighting", "lighting", "rm", 45, 26),
    ("DEMO-ME-001", "Electrical point, supply and fix", "mep", "nos", 55, 34), ("DEMO-ME-002", "Plumbing point, supply and fix", "mep", "nos", 140, 90),
    ("DEMO-FU-001", "Loose sofa set, 3+2", "furniture", "set", 5200, 3600), ("DEMO-FU-002", "Dining table, 6 seater", "furniture", "nos", 3400, 2300),
    ("DEMO-OT-001", "Project supervision and site clean-up", "other", "ls", 4500, 3000),
]
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
    def _otm_demo_user(self, login, name, group_xmlids, partner=None):
        """Create (or reactivate) a demo login with the shared demo password."""
        Users = self.env["res.users"].sudo().with_context(active_test=False, no_reset_password=True)
        groups = [self.env.ref(x).id for x in group_xmlids]
        vals = {"name": name, "login": login, "email": login, "password": DEMO_PASS, "active": True}
        user = Users.search([("login", "=", login)], limit=1)
        if user:
            user.write({**vals, "group_ids": [(6, 0, groups)]})
            user.partner_id.active = True
            return user
        return Users.create({**vals, "group_ids": [(6, 0, groups)], **({"partner_id": partner.id} if partner else {})})

    @api.model
    def otm_load_demo_data(self):
        """Create sample leads across every stage (admin only). Safe to run once; remove with otm_remove_demo_data."""
        self._otm_demo_admin_check()
        if self.otm_demo_status()["count"]:
            raise UserError(self.env._("Demo data is already loaded. Remove it first to reload."))
        env = self.with_context(tracking_disable=True, mail_create_nolog=True, mail_notrack=True).sudo().env
        Lead, Log = env["crm.lead"], env["otm.ft.stage.log"]
        tag = env["crm.tag"].create({"name": DEMO_TAG})
        base_user = "base.group_user"
        du = {pre: self._otm_demo_user(f"demo.{pre}@{DEMO_DOMAIN}", nm, [base_user, ROLE_GROUPS[r]]) for pre, nm, r in DEMO_USERS}
        factory = env["res.company"].with_context(active_test=False).search([("name", "=", FACTORY_NAME)], limit=1) or env["res.company"].create({"name": FACTORY_NAME})
        du["factory"].write({"company_ids": [(6, 0, [factory.id])], "company_id": factory.id})
        users = {SM: du["sales1"], MGR: du["manager"], PM: du["pm1"], PROC: du["procurement"], ACC: du["accounts"]}
        sms = [du["sales1"], du["sales2"]]
        pms = [du["pm1"], du["pm2"]]
        for code, rn, cat_, unit_, rate_, cost_ in DEMO_RATES:
            if not env["otm.ft.rate"].with_context(active_test=False).search_count([("code", "=", code), ("company_id", "=", self.env.company.id)]):
                env["otm.ft.rate"].create({"code": code, "name": rn, "category": cat_, "unit": unit_, "rate": rate_, "cost": cost_, "company_id": self.env.company.id})
        for v in VENDORS:  # tagged vendors so removal is clean
            if not env["res.partner"].search([("name", "=", v)], limit=1):
                env["res.partner"].create({"name": v, "company_type": "company", "ref": DEMO_REF})
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
                vals["otm_project_manager_id"] = pms[i % 2].id
            lead = Lead.create(vals)
            env.cr.execute("UPDATE crm_lead SET create_date=%s WHERE id=%s", [created, lead.id])

            if rank >= ORDER.index("estimate_draft") and est:
                partner = env["res.partner"].create({"name": cust, "ref": DEMO_REF, "phone": vals["phone"], "email": vals["email_from"]})
                lead.partner_id = partner.id
                tax = lead._otm_sale_tax()
                order = env["sale.order"].create({
                    "partner_id": partner.id, "opportunity_id": lead.id,
                    "order_line": [(0, 0, {"name": n, "product_uom_qty": 1, "price_unit": round(est * share, 2), "tax_ids": [(6, 0, tax.ids)], "otm_category": LINE_META[n][0], "otm_unit": LINE_META[n][1]}) for n, share in EST_LINES],
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

            if rank >= ORDER.index("procurement_check") and est:
                cur = lead._otm_est_lines()
                lead._otm_snapshot_estimate("submit_to_procurement", lines=[dict(l, price=round(l["price"] * 0.92, 2)) for l in cur])
                lead._otm_snapshot_estimate("return_to_sales" if rank < ORDER.index("estimate_manager_review") else "approve")
            if rank >= ORDER.index("estimate_draft") and est:
                items = DESIGN_NAMES[: 2 + i % 3] + ([("Kitchen shop drawing", "shop_drawing"), ("Wardrobe shop drawing", "shop_drawing")] if rank >= ORDER.index("pm_assigned") else [])
                for k, (dn, dk) in enumerate(items):
                    st = "approved" if rank >= ORDER.index("client_approved") else DESIGN_STATUS[(i + k) % 4]
                    d = env["otm.ft.design"].create({
                        "lead_id": lead.id, "name": dn, "kind": dk, "status": st, "revision": 2 if st == "changes_requested" else 1,
                        "designer_id": users[SM].id, "due_date": (now + timedelta(days=5 + k)).date(), "note": "Client brief: warm, modern, maroon & gold accents.",
                        "review_note": "Please revise the material palette and lighting layout." if st == "changes_requested" else False,
                        "approved_by_id": users[MGR].id if st == "approved" else False, "approved_on": now if st == "approved" else False,
                    })
                    if st != "draft" or k % 2 == 0:
                        env["ir.attachment"].create({"name": f"{dk}-{k + 1}.png", "description": "r1", "datas": base64.b64encode(_png(PALETTE[(i + k) % 6])), "mimetype": "image/png", "res_model": "otm.ft.design", "res_id": d.id})
            if rank >= ORDER.index("procurement_approved") and lead.otm_procurement_line_ids:
                try:
                    with env.cr.savepoint():
                        lead._otm_make_pos()
                    today = fields.Date.context_today(lead)
                    for k, po in enumerate(env["purchase.order"].search([("otm_lead_id", "=", lead.id)], order="id")):
                        mode = 1 + (i + k) % 3 if rank >= ORDER.index("work_started") else (i + k) % 4
                        if mode == 0:
                            continue  # leave as draft: Procurement confirms it in the test
                        try:
                            with env.cr.savepoint():
                                po.otm_expected_date = today + timedelta(days={1: 10, 2: -6, 3: -20}[mode])
                                po.button_confirm()
                                lines = po.order_line.filtered(lambda l: not l.display_type)
                                if mode == 3:
                                    for l in lines:
                                        env["otm.ft.receipt"].create({"line_id": l.id, "qty": l.product_qty, "note": "Delivered in full", "user_id": users[PROC].id})
                                elif mode == 2 and lines:
                                    env["otm.ft.receipt"].create({"line_id": lines[0].id, "qty": lines[0].product_qty / 2, "note": "Part delivery", "user_id": users[PROC].id})
                        except Exception:
                            skipped += 1
                except Exception:  # purchase not fully configured: keep the lead, skip POs
                    skipped += 1

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
                    env["otm.ft.task"].create({"lead_id": lead.id, "name": nm, "kind": kd, "status": stt, "due_date": (now + timedelta(days=7)).date(), "user_id": lead.otm_project_manager_id.id})
                for k, (nm, q) in enumerate([("Wardrobe units", 4), ("Kitchen cabinets", 1), ("TV console & wall panel", 1), ("Vanity units", 3)]):
                    st = "installed" if done else ["installed", "ready", "finishing", "assembly"][k]
                    env["otm.ft.joinery"].create({"lead_id": lead.id, "name": nm, "qty": q, "stage": st, "due_date": (now + timedelta(days=10 + k * 3)).date()})
                for nm, kd, stt, dd in [("Site visit and measurement", "site_visit", "done", -20), ("Joinery installation - phase 1", "installation", "done" if done else "in_progress", -5), ("Final installation and touch-up", "installation", "done" if done else "planned", 5)]:
                    inst = env["otm.ft.install"].create({"lead_id": lead.id, "name": nm, "kind": kd, "status": stt, "planned_date": (now + timedelta(days=dd)).date(), "team": "Crew A: Ravi, Suresh"})
                    if stt != "planned":
                        for lab in ("before", "after") if stt == "done" else ("before",):
                            env["ir.attachment"].create({"name": f"{lab}.png", "description": lab, "datas": base64.b64encode(_png(PALETTE[(i + len(lab)) % 6])), "mimetype": "image/png", "res_model": "otm.ft.install", "res_id": inst.id})
                notes = ["Site mobilised, measurements verified", "Ceiling framing and electrical first fix done", "Joinery installation in progress", "Flooring and wall finishes completed", "Snagging and final touch-ups"]
                final = 100 if (age > 200 or rank > ORDER.index("work_started")) else rnd.choice([35, 55, 70])
                marks = [p for p in (15, 35, 55, 80, 100) if p <= final] or [final]
                for k, pc in enumerate(marks):
                    when = created + timedelta(days=age * 0.5 + k * max(age * 0.1, 1))
                    env["otm.ft.site.update"].create({"lead_id": lead.id, "percent": pc, "note": notes[k % 5], "user_id": lead.otm_project_manager_id.id, "date": min(when, now)})

            if rank >= ORDER.index("pm_assigned") and est:
                if rank >= ORDER.index("completed"):
                    ic_status = "received"
                elif rank >= ORDER.index("handover"):
                    ic_status = "delivered"
                elif rank >= ORDER.index("work_started"):
                    ic_status = IC_FLOW[i % 5]
                else:
                    ic_status = "draft"
                names = [(j.name, j.qty or 1.0) for j in lead.otm_joinery_ids] or [("Wardrobe units", 4.0), ("TV console & wall panel", 1.0), ("Vanity units", 3.0)]
                today = fields.Date.context_today(lead)
                order = env["otm.ft.ic.order"].create({
                    "lead_id": lead.id, "supplier_company_id": factory.id, "status": ic_status, "created_by": lead.otm_project_manager_id.id or users[PM].id,
                    "required_date": today + timedelta(days=-4 if (ic_status == "in_production" and i % 2) else 12), "note": "Please match the approved shop drawings and finish samples.",
                    "line_ids": [(0, 0, {"name": nm, "qty": q, "unit_price": round(rnd.choice([450, 780, 1200, 2100]), 2),
                                         "stage": "ready" if ic_status in ("ready", "delivered", "received") else (["cutting", "assembly", "finishing", "queued"][n % 4] if ic_status == "in_production" else "queued")}) for n, (nm, q) in enumerate(names)],
                })
                if ic_status == "rejected":
                    order.reject_reason = "Capacity full this month"

            if rank >= ORDER.index("invoice_draft") and est:
                untaxed_total = lead.order_ids.sorted("id")[-1:].amount_untaxed
                for k, (nm, kd, pc, tr) in enumerate([("Advance", "advance", 30, 0), ("Progress payment", "progress", 30, 50), ("Final payment", "final", 35, 0), ("Retention release", "retention", 5, 0)]):
                    ms = env["otm.ft.milestone"].create({"lead_id": lead.id, "sequence": (k + 1) * 10, "name": nm, "kind": kd, "percent": pc, "trigger_progress": tr,
                                                         "invoice_id": lead.otm_invoice_id.id if kd == "advance" and lead.otm_invoice_id else False})
                    eligible = (kd == "progress" and rank >= ORDER.index("work_started") and lead.otm_progress >= 50) or (kd == "final" and rank >= ORDER.index("handover")) or (kd == "retention" and stage == "completed")
                    if not eligible:
                        continue
                    overdue = (kd != "final" and i % 2 == 1) or (stage != "completed" and kd == "final")
                    try:
                        with env.cr.savepoint():
                            today = fields.Date.context_today(lead)
                            move = env["account.move"].create({
                                "move_type": "out_invoice", "partner_id": lead.partner_id.id, "invoice_origin": lead.name,
                                "invoice_date": today - timedelta(days=45), "invoice_date_due": today - timedelta(days=15 + i) if overdue else today + timedelta(days=20),
                                "invoice_line_ids": [(0, 0, {"name": f"{nm} - {lead.name}", "quantity": 1, "price_unit": round(untaxed_total * pc / 100.0, 2), "tax_ids": [(6, 0, lead._otm_sale_tax().ids)]})],
                            })
                            move.action_post()
                            ms.write({"invoice_id": move.id, "due_date": move.invoice_date_due})
                            if not overdue and journal:
                                env["account.payment.register"].with_context(active_model="account.move", active_ids=move.ids).create({"journal_id": journal.id}).action_create_payments()
                    except Exception:
                        skipped += 1
        work = Lead.search([("tag_ids", "in", tag.ids), ("otm_stage", "in", ["work_started", "handover", "completed"])])
        today = fields.Date.context_today(self)
        what = [("material", "Screws, anchors and adhesive"), ("transport", "Pickup for tile delivery"), ("labour", "Helper daily wage"), ("food", "Crew lunch at site"), ("tools", "Drill bits and blades"), ("fuel", "Van fuel"), ("other", "Parking and permits")]
        for hi, holder in enumerate((du["pm1"], du["pm2"], du["sales1"], du["procurement"])):
            env["otm.ft.petty"].create({"holder_id": holder.id, "kind": "topup", "amount": 3000, "description": "Opening float", "status": "approved", "reviewed_by": users[ACC].id, "reviewed_on": now, "date": today - timedelta(days=30)})
            for n in range(6):
                status = ["approved", "approved", "approved", "pending", "rejected", "approved"][n]
                cat, desc = what[(hi + n) % len(what)]
                t = env["otm.ft.petty"].create({
                    "holder_id": holder.id, "lead_id": work[(hi + n) % len(work)].id if work and n != 5 else False, "kind": "expense", "category": cat, "amount": rnd.choice([40, 85, 120, 260, 380]),
                    "date": today - timedelta(days=n * 3), "description": desc, "status": status,
                    "reviewed_by": users[ACC].id if status != "pending" else False, "reviewed_on": now if status != "pending" else False,
                    "reject_reason": "Receipt not readable" if status == "rejected" else False,
                })
                if n % 2 == 0:
                    env["ir.attachment"].create({"name": "receipt.png", "datas": base64.b64encode(_png(PALETTE[(hi + n) % 6])), "mimetype": "image/png", "res_model": "otm.ft.petty", "res_id": t.id})
        env["otm.ft.petty"].create({"holder_id": du["pm1"].id, "lead_id": work[0].id if work else False, "kind": "expense", "category": "material", "amount": 780, "date": today, "description": "Marine plywood, 12 sheets (above limit: Manager approval)", "status": "pending"})
        for pre, lead_name in DEMO_CUSTOMERS:
            lead = Lead.search([("name", "=", lead_name), ("tag_ids", "in", tag.ids)], limit=1)
            if lead.partner_id:
                self._otm_demo_user(f"demo.{pre}@{DEMO_DOMAIN}", lead.partner_id.name, ["base.group_portal"], partner=lead.partner_id)
        return {"created": len(DEMO), "invoices_skipped": skipped, "password": DEMO_PASS}

    @api.model
    def otm_remove_demo_data(self):
        self._otm_demo_admin_check()
        env = self.sudo().env
        tag = env["crm.tag"].search([("name", "=", DEMO_TAG)], limit=1)
        leads = env["crm.lead"].search([("tag_ids", "in", tag.ids)]) if tag else env["crm.lead"]
        kept = 0
        for lead in leads:
            for po in lead.otm_procurement_line_ids.purchase_id:
                try:
                    with env.cr.savepoint():
                        if po.state != "cancel":
                            po.button_cancel()
                        po.unlink()
                except Exception:
                    kept += 1
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
        env["otm.ft.rate"].with_context(active_test=False).search([("code", "=like", "DEMO-%")]).unlink()
        removed = len(leads)
        try:
            with env.cr.savepoint():
                leads.unlink()
        except Exception as e:
            raise UserError(self.env._("Could not remove some demo leads: %s", e))
        for partner in env["res.partner"].with_context(active_test=False).search([("ref", "=", DEMO_REF)]):
            try:
                with env.cr.savepoint():
                    partner.unlink()
            except Exception:
                pass  # still referenced (e.g. a paid invoice or PO was kept)
        tag.unlink()
        env["otm.ft.petty"].search([("holder_id.login", "=like", f"demo.%@{DEMO_DOMAIN}")]).unlink()
        # demo logins: portal ones are deleted; internal ones are archived (history references them) and reactivated on reload
        for u in env["res.users"].with_context(active_test=False).search([("login", "=like", f"demo.%@{DEMO_DOMAIN}")]):
            try:
                with env.cr.savepoint():
                    if u.share:
                        u.unlink()
                    else:
                        u.write({"active": False})
            except Exception:
                u.write({"active": False, "login": f"{u.login}.old{u.id}"})
        return {"removed": removed, "invoices_kept": kept}
