from datetime import timedelta

from odoo import api, fields, models
from odoo.exceptions import UserError

from .boq import CATEGORIES
from .crm_lead import ACC, MGR, PM, PROC

SOURCES = [("manual", "Manual entry"), ("procurement", "Procurement price"), ("po", "Purchase order")]


class OtmFtItem(models.Model):
    _name = "otm.ft.item"
    _description = "FT Inventory Item"
    _order = "category, name"

    code = fields.Char(required=True, index=True)
    name = fields.Char(required=True)
    category = fields.Selection(CATEGORIES, default="other", required=True)
    unit = fields.Char(default="nos", required=True)
    min_qty = fields.Float(string="Reorder level")
    description = fields.Char()
    active = fields.Boolean(default=True)
    price_ids = fields.One2many("otm.ft.price", "item_id")
    stock_ids = fields.One2many("otm.ft.stock", "item_id")

    _code_uniq = models.Constraint("unique(code)", "Item code must be unique.")


class OtmFtPrice(models.Model):
    _name = "otm.ft.price"
    _description = "FT Vendor Price History"
    _order = "date desc, id desc"

    item_id = fields.Many2one("otm.ft.item", required=True, ondelete="cascade", index=True)
    vendor = fields.Char(required=True, index=True)
    price = fields.Float(required=True)
    date = fields.Date(default=fields.Date.context_today, required=True)
    source = fields.Selection(SOURCES, default="manual", required=True)
    lead_id = fields.Many2one("crm.lead", ondelete="set null")
    user_id = fields.Many2one("res.users", default=lambda self: self.env.user)
    note = fields.Char()


class OtmFtStock(models.Model):
    _name = "otm.ft.stock"
    _description = "FT Stock Movement"
    _order = "date desc, id desc"

    item_id = fields.Many2one("otm.ft.item", required=True, ondelete="cascade", index=True)
    qty = fields.Float(required=True)  # signed: + in, - out
    kind = fields.Selection([("in", "Received"), ("out", "Issued"), ("adjust", "Count adjustment")], required=True)
    date = fields.Date(default=fields.Date.context_today)
    lead_id = fields.Many2one("crm.lead", ondelete="set null")
    po_id = fields.Many2one("purchase.order", ondelete="set null")
    user_id = fields.Many2one("res.users", default=lambda self: self.env.user)
    note = fields.Char()


class OtmFtProcLineItem(models.Model):
    _inherit = "otm.ft.procurement.line"

    item_id = fields.Many2one("otm.ft.item", string="Inventory item", ondelete="set null")


class PurchaseLineItem(models.Model):
    _inherit = "purchase.order.line"

    otm_item_id = fields.Many2one("otm.ft.item", ondelete="set null")


