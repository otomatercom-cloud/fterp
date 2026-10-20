import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { OdooError } from "@/lib/odoo/client";
import { addDesignFile } from "@/lib/odoo/leads";

const MAX = 7 * 1024 * 1024;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file." }, { status: 400 });
  if (file.size === 0 || file.size > MAX) return NextResponse.json({ error: "File must be up to 7 MB." }, { status: 413 });
  try {
    // Odoo re-checks role, size and the real file type (magic bytes).
    await addDesignFile(s, id, file.name, Buffer.from(await file.arrayBuffer()).toString("base64"));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof OdooError ? (e.code === "access" ? "You are not allowed to do this." : e.message) : "Upload failed" }, { status: 400 });
  }
}
