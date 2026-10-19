import Link from "next/link";
import { FLOWS } from "@/lib/flows";
import { FlowDiagram } from "@/components/flow-diagram";
import { requireSession } from "@/lib/auth/session";

export default async function ProcessFlow({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  await requireSession();
  const { f } = await searchParams;
  const flow = FLOWS.find((x) => x.slug === f) ?? FLOWS[0];
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Process Flow</h1>
      <nav aria-label="Diagrams" className="flex gap-2 overflow-x-auto pb-1">
        {FLOWS.map((x) => (
          <Link key={x.slug} href={`/m/process-flow?f=${x.slug}`} className={`shrink-0 rounded-md border px-3 py-2 text-sm ${x.slug === flow.slug ? "border-primary bg-primary text-white" : "border-line hover:bg-tint"}`}>{x.title}</Link>
        ))}
      </nav>
      <FlowDiagram flow={flow} />
    </div>
  );
}
