import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { NAV, canSee } from "@/lib/permissions/nav";
import { getPetty, type PettyData } from "@/lib/odoo/leads";
import { PettyPanel } from "@/components/petty-panel";

export default async function PettyCashPage() {
  const s = await requireSession();
  const item = NAV.find((n) => n.slug === "petty-cash");
  if (!item || !canSee(item, s.groups)) notFound();
  let d: PettyData | null = null;
  try { d = await getPetty(s); } catch { /* shown below */ }
  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-semibold">Petty Cash</h1><p className="text-sm text-muted">Site cash floats, expenses with receipts and approval</p></div>
      {d ? <PettyPanel d={d} /> : <p className="glass p-4 text-sm">Petty cash is not available. Check access and that the FT Pipeline module is upgraded.</p>}
    </div>
  );
}
