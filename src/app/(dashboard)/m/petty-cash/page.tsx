import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { NAV, canSee } from "@/lib/permissions/nav";
import { getPetty, getPettySetup, getPettyStatement, type PettyData, type PettySetup, type PettyStatement } from "@/lib/odoo/leads";
import { PettyPanel } from "@/components/petty-panel";

export default async function PettyCashPage({ searchParams }: { searchParams: Promise<{ tab?: string; month?: string }> }) {
  const s = await requireSession();
  const item = NAV.find((n) => n.slug === "petty-cash");
  if (!item || !canSee(item, s.groups)) notFound();
  const q = await searchParams;
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(q.month ?? "") ? (q.month as string) : new Date().toISOString().slice(0, 7);
  let d: PettyData | null = null, setup: PettySetup | null = null, statement: PettyStatement = [];
  try { d = await getPetty(s); } catch { /* shown below */ }
  if (d?.can_review) setup = await getPettySetup(s).catch(() => null);
  if (d) statement = await getPettyStatement(s, month).catch(() => []);
  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-semibold">Petty Cash</h1><p className="text-sm text-muted">Site cash floats, expenses with receipts and approval</p></div>
      {d ? <PettyPanel d={d} setup={setup} statement={statement} month={month} initialTab={q.tab} /> : <p className="glass p-4 text-sm">Petty cash is not available. Check access and that the FT Pipeline module is upgraded.</p>}
    </div>
  );
}
