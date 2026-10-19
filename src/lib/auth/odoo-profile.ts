import "server-only";
import { callKw } from "@/lib/odoo/client";
import type { Company } from "./session";

/** Loads allowed companies + group xmlids for the user, as reported by Odoo itself. */
export async function loadProfile(sessionId: string, uid: number): Promise<{ companies: Company[]; companyId: number; groups: string[] }> {
  const [u] = await callKw<{ company_id: [number, string]; company_ids: number[] }[]>(sessionId, "res.users", "read", [[uid], ["company_id", "company_ids"]]);
  const companies = await callKw<Company[]>(sessionId, "res.company", "read", [u.company_ids, ["name"]]);

  // Odoo 19 renamed res.users.groups_id -> group_ids; support both, fail closed (no groups) otherwise.
  let groupIds: number[] = [];
  for (const f of ["group_ids", "groups_id"]) {
    try {
      const r = await callKw<Record<string, number[]>[]>(sessionId, "res.users", "read", [[uid], [f]]);
      groupIds = r[0][f];
      break;
    } catch {
      /* try next field name */
    }
  }
  let groups: string[] = [];
  if (groupIds.length) {
    const rows = await callKw<{ module: string; name: string }[]>(sessionId, "ir.model.data", "search_read", [[["model", "=", "res.groups"], ["res_id", "in", groupIds]], ["module", "name"]]);
    groups = rows.map((r) => `${r.module}.${r.name}`);
  }
  return { companies: companies.map((c) => ({ id: c.id, name: c.name })), companyId: u.company_id[0], groups };
}
