import Link from "next/link";
import { GUIDE, PHASES, STAGE_PHASE, stageActors } from "@/lib/workflow/guide";
import { ROLE_LABEL, rolesFromGroups } from "@/lib/workflow/roles";
import type { Stage } from "@/lib/workflow/interior";

export function ProjectGuide({ stage, groups }: { stage: Stage; groups: string[] }) {
  const g = GUIDE[stage];
  if (!g) return null;
  const phase = STAGE_PHASE[stage];
  const mine = rolesFromGroups(groups);
  const actors = stageActors(stage);
  const canAct = actors.some((a) => (mine as string[]).includes(a));
  const done = stage === "completed";
  return (
    <section className="glass space-y-3 p-5" aria-label="What to do next">
      <ol className="flex gap-1 overflow-x-auto pb-1 text-[11px]" aria-label="Project phases">
        {PHASES.map((p, i) => {
          const state = done || i < phase ? "done" : i === phase ? "now" : "todo";
          return <li key={p} aria-current={state === "now" ? "step" : undefined} className={`flex-1 whitespace-nowrap rounded-full border px-2 py-1 text-center ${state === "now" ? "border-gold bg-tint font-semibold text-gold" : state === "done" ? "border-success/50 text-success" : "border-line text-muted"}`}>{state === "done" ? "✓ " : `${i + 1}. `}{p}</li>;
        })}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{g.title}</h2>
        <span className={`rounded-full border px-2.5 py-0.5 text-xs ${canAct ? "border-gold text-gold" : "border-line text-muted"}`}>{canAct ? "Your turn" : `Waiting for ${g.owner}`}</span>
      </div>
      <p className="text-xs text-muted">Responsible: {actors.length ? actors.map((a) => ROLE_LABEL[a as keyof typeof ROLE_LABEL] ?? a).join(" / ") : g.owner}</p>
      <ol className="list-decimal space-y-1 pl-5 text-sm">{g.steps.map((x) => <li key={x}>{x}</li>)}</ol>
      {g.link && canAct && <Link href={g.link.href} className="inline-block rounded border border-gold/50 px-3 py-1 text-xs text-gold hover:bg-tint">{g.link.label} →</Link>}
      <div className="grid gap-2 text-xs text-muted sm:grid-cols-2">
        <p><b className="text-ink">After this:</b> {g.next}</p>
        {g.ifWrong && <p><b className="text-ink">If something is wrong:</b> {g.ifWrong}</p>}
      </div>
    </section>
  );
}
