import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { OdooError } from "@/lib/odoo/client";
import { getPettyStatementCsv } from "@/lib/odoo/leads";

export async function GET(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const month = new URL(req.url).searchParams.get("month") ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  try {
    const csv = await getPettyStatementCsv(s, month);
    return new NextResponse("﻿" + csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="petty-cash-${month}.csv"`, "Cache-Control": "private, no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof OdooError && e.code === "access" ? "Forbidden" : "Failed" }, { status: e instanceof OdooError && e.code === "access" ? 403 : 500 });
  }
}
