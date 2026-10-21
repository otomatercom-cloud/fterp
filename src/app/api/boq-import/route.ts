import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { parseBoq } from "@/lib/boq-parse";

const MAX = 5 * 1024 * 1024;

export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file." }, { status: 400 });
  if (file.size === 0 || file.size > MAX) return NextResponse.json({ error: "File must be up to 5 MB." }, { status: 413 });
  try {
    return NextResponse.json({ lines: await parseBoq(file.name, Buffer.from(await file.arrayBuffer())) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not read the file." }, { status: 400 });
  }
}
