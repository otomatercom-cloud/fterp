// Pure SVG charts (server-renderable, no dependencies). Data comes from Odoo only.
type Pt = { x: number; y: number };

function smooth(p: Pt[]) {
  if (p.length < 2) return "";
  let d = `M${p[0].x},${p[0].y}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] ?? p2;
    d += ` C${p1.x + (p2.x - p0.x) / 6},${p1.y + (p2.y - p0.y) / 6} ${p2.x - (p3.x - p1.x) / 6},${p2.y - (p3.y - p1.y) / 6} ${p2.x},${p2.y}`;
  }
  return d;
}

export type Series = { name: string; color: string; values: number[] };

export function AreaChart({ labels, series, height = 220 }: { labels: string[]; series: Series[]; height?: number }) {
  const W = 640, H = height, L = 30, R = 10, T = 12, B = 26;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const top = Math.ceil(max / 4) * 4 || 4;
  const x = (i: number) => L + (i * (W - L - R)) / Math.max(1, labels.length - 1);
  const y = (v: number) => T + (1 - v / top) * (H - T - B);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Leads per month">
      <defs>
        {series.map((s, i) => (
          <linearGradient key={i} id={`ag${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={s.color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={s.color} stopOpacity="0" />
          </linearGradient>
        ))}
      </defs>
      {[0, 1, 2, 3, 4].map((g) => {
        const v = (top / 4) * g;
        return (
          <g key={g}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="rgba(217,143,160,0.14)" />
            <text x={L - 6} y={y(v) + 3} textAnchor="end" fontSize="10" fill="#b5a3a8">{Math.round(v)}</text>
          </g>
        );
      })}
      {labels.map((l, i) => (i % 2 === 0 || labels.length < 8) && <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="#b5a3a8">{l}</text>)}
      {series.map((s, i) => {
        const pts = s.values.map((v, k) => ({ x: x(k), y: y(v) }));
        const line = smooth(pts);
        return (
          <g key={i}>
            <path d={`${line} L${x(labels.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={`url(#ag${i})`} />
            <path d={line} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 6px ${s.color})` }} />
            {pts.map((p, k) => <circle key={k} cx={p.x} cy={p.y} r="3" fill={s.color}><title>{`${s.name} · ${labels[k]}: ${s.values[k]}`}</title></circle>)}
          </g>
        );
      })}
    </svg>
  );
}

export function Donut({ parts, size = 150 }: { parts: { label: string; value: number; color: string }[]; size?: number }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  const r = 52, c = 2 * Math.PI * r;
  let off = 0;
  return (
    <svg viewBox="0 0 140 140" width={size} height={size} role="img" aria-label="Leads by source">
      <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="16" />
      {total > 0 && parts.map((p, i) => {
        const len = (p.value / total) * c;
        const el = (
          <circle key={i} cx="70" cy="70" r={r} fill="none" stroke={p.color} strokeWidth="16" strokeDasharray={`${Math.max(0, len - 2)} ${c}`}
            strokeDashoffset={-off} transform="rotate(-90 70 70)" style={{ filter: `drop-shadow(0 0 5px ${p.color})` }}><title>{`${p.label}: ${p.value}`}</title></circle>
        );
        off += len;
        return el;
      })}
      <text x="70" y="68" textAnchor="middle" fontSize="22" fontWeight="600" fill="#f4ebe8">{total}</text>
      <text x="70" y="84" textAnchor="middle" fontSize="10" fill="#b5a3a8">leads</text>
    </svg>
  );
}

export function PillGauge({ label, percent, color }: { label: string; percent: number; color: string }) {
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-36 w-12 overflow-hidden rounded-full border border-line bg-white/5">
        <div className="absolute inset-x-1 bottom-1 rounded-full" style={{ height: `calc(${p}% - 8px)`, minHeight: p > 0 ? 22 : 0, background: `linear-gradient(180deg, ${color}, ${color}99)`, boxShadow: `0 0 14px ${color}88` }}>
          <span className="block pt-1 text-center text-[11px] font-semibold text-black/80">{p}%</span>
        </div>
      </div>
      <span className="max-w-20 text-center text-xs text-muted">{label}</span>
    </div>
  );
}
