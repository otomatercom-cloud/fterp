import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { OdooError } from "@/lib/odoo/client";
import { getPettyFile } from "@/lib/odoo/leads";

const OK = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  try {
    const f = await getPettyFile(s, id);
    if (!OK.has(f.mimetype)) return NextResponse.json({ error: "Unsupported" }, { status: 415 });
    return new NextResponse(Buffer.from(f.data, "base64"), { headers: { "Content-Type": f.mimetype, "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox", "Cache-Control": "private, max-age=300" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof OdooError ? "Not available" : "Failed" }, { status: e instanceof OdooError && e.code === "access" ? 403 : 404 });
  }
}
