import "server-only";
import type { Session } from "@/lib/auth/session";
import { CATEGORIES } from "@/lib/workflow/boq";
import { createLead, getCustomers, getEmployees, getInvItems, getPos, getRates, reportRows, saveEmployee, saveInvItem, saveRate } from "@/lib/odoo/leads";
import { STAGE_LABELS, type Stage } from "@/lib/workflow/interior";
import type { Col } from "./table";

type Row = Record<string, string>;
export type Entity = {
  key: string; label: string; slug: string; cols: Col[]; sample: Row;
  list: (s: Session) => Promise<Record<string, unknown>[]>;
  /** Validate one imported row; return an error text or null. */
  check?: (r: Row) => string | null;
  /** Save one row (create or update). Returns "created" | "updated". */
  save?: (s: Session, r: Row, ctx: { existing: Map<string, number> }) => Promise<"created" | "updated">;
  existing?: (s: Session) => Promise<Map<string, number>>;
};

const catKey = (v: string) => { const t = v.trim().toLowerCase(); return Object.entries(CATEGORIES).find(([k, l]) => k === t || l.toLowerCase() === t)?.[0]; };
const nonNeg = (v: string) => v !== "" && Number.isFinite(Number(v)) && Number(v) >= 0;
const catList = Object.values(CATEGORIES).join(" / ");

const catCols = (extra: Col[]): Col[] => extra;

