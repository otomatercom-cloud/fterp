import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { OdooError } from "@/lib/odoo/client";
import { addDoc } from "@/lib/odoo/leads";

const MAX = 5 * 1024 * 1024;
const KINDS = ["contract", "quotation", "lpo", "id", "vendor_bill", "receipt", "other"];
// extension -> magic-byte check
const SIG: Record<string, (b: Buffer) => boolean> = {
  pdf: (b) => b.subarray(0, 4).toString("latin1") === "%PDF",
  png: (b) => b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
  jpg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  jpeg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  xlsx: (b) => b.subarray(0, 2).toString("latin1") === "PK",
  docx: (b) => b.subarray(0, 2).toString("latin1") === "PK",
  csv: (b) => !b.subarray(0, 2000).includes(0),
};

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const fd = await req.formData().catch(() => null);
  const file = fd?.get("file"), kind = String(fd?.get("kind") ?? "");
  if (!(file instanceof File) || !KINDS.includes(kind)) return NextResponse.json({ error: "Choose a file and a document type." }, { status: 400 });
  if (file.size === 0 || file.size > MAX) return NextResponse.json({ error: "File must be up to 5 MB." }, { status: 413 });
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  const buf = Buffer.from(await file.arrayBuffer());
  if (!SIG[ext] || !SIG[ext](buf)) return NextResponse.json({ error: "Allowed files: PDF, PNG, JPG, XLSX, DOCX, CSV." }, { status: 400 });
  try {
    await addDoc(s, id, file.name, buf.toString("base64"), kind);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof OdooError ? (e.code === "access" ? "You are not allowed to do this." : e.message) : "Upload failed" }, { status: 400 });
  }
}
