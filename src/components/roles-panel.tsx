"use client";
import { useState, useTransition } from "react";
import { setUserRoleAction } from "@/app/(dashboard)/m/admin/actions";
import { ROLE_LABEL } from "@/lib/workflow/roles";
import type { UserRoles } from "@/lib/odoo/leads";

export function RolesPanel({ users }: { users: UserRoles[] }) {
  const [state, setState] = useState(users);
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();
  const toggle = (u: UserRoles, role: string, on: boolean) => start(async () => {
    const r = await setUserRoleAction(u.id, role, on);
    if (r.error) return setErr(r.error);
    setErr(undefined);
    setState((all) => all.map((x) => (x.id === u.id ? { ...x, roles: on ? [...x.roles, role] : x.roles.filter((y) => y !== role) } : x)));
  });
  return (
    <div className="glass space-y-3 overflow-x-auto p-5">
      <h2 className="font-semibold">Pipeline roles</h2>
      <p className="text-xs text-muted">Tick the roles each user holds. Changes apply in Odoo immediately; the user sees new menus after logging in again.</p>
      <table className="w-full text-sm">
        <thead><tr><th className="px-2 py-2 text-left text-xs font-medium text-muted">User</th>{Object.values(ROLE_LABEL).map((l) => <th key={l} className="px-2 py-2 text-center text-xs font-medium text-muted">{l}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">
          {state.map((u) => (
            <tr key={u.id}>
              <td className="px-2 py-2"><div>{u.name}</div><div className="text-xs text-muted">{u.login}</div></td>
              {Object.keys(ROLE_LABEL).map((r) => (
                <td key={r} className="px-2 py-2 text-center">
                  <input type="checkbox" aria-label={`${u.name}: ${ROLE_LABEL[r as keyof typeof ROLE_LABEL]}`} disabled={pending} checked={u.roles.includes(r)} onChange={(e) => toggle(u, r, e.target.checked)} className="size-4 accent-[#e8bf7e]" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
    </div>
  );
}