export const ENTITIES: Record<string, Entity> = {
  leads: {
    key: "leads", label: "Leads / Customers", slug: "crm",
    cols: [
      { key: "name", label: "Lead name", req: true }, { key: "partner_name", label: "Customer name", req: true },
      { key: "phone", label: "Phone" }, { key: "whatsapp", label: "WhatsApp" }, { key: "email", label: "Email" },
      { key: "person", label: "Contact person" }, { key: "address", label: "Address" },
      { key: "value", label: "Expected value", num: true }, { key: "source", label: "Source", hint: "Walk-in / Other" }, { key: "note", label: "Notes" },
    ],
    sample: { name: "Villa fit-out - Al Barsha", partner_name: "Mr. Rashid", phone: "+971500000000", whatsapp: "+971500000000", email: "rashid@example.com", person: "", address: "Al Barsha, Dubai", value: "150000", source: "Walk-in", note: "" },
    list: async (s) => (await reportRows(s)).map((r) => ({ name: r.name, partner_name: r.partner_name, stage: STAGE_LABELS[r.otm_stage as Stage] ?? r.otm_stage, source: r.otm_origin, manager: r.user_id ? r.user_id[1] : "", value: r.expected_revenue, estimate: r.otm_estimate_amount, procurement: r.otm_procurement_amount, progress: r.otm_progress, created: r.create_date })),
    check: (r) => (!r.name ? "Lead name is required" : !r.partner_name ? "Customer name is required" : r.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email) ? "Invalid email" : r.value && !nonNeg(r.value) ? "Expected value must be 0 or more" : null),
    save: async (s, r) => {
      await createLead(s, { type: "opportunity", name: r.name.slice(0, 120), partner_name: r.partner_name.slice(0, 120), phone: r.phone.slice(0, 30), email_from: r.email, expected_revenue: Number(r.value || 0),
        otm_origin: /walk/i.test(r.source) ? "walkin" : "other", description: r.note.slice(0, 2000), otm_whatsapp: r.whatsapp.slice(0, 40), otm_contact_person: r.person.slice(0, 120), otm_address: r.address.slice(0, 200) });
      return "created";
    },
  },
  rates: {
    key: "rates", label: "BOQ rate library", slug: "boq",
    cols: [{ key: "code", label: "Code", req: true }, { key: "name", label: "Name", req: true }, { key: "category", label: "Category", req: true, hint: catList }, { key: "unit", label: "Unit", req: true }, { key: "rate", label: "Sell rate", num: true, req: true }, { key: "cost", label: "Cost", num: true }],
    sample: { code: "WRD-001", name: "Wardrobe - laminate", category: "Joinery", unit: "sqm", rate: "850", cost: "600" },
    list: async (s) => (await getRates(s)).rates.map((r) => ({ ...r, category: CATEGORIES[r.category] ?? r.category })),
    check: (r) => (!r.code || !r.name || !r.unit ? "Code, name and unit are required" : !catKey(r.category) ? "Category must be one of: " + catList : !nonNeg(r.rate) ? "Sell rate must be 0 or more" : r.cost && !nonNeg(r.cost) ? "Cost must be 0 or more" : null),
    existing: async (s) => new Map((await getRates(s)).rates.map((r) => [r.code.toLowerCase(), r.id])),
    save: async (s, r, { existing }) => {
      const id = existing.get(r.code.toLowerCase());
      await saveRate(s, { ...(id ? { id } : {}), code: r.code, name: r.name, category: catKey(r.category), unit: r.unit, rate: Number(r.rate), cost: Number(r.cost || 0) } as never);
      return id ? "updated" : "created";
    },
  },
  items: {
    key: "items", label: "Inventory items", slug: "inventory",
    cols: [{ key: "code", label: "Code", req: true }, { key: "name", label: "Name", req: true }, { key: "category", label: "Category", req: true, hint: catList }, { key: "unit", label: "Unit", req: true }, { key: "min_qty", label: "Minimum stock", num: true }, { key: "description", label: "Description" }, { key: "on_hand", label: "On hand (export only)", num: true }, { key: "last_price", label: "Last price (export only)", num: true }, { key: "last_vendor", label: "Last vendor (export only)" }],
    sample: { code: "TILE-60", name: "Porcelain tile 60x60", category: "Flooring", unit: "sqm", min_qty: "20", description: "", on_hand: "", last_price: "", last_vendor: "" },
    list: async (s) => (await getInvItems(s)).items.map((i) => ({ ...i, category: CATEGORIES[i.category] ?? i.category })),
    check: (r) => (!r.code || !r.name || !r.unit ? "Code, name and unit are required" : !catKey(r.category) ? "Category must be one of: " + catList : r.min_qty && !nonNeg(r.min_qty) ? "Minimum stock must be 0 or more" : null),
    existing: async (s) => new Map((await getInvItems(s)).items.map((i) => [i.code.toLowerCase(), i.id])),
    save: async (s, r, { existing }) => {
      const id = existing.get(r.code.toLowerCase()) ?? 0;
      await saveInvItem(s, id, r.code, r.name, catKey(r.category)!, r.unit, Number(r.min_qty || 0), r.description);
      return id ? "updated" : "created";
    },
  },
  employees: {
    key: "employees", label: "Employees", slug: "hr",
    cols: [{ key: "code", label: "Code" }, { key: "name", label: "Name", req: true }, { key: "kind", label: "Type", req: true, hint: "office / site" }, { key: "pay_type", label: "Pay type", req: true, hint: "monthly / daily" }, { key: "rate", label: "Rate", num: true, req: true }, { key: "designation", label: "Designation" }, { key: "phone", label: "Phone" }, { key: "join_date", label: "Join date", hint: "YYYY-MM-DD" }],
    sample: { code: "E001", name: "Anil Kumar", kind: "site", pay_type: "daily", rate: "120", designation: "Carpenter", phone: "", join_date: "2026-01-15" },
    list: async (s) => (await getEmployees(s)).employees.map((e) => ({ ...e, join_date: e.join_date || "" })),
    check: (r) => (!r.name ? "Name is required" : !["office", "site"].includes(r.kind.toLowerCase()) ? "Type must be office or site" : !["monthly", "daily"].includes(r.pay_type.toLowerCase()) ? "Pay type must be monthly or daily" : !nonNeg(r.rate) ? "Rate must be 0 or more" : r.join_date && !/^\d{4}-\d{2}-\d{2}$/.test(r.join_date) ? "Join date must be YYYY-MM-DD" : null),
    existing: async (s) => new Map((await getEmployees(s)).employees.filter((e) => e.code).map((e) => [e.code.toLowerCase(), e.id])),
    save: async (s, r, { existing }) => {
      const id = r.code ? existing.get(r.code.toLowerCase()) : undefined;
      await saveEmployee(s, { ...(id ? { id } : {}), name: r.name, code: r.code, kind: r.kind.toLowerCase(), pay_type: r.pay_type.toLowerCase(), rate: Number(r.rate), designation: r.designation, phone: r.phone, join_date: r.join_date || false });
      return id ? "updated" : "created";
    },
  },
  customers: {
    key: "customers", label: "Customers", slug: "customers",
    cols: [{ key: "name", label: "Customer" }, { key: "person", label: "Contact person" }, { key: "phone", label: "Phone" }, { key: "whatsapp", label: "WhatsApp" }, { key: "email", label: "Email" }, { key: "address", label: "Address" }, { key: "projects", label: "Projects", num: true }, { key: "last_contact", label: "Last contact" }, { key: "next_followup", label: "Next follow-up" }],
    sample: {},
    list: async (s) => (await getCustomers(s)).customers.map((c) => ({ ...c, projects: c.projects.length, last_contact: c.last_contact || "", next_followup: c.next_followup || "" })),
  },
  pos: {
    key: "pos", label: "Purchase orders", slug: "procurement",
    cols: [{ key: "name", label: "PO" }, { key: "vendor", label: "Vendor" }, { key: "lead", label: "Project" }, { key: "state", label: "Status" }, { key: "receipt", label: "Receipt" }, { key: "untaxed", label: "Untaxed", num: true }, { key: "total", label: "Total", num: true }, { key: "expected", label: "Expected date" }],
    sample: {},
    list: async (s) => (await getPos(s)).orders.map((o) => ({ ...o, expected: o.expected || "" })),
  },
};
