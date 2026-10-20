"use client";
import { useState } from "react";
import { Minus, Plus, Maximize2, RotateCcw } from "lucide-react";
import type { Flow, FNode, Kind } from "@/lib/flows";

const W = 156, H = 48, GX = 196, GY = 92, PAD = 24;
const pos = (n: FNode) => ({ x: PAD + n.c * GX, y: PAD + n.r * GY });
const style: Record<Kind, { fill: string; stroke: string; text: string }> = {
  pm: { fill: "#6b293b", stroke: "#6b293b", text: "#fff" },
  step: { fill: "#fff", stroke: "#e8e0e2", text: "#222" },
  client: { fill: "#f0fdf4", stroke: "#16a34a", text: "#166534" },
  alert: { fill: "#fef2f2", stroke: "#dc2626", text: "#991b1b" },
};

function wrap(s: string, max = 22): string[] {
  const out: string[] = [];
  let cur = "";
  for (const w of s.split(" ")) {
    if ((cur + " " + w).trim().length > max && cur) { out.push(cur); cur = w; } else cur = (cur + " " + w).trim();
  }
  out.push(cur);
  return out.slice(0, 3);
}

function path(a: FNode, b: FNode): string {
  const pa = pos(a), pb = pos(b);
  const ax = pa.x + W / 2, ay = pa.y + H / 2, bx = pb.x + W / 2, by = pb.y + H / 2;
  if (a.r === b.r) return ax < bx ? `M${pa.x + W},${ay} L${pb.x},${by}` : `M${pa.x},${ay} L${pb.x + W},${by}`;
  if (a.c === b.c) return ay < by ? `M${ax},${pa.y + H} L${bx},${pb.y}` : `M${ax},${pa.y} L${bx},${pb.y + H}`;
  // elbow: leave vertically, enter horizontally
  const sy = ay < by ? pa.y + H : pa.y;
  const ex = ax < bx ? pb.x : pb.x + W;
  return `M${ax},${sy} L${ax},${by} L${ex},${by}`;
}

export function FlowDiagram({ flow }: { flow: Flow }) {
  const [zoom, setZoom] = useState<number | "fit">(1);
  const byId = new Map(flow.nodes.map((n) => [n.id, n]));
  const cols = Math.max(...flow.nodes.map((n) => n.c)) + 1, rows = Math.max(...flow.nodes.map((n) => n.r)) + 1;
  const vw = PAD * 2 + (cols - 1) * GX + W, vh = PAD * 2 + (rows - 1) * GY + H;
  const width = zoom === "fit" ? "100%" : vw * zoom;
  const z = typeof zoom === "number" ? zoom : 1;
  return (
    <section aria-label={flow.title} className="rounded-lg border border-line bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
        <p className="mr-auto rounded bg-tint px-2 py-1 text-xs text-muted">Illustrative process — not live transaction status</p>
        {[
          { l: "Zoom out", i: Minus, f: () => setZoom(Math.max(0.5, z - 0.25)) },
          { l: "Zoom in", i: Plus, f: () => setZoom(Math.min(2, z + 0.25)) },
          { l: "Fit to screen", i: Maximize2, f: () => setZoom("fit") },
          { l: "Reset", i: RotateCcw, f: () => setZoom(1) },
        ].map(({ l, i: I, f }) => (
          <button key={l} aria-label={l} title={l} onClick={f} className="grid size-9 place-items-center rounded-md border border-line hover:bg-tint"><I className="size-4" /></button>
        ))}
      </div>
      <div className="overflow-auto p-2" style={{ maxHeight: "75dvh" }}>
        <svg viewBox={`0 0 ${vw} ${vh}`} width={width} role="img" aria-label={flow.title} style={{ maxWidth: zoom === "fit" ? "100%" : "none" }}>
          <defs>
            {[["a", "#d9c2c6"], ["l", "#c99a9d"]].map(([id, c]) => (
              <marker key={id} id={`ar-${id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill={c} /></marker>
            ))}
          </defs>
          {flow.edges.map((e, i) => {
            const a = byId.get(e.from), b = byId.get(e.to);
            if (!a || !b) return null;
            return <path key={i} d={path(a, b)} fill="none" stroke={e.loop ? "#c99a9d" : "#d9c2c6"} strokeWidth={1.5} strokeDasharray={e.loop ? "5 4" : undefined} markerEnd={`url(#ar-${e.loop ? "l" : "a"})`} />;
          })}
          {flow.nodes.map((n) => {
            const p = pos(n), s = style[n.kind ?? "step"], lines = wrap(n.label);
            return (
              <g key={n.id}>
                <rect x={p.x} y={p.y} width={W} height={H} rx={8} fill={s.fill} stroke={s.stroke} strokeWidth={1.5} />
                <text x={p.x + W / 2} y={p.y + H / 2 - ((lines.length - 1) * 7)} textAnchor="middle" dominantBaseline="central" fontSize={12.5} fontWeight={600} fill={s.text}>
                  {lines.map((t, i) => <tspan key={i} x={p.x + W / 2} dy={i === 0 ? 0 : 14}>{t}</tspan>)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      {flow.note && <p className="border-t border-line p-3 text-xs text-muted">{flow.note}</p>}
    </section>
  );
}
