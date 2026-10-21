import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { OdooError } from "@/lib/odoo/client";
import { getDoc } from "@/lib/odoo/leads";

const TYPES: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", csv: "text/csv", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  try {
    const d = await getDoc(s, id);
    const ext = d.name.toLowerCase().split(".").pop() ?? "";
    // type comes from the extension we validated at upload, never from the stored value; always a download
    return new NextResponse(Buffer.from(d.data, "base64"), { headers: { "Content-Type": TYPES[ext] ?? "application/octet-stream", "Content-Disposition": `attachment; filename="${d.name.replace(/[^\w.\- ]/g, "_")}"`, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof OdooError ? (e.code === "access" ? "You are not allowed to do this." : e.message) : "Failed" }, { status: 400 });
  }
}
