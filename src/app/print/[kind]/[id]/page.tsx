import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { OdooError } from "@/lib/odoo/client";
import { docPrint } from "@/lib/odoo/leads";
import { PrintButton } from "@/components/print-button";
import { PrintDoc } from "@/components/print-docs";

export const metadata = { title: "Print document" };
const KINDS = ["invoice", "quotation", "po", "receipt", "payslip", "handover"];

export default async function PrintPage({ params }: { params: Promise<{ kind: string; id: string }> }) {
  const s = await requireSession();
  const { kind, id } = await params;
  const n = Number(id);
  if (!KINDS.includes(kind) || !Number.isInteger(n) || n <= 0) notFound();
  let d;
  try { d = await docPrint(s, kind, n); } catch (e) {
    return <main className="grid min-h-screen place-items-center bg-white p-6 text-neutral-900"><p role="alert" className="max-w-md text-center text-sm">{e instanceof OdooError ? (e.code === "access" ? "You are not allowed to print this document." : e.message) : "This document is not available."}</p></main>;
  }
  return (
    <main className="min-h-screen bg-neutral-200 p-4 print:bg-white print:p-0">
      <div className="mx-auto max-w-[21cm]"><PrintButton /></div>
      <PrintDoc d={d} />
    </main>
  );
}
