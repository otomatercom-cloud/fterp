import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { OdooError } from "@/lib/odoo/client";
import { addInstallPhoto } from "@/lib/odoo/leads";

const MAX = 5 * 1024 * 1024;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const fd = await req.formData().catch(() => null);
  const file = fd?.get("file");
  const label = fd?.get("label");
  if (!(file instanceof File) || (label !== "before" && label !== "after")) return NextResponse.json({ error: "Choose a photo and its type." }, { status: 400 });
  if (file.size === 0 || file.size > MAX) return NextResponse.json({ error: "Photo must be up to 5 MB." }, { status: 413 });
  try {
    // Odoo re-checks role, size and the real image type (magic bytes), not just the extension.
    await addInstallPhoto(s, id, label, file.name, Buffer.from(await file.arrayBuffer()).toString("base64"));
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof OdooError ? (e.code === "access" ? "You are not allowed to do this." : e.message) : "Upload failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
