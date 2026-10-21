import { getSession } from "@/lib/auth/session";
import { NAV, canSee } from "@/lib/permissions/nav";
import { ENTITIES } from "@/lib/io/entities";
import { writeTable } from "@/lib/io/table";

export async function GET(req: Request, { params }: { params: Promise<{ entity: string }> }) {
  const s = await getSession();
  const e = ENTITIES[(await params).entity];
  const nav = e && NAV.find((n) => n.slug === e.slug);
  if (!s || !e || !nav || !canSee(nav, s.groups)) return new Response("Forbidden", { status: 403 });
  const fmt = new URL(req.url).searchParams.get("fmt") === "csv" ? "csv" : "xlsx";
  try {
    const t = await writeTable(e.cols, await e.list(s), fmt, e.label.slice(0, 30));
    return new Response(t.body as BodyInit, { headers: { "Content-Type": t.type, "Content-Disposition": `attachment; filename="ft-${e.key}.${fmt}"`, "Cache-Control": "no-store" } });
  } catch { return new Response("Export unavailable", { status: 502 }); }
}
