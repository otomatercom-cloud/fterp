import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { NAV, canSee } from "@/lib/permissions/nav";
import { OdooError } from "@/lib/odoo/client";
import { ENTITIES } from "@/lib/io/entities";
import { readTable } from "@/lib/io/table";

const MAX = 5 * 1024 * 1024;

/** POST file (+ commit=1). Without commit: validate and preview. With commit: save valid rows one by one. */
export async function POST(req: Request, { params }: { params: Promise<{ entity: string }> }) {
  const s = await getSession();
  const e = ENTITIES[(await params).entity];
  const nav = e && NAV.find((n) => n.slug === e.slug);
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!e?.save || !nav || !canSee(nav, s.groups)) return NextResponse.json({ error: "You are not allowed to import here." }, { status: 403 });
  const fd = await req.formData().catch(() => null);
  const file = fd?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file." }, { status: 400 });
  if (file.size === 0 || file.size > MAX) return NextResponse.json({ error: "File must be up to 5 MB." }, { status: 413 });
  try {
    const rows = await readTable(file.name, Buffer.from(await file.arrayBuffer()), e.cols.filter((c) => !/export only/.test(c.label)));
    const errs = rows.map((r) => e.check?.(r) ?? null);
    if (fd?.get("commit") !== "1") {
      const existing = e.existing ? await e.existing(s) : new Map<string, number>();
      return NextResponse.json({ cols: e.cols.filter((c) => !/export only/.test(c.label)).map((c) => ({ key: c.key, label: c.label })), rows: rows.map((r, i) => ({ ...r, _error: errs[i], _action: errs[i] ? "" : r.code && existing.has(r.code.toLowerCase()) ? "update" : "create" })) });
    }
    const existing = e.existing ? await e.existing(s) : new Map<string, number>();
    const res = { created: 0, updated: 0, failed: [] as { row: number; error: string }[] };
    for (let i = 0; i < rows.length; i++) {
      if (errs[i]) { res.failed.push({ row: i + 1, error: errs[i]! }); continue; }
      try { (await e.save(s, rows[i], { existing })) === "created" ? res.created++ : res.updated++; }
      catch (x) { res.failed.push({ row: i + 1, error: x instanceof OdooError ? (x.code === "access" ? "Not allowed" : x.message) : "Failed" }); }
    }
    return NextResponse.json(res);
  } catch (x) {
    return NextResponse.json({ error: x instanceof Error ? x.message : "Could not read the file." }, { status: 400 });
  }
}