class CrmLeadInventory(models.Model):
    _inherit = "crm.lead"

    # ---- roles ----
    @api.model
    def _otm_inv_role(self, write=False):
        roles = self._otm_user_roles()
        ok = (PROC, MGR) if write else (PROC, MGR, PM, ACC)
        if not any(r in roles for r in ok):
            raise UserError(self.env._("Only Procurement or a Manager can change inventory.") if write else self.env._("Inventory is available to Procurement, Managers, Project Managers and Accounts."))
        return roles

    # ---- price book ----
    @api.model
    def _otm_record_price(self, item, vendor, price, source, lead=None, note=""):
        vendor = str(vendor or "").strip()[:120]
        if not item or not vendor or price is None or price <= 0:
            return False
        Price = self.env["otm.ft.price"].sudo()
        today = fields.Date.context_today(self)
        if Price.search_count([("item_id", "=", item.id), ("vendor", "=ilike", vendor), ("date", "=", today), ("price", "=", price)]):
            return False  # same quote already saved today
        Price.create({"item_id": item.id, "vendor": vendor, "price": price, "date": today, "source": source, "lead_id": lead.id if lead else False, "note": note[:120]})
        return True

    @api.model
    def _otm_item_stats(self, item):
        """Per-vendor stats from the price history (latest quote per vendor drives the comparison)."""
        by = {}
        for p in item.price_ids.sorted(lambda r: (r.date, r.id)):
            v = by.setdefault(p.vendor.strip().lower(), {"vendor": p.vendor.strip(), "prices": []})
            v["prices"].append(p)
        out = []
        for v in by.values():
            ps = v["prices"]
            vals = [x.price for x in ps]
            out.append({"vendor": v["vendor"], "latest": ps[-1].price, "latest_date": fields.Date.to_string(ps[-1].date), "avg": round(sum(vals) / len(vals), 2), "min": min(vals), "max": max(vals), "count": len(vals),
                        "trend": round((ps[-1].price - ps[0].price) / ps[0].price * 100, 1) if len(ps) > 1 and ps[0].price else 0.0})
        best = min((o["latest"] for o in out), default=0)
        for o in out:
            o["vs_best"] = round((o["latest"] - best) / best * 100, 1) if best else 0.0
        return sorted(out, key=lambda o: o["latest"])

    @api.model
    def _otm_item_dict(self, item, full=False):
        stats = self._otm_item_stats(item)
        on_hand = round(sum(item.stock_ids.mapped("qty")), 3)
        last = item.price_ids[:1]
        d = {"id": item.id, "code": item.code, "name": item.name, "category": item.category, "unit": item.unit, "min_qty": item.min_qty, "description": item.description or "",
             "on_hand": on_hand, "low": item.min_qty > 0 and on_hand <= item.min_qty,
             "last_price": last.price if last else 0.0, "last_vendor": last.vendor if last else "", "last_date": fields.Date.to_string(last.date) if last else False,
             "best_price": stats[0]["latest"] if stats else 0.0, "best_vendor": stats[0]["vendor"] if stats else "", "vendors": [{"vendor": s["vendor"], "latest": s["latest"]} for s in stats]}
        if full:
            d["stats"] = stats
            d["history"] = [{"id": p.id, "date": fields.Date.to_string(p.date), "vendor": p.vendor, "price": p.price, "source": p.source, "project": p.lead_id.name or "", "user": p.user_id.name or "", "note": p.note or ""} for p in item.price_ids[:300]]
            d["ledger"] = [{"id": m.id, "date": fields.Date.to_string(m.date), "kind": m.kind, "qty": m.qty, "project": m.lead_id.name or "", "po": m.po_id.name or "", "user": m.user_id.name or "", "note": m.note or ""} for m in item.stock_ids[:200]]
        return d

    # ---- API ----
    @api.model
    def otm_inv_items(self):
        roles = self._otm_inv_role()
        items = self.env["otm.ft.item"].sudo().search([], limit=1000)
        return {"can_edit": PROC in roles or MGR in roles, "items": [self._otm_item_dict(i) for i in items]}

    @api.model
    def otm_inv_item(self, item_id):
        roles = self._otm_inv_role()
        item = self.env["otm.ft.item"].sudo().browse(int(item_id))
        if not item.exists():
            raise UserError(self.env._("Item not found."))
        return dict(self._otm_item_dict(item, full=True), can_edit=PROC in roles or MGR in roles, can_issue=any(r in roles for r in (PROC, MGR, PM)))

    @api.model
    def otm_inv_item_save(self, item_id, code, name, category, unit, min_qty, description=""):
        self._otm_inv_role(write=True)
        code, name, unit = str(code or "").strip().upper()[:30], str(name or "").strip()[:200], str(unit or "").strip()[:12]
        min_qty = float(min_qty or 0)
        if not code or not name or not unit or category not in dict(CATEGORIES) or min_qty < 0:
            raise UserError(self.env._("Enter a code, name, category and unit."))
        Item = self.env["otm.ft.item"].sudo().with_context(active_test=False)
        if Item.search_count([("code", "=", code), ("id", "!=", int(item_id or 0))]):
            raise UserError(self.env._("Item code %s already exists.", code))
        vals = {"code": code, "name": name, "category": category, "unit": unit, "min_qty": min_qty, "description": str(description or "").strip()[:200]}
        if item_id:
            item = Item.browse(int(item_id))
            if not item.exists():
                raise UserError(self.env._("Item not found."))
            item.write(vals)
        else:
            item = Item.create(vals)
        return item.id

    @api.model
    def otm_inv_item_archive(self, item_id):
        self._otm_inv_role(write=True)
        self.env["otm.ft.item"].sudo().browse(int(item_id)).write({"active": False})
        return True

    @api.model
    def otm_inv_price_add(self, item_id, vendor, price, date=False, note=""):
        self._otm_inv_role(write=True)
        item = self.env["otm.ft.item"].sudo().browse(int(item_id))
        price = round(float(price or 0), 4)
        if not item.exists() or not str(vendor or "").strip() or price <= 0 or price > 1e9:
            raise UserError(self.env._("Enter a vendor and a price above 0."))
        self.env["otm.ft.price"].sudo().create({"item_id": item.id, "vendor": str(vendor).strip()[:120], "price": price, "date": date or fields.Date.context_today(self), "source": "manual", "note": str(note or "").strip()[:120]})
        return True

    @api.model
    def otm_inv_stock_move(self, item_id, kind, qty, note="", lead_id=False):
        roles = self._otm_inv_role()
        item = self.env["otm.ft.item"].sudo().browse(int(item_id))
        qty = round(float(qty if qty is not None else -1), 3)
        note = str(note or "").strip()[:200]
        if not item.exists() or qty < 0 or kind not in ("in", "out", "adjust"):
            raise UserError(self.env._("Enter a valid quantity."))
        on_hand = sum(item.stock_ids.mapped("qty"))
        lead = self.browse(int(lead_id)) if lead_id else self.browse()
        if kind in ("in", "adjust") and PROC not in roles and MGR not in roles:
            raise UserError(self.env._("Only Procurement or a Manager can add stock or record a count."))
        if kind == "out":
            if qty <= 0:
                raise UserError(self.env._("Enter a quantity above 0."))
            if PM in roles and PROC not in roles and MGR not in roles:
                if not lead or lead.otm_project_manager_id != self.env.user:
                    raise UserError(self.env._("Choose one of your own projects to issue material to."))
            if lead:
                lead.check_access("read")
            if qty > on_hand + 1e-6:
                raise UserError(self.env._("Only %s %s in stock.", on_hand, item.unit))
            signed = -qty
        elif kind == "in":
            if qty <= 0:
                raise UserError(self.env._("Enter a quantity above 0."))
            signed = qty
        else:  # adjust: qty is the counted quantity
            signed = round(qty - on_hand, 3)
            if not signed:
                return True
            if not note:
                raise UserError(self.env._("Write the reason for the count difference (%s).", signed))
        self.env["otm.ft.stock"].sudo().create({"item_id": item.id, "qty": signed, "kind": kind, "lead_id": lead.id or False, "note": note})
        if item.min_qty > 0 and on_hand + signed <= item.min_qty:
            self._otm_notify(self._otm_hook_users("procurement"), f"Low stock: {item.name}", f"{on_hand + signed:g} {item.unit} left (reorder level {item.min_qty:g}).", f"/m/inventory/{item.id}", "alert")
        return True

    @api.model
    def _otm_stock_receive(self, po_line, qty):
        """Goods received on a PO line linked to an inventory item go into stock."""
        if po_line.otm_item_id and qty > 0:
            self.env["otm.ft.stock"].sudo().create({"item_id": po_line.otm_item_id.id, "qty": qty, "kind": "in", "po_id": po_line.order_id.id, "lead_id": po_line.order_id.otm_lead_id.id or False, "note": po_line.order_id.name})

    @api.model
    def _otm_record_po_prices(self, po):
        for l in po.order_line:
            if l.otm_item_id:
                self._otm_record_price(l.otm_item_id, po.partner_id.name, l.price_unit, "po", po.otm_lead_id)
