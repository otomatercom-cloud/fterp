import { getSession } from "@/lib/auth/session";
import { NAV, canSee } from "@/lib/permissions/nav";
import { ENTITIES } from "@/lib/io/entities";
import { writeTable } from "@/lib/io/table";

export async function GET(_: Request, { params }: { params: Promise<{ entity: string }> }) {
  const s = await getSession();
  const e = ENTITIES[(await params).entity];
  const nav = e && NAV.find((n) => n.slug === e.slug);
  if (!s || !e?.save || !nav || !canSee(nav, s.groups)) return new Response("Forbidden", { status: 403 });
  const cols = e.cols.filter((c) => !/export only/.test(c.label));
  const t = await writeTable(cols, [e.sample], "xlsx", e.label.slice(0, 30));
  return new Response(t.body as BodyInit, { headers: { "Content-Type": t.type, "Content-Disposition": `attachment; filename="ft-${e.key}-template.xlsx"`, "Cache-Control": "no-store" } });
}
