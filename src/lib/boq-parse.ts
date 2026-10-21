import readXlsx from "read-excel-file/node";
import { extractText, getDocumentProxy } from "unpdf";

export type ParsedLine = { name: string; qty: number; price: number; unit: string; category: string };

const KEYS: Record<string, RegExp> = {
  name: /^(description|item|items|particulars?|work|scope|details?|item description)$/i,
  qty: /^(qty|quantity|nos|no)$/i,
  unit: /^(unit|uom|units)$/i,
  price: /^(rate|price|unit price|unit rate|rate\s*\(.*\))$/i,
  amount: /^(amount|total|line total|value)$/i,
  category: /^(category|section|trade)$/i,
};
const GUESS: [string, RegExp][] = [
  ["joinery", /wardrobe|cabinet|joinery|carpentry|shelf|vanity|door|panel/i],
  ["ceiling", /ceiling|gypsum|cove/i],
  ["flooring", /floor|tile|marble|parquet|carpet|skirting/i],
  ["wall", /wall|paint|wallpaper|cladding/i],
  ["kitchen", /kitchen|countertop|hob/i],
  ["lighting", /light|lamp|led|chandelier/i],
  ["mep", /electric|plumb|socket|switch|pipe|ac |hvac|wiring/i],
  ["furniture", /sofa|bed|table|chair|furniture|curtain/i],
];
const CATS = ["joinery", "ceiling", "flooring", "wall", "kitchen", "lighting", "mep", "furniture", "other"];
const num = (v: unknown) => {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/[,\s]/g, "").replace(/^[A-Za-z$₹]+/, ""));
  return Number.isFinite(n) ? n : NaN;
};
const guess = (n: string) => GUESS.find(([, r]) => r.test(n))?.[0] ?? "other";

export function csvRows(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cur = "", q = false;
  const delim = (text.split("\n")[0].match(/;/g)?.length ?? 0) > (text.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cur); rows.push(row); row = []; cur = ""; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

export function fromRows(rows: unknown[][]): ParsedLine[] {
  const hi = rows.findIndex((r) => r.some((c) => KEYS.name.test(String(c ?? "").trim())) && r.some((c) => KEYS.qty.test(String(c ?? "").trim()) || KEYS.price.test(String(c ?? "").trim()) || KEYS.amount.test(String(c ?? "").trim())));
  if (hi < 0) throw new Error("Header row not found. First row needs columns like Description, Qty, Unit, Rate.");
  const idx: Record<string, number> = {};
  rows[hi].forEach((c, i) => { const t = String(c ?? "").trim(); for (const k in KEYS) if (idx[k] === undefined && KEYS[k].test(t)) idx[k] = i; });
  const out: ParsedLine[] = [];
  for (const r of rows.slice(hi + 1)) {
    const name = String(r[idx.name] ?? "").trim().slice(0, 200);
    if (!name) continue;
    let qty = idx.qty !== undefined ? num(r[idx.qty]) : 1;
    let price = idx.price !== undefined ? num(r[idx.price]) : NaN;
    const amt = idx.amount !== undefined ? num(r[idx.amount]) : NaN;
    if (!(qty > 0)) qty = Number.isNaN(amt) || !(price > 0) ? NaN : amt / price;
    if (Number.isNaN(price) && qty > 0 && !Number.isNaN(amt)) price = amt / qty;
    if (!(qty > 0) || Number.isNaN(price) || price < 0) continue; // section titles / totals
    const c = String(r[idx.category] ?? "").trim().toLowerCase();
    out.push({ name, qty: Math.round(qty * 1000) / 1000, price: Math.round(price * 100) / 100, unit: String(r[idx.unit] ?? "").trim().slice(0, 12), category: CATS.includes(c) ? c : guess(name) });
  }
  return out;
}

export function fromPdfText(text: string): ParsedLine[] {
  const out: ParsedLine[] = [];
  for (const raw of text.split(/\n/)) {
    const t = raw.replace(/\s+/g, " ").trim();
    // description  qty [unit] rate [amount]
    const m = t.match(/^(?:\d+[.)]?\s+)?(.*?[A-Za-z].*?)\s+(\d[\d,]*\.?\d*)\s+([A-Za-z²³.]{1,8})?\s*(\d[\d,]*\.?\d*)(?:\s+(\d[\d,]*\.?\d*))?$/);
    if (!m) continue;
    const qty = num(m[2]), price = num(m[4]);
    if (!(qty > 0) || Number.isNaN(price) || /total|subtotal|vat|tax/i.test(m[1])) continue;
    out.push({ name: m[1].trim().slice(0, 200), qty, price, unit: (m[3] ?? "").slice(0, 12), category: guess(m[1]) });
  }
  return out;
}

export async function parseBoq(name: string, buf: Buffer): Promise<ParsedLine[]> {
  const head = buf.subarray(0, 5).toString("latin1");
  const ext = name.toLowerCase().split(".").pop();
  let lines: ParsedLine[];
  if (ext === "pdf") {
    if (!head.startsWith("%PDF")) throw new Error("This is not a valid PDF.");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    lines = fromPdfText(text);
    if (!lines.length) throw new Error("No BOQ rows found in this PDF. Scanned PDFs are not supported — use Excel or CSV.");
  } else if (ext === "xlsx") {
    if (!head.startsWith("PK")) throw new Error("This is not a valid .xlsx file.");
    const sheets = (await readXlsx(buf)) as unknown as { data: unknown[][] }[];
    lines = fromRows(sheets[0]?.data ?? []);
  } else if (ext === "csv") {
    lines = fromRows(csvRows(buf.toString("utf8").replace(/^﻿/, "")));
  } else throw new Error("Upload an .xlsx, .csv or .pdf file.");
  if (!lines.length) throw new Error("No usable rows found (each row needs a description, quantity and rate).");
  return lines.slice(0, 200);
}
