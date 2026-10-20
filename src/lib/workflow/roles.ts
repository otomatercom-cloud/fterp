import { TRANSITIONS, type Role } from "./interior.ts";

export const ROLE_GROUP: Record<Exclude<Role, "client">, string> = {
  sales_manager: "otm_ft_pipeline.group_ft_sales_manager",
  manager: "otm_ft_pipeline.group_ft_manager",
  project_manager: "otm_ft_pipeline.group_ft_project_manager",
  procurement: "otm_ft_pipeline.group_ft_procurement",
  accounts: "otm_ft_pipeline.group_ft_accounts",
};
export const ROLE_LABEL: Record<keyof typeof ROLE_GROUP, string> = {
  sales_manager: "Sales Manager", manager: "Manager", project_manager: "Project Manager", procurement: "Procurement", accounts: "Accounts",
};

export function rolesFromGroups(groups: string[]): (keyof typeof ROLE_GROUP)[] {
  const all = Object.keys(ROLE_GROUP) as (keyof typeof ROLE_GROUP)[];
  if (groups.includes("base.group_system")) return all;
  return all.filter((r) => groups.includes(ROLE_GROUP[r]));
}

type Term = string | [string, string, unknown];
/** Odoo domain (prefix notation) for leads that currently wait for this user to act. */
export function tasksDomain(roles: (keyof typeof ROLE_GROUP)[], uid: number): Term[] {
  const clauses: Term[][] = [];
  for (const r of roles) {
    const stages = [...new Set(TRANSITIONS.filter((t) => (t.by as string[]).includes(r)).map((t) => t.from))];
    if (!stages.length) continue;
    const st: Term = ["otm_stage", "in", stages];
    if (r === "sales_manager") clauses.push(["&", st, ["user_id", "=", uid]]);
    else if (r === "project_manager") clauses.push(["&", st, ["otm_project_manager_id", "=", uid]]);
    else clauses.push([st]);
  }
  if (!clauses.length) return [["id", "=", 0]];
  return clauses.reduce((acc, c) => (acc.length ? ["|", ...acc, ...c] : c), [] as Term[]);
}
