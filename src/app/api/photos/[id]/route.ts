import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { OdooError } from "@/lib/odoo/client";
import { getPhoto } from "@/lib/odoo/leads";

const OK = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  try {
    const p = await getPhoto(s, id);
    if (!OK.has(p.mimetype)) return NextResponse.json({ error: "Unsupported" }, { status: 415 });
    return new NextResponse(Buffer.from(p.data, "base64"), { headers: { "Content-Type": p.mimetype, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=300" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof OdooError ? "Not available" : "Failed" }, { status: e instanceof OdooError && e.code === "access" ? 403 : 404 });
  }
}
