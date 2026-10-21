import { NextResponse } from "next/server";

// The Odoo PDF report needs wkhtmltopdf on the Odoo server. The branded print page works everywhere
// (Print / Save as PDF), so the old link now goes there.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  return NextResponse.redirect(new URL(`/print/invoice/${id}`, req.url));
}
