import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { OdooError, odooGetPdf } from "@/lib/odoo/client";
import { getInvoice } from "@/lib/odoo/leads";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  try {
    const inv = await getInvoice(s, id);
    if (!inv || inv.state !== "posted") return NextResponse.json({ error: "No posted invoice" }, { status: 404 });
    const pdf = await odooGetPdf(s.sessionId, `/report/pdf/account.report_invoice/${inv.id}`);
    return new NextResponse(pdf, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${inv.name.replace(/[^\w.-]/g, "_")}.pdf"`, "Cache-Control": "private, no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof OdooError ? e.message : "Failed" }, { status: e instanceof OdooError && e.code === "access" ? 403 : 502 });
  }
}
