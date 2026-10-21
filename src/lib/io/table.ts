import "server-only";
import readXlsx from "read-excel-file/node";
import writeXlsx from "write-excel-file/node";
import { csvRows } from "@/lib/boq-parse";

export type Col = { key: string; label: string; req?: boolean; num?: boolean; hint?: string };
const norm = (t: unknown) => String(t ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

const cellStr = (v: unknown): string => (v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? "" : String(v).trim());

/** Read an .xlsx/.csv into objects keyed by column key (header matched by label or key). */
export async function readTable(name: string, buf: Buffer, cols: Col[]): Promise<Record<string, string>[]> {
  const ext = name.toLowerCase().split(".").pop();
  let rows: unknown[][];
  if (ext === "xlsx") {
    if (!buf.subarray(0, 2).toString("latin1").startsWith("PK")) throw new Error("This is not a valid .xlsx file.");
    const sheets = (await readXlsx(buf)) as unknown as { data: unknown[][] }[];
    rows = sheets[0]?.data ?? [];
  } else if (ext === "csv") rows = csvRows(buf.toString("utf8").replace(/^﻿/, ""));
  else throw new Error("Upload an .xlsx or .csv file (download the template to start).");
  const hi = rows.findIndex((r) => r.filter((c) => cols.some((k) => norm(k.label) === norm(c) || k.key === norm(c))).length >= 2);
  if (hi < 0) throw new Error("Header row not found. Use the template columns: " + cols.map((c) => c.label).join(", "));
  const idx: Record<string, number> = {};
  rows[hi].forEach((c, i) => { const k = cols.find((x) => norm(x.label) === norm(c) || x.key === norm(c)); if (k && idx[k.key] === undefined) idx[k.key] = i; });
  const miss = cols.filter((c) => c.req && idx[c.key] === undefined).map((c) => c.label);
  if (miss.length) throw new Error("Missing column: " + miss.join(", "));
  const out = rows.slice(hi + 1).map((r) => Object.fromEntries(cols.map((c) => [c.key, idx[c.key] === undefined ? "" : cellStr(r[idx[c.key]])])));
  const data = out.filter((o) => Object.values(o).some((v) => v));
  if (!data.length) throw new Error("The file has no data rows.");
  if (data.length > 1000) throw new Error("Maximum 1000 rows per import.");
  return data;
}

// Spreadsheet formula-injection guard for exported text.
const safe = (v: unknown) => { const t = v === false || v == null ? "" : String(v); return /^[=+\-@\t\r]/.test(t) ? `'${t}` : t; };

export async function writeTable(cols: Col[], rows: Record<string, unknown>[], fmt: "xlsx" | "csv", sheet: string): Promise<{ body: Uint8Array | string; type: string }> {
  if (fmt === "csv") {
    const q = (v: unknown) => `"${safe(v).replace(/"/g, '""')}"`;
    return { body: "﻿" + [cols.map((c) => q(c.label)).join(","), ...rows.map((r) => cols.map((c) => q(r[c.key])).join(","))].join("\r\n"), type: "text/csv; charset=utf-8" };
  }
  const header = cols.map((c) => ({ value: c.label, fontWeight: "bold" as const, backgroundColor: "#f3e8e8" }));
  const data = rows.map((r) => cols.map((c) => (c.num && r[c.key] !== "" && r[c.key] != null && !Number.isNaN(Number(r[c.key])) ? { type: Number, value: Number(r[c.key]) } : { type: String, value: safe(r[c.key]) })));
  const buf = await writeXlsx([header, ...data] as never, { sheet, columns: cols.map((c) => ({ width: Math.max(12, c.label.length + 4) })) } as never).toBuffer();
  return { body: new Uint8Array(buf), type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
}
