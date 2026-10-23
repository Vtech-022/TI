// Gráficos da visão geral em SVG: barras (uma série) e rosca (prioridades), com dica ao passar o mouse.
import { useState } from 'react';

interface Tip {
  x: number;
  y: number;
  title: string;
  value: string;
}

function Tooltip({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  return (
    <div className="chart-tip" style={{ left: tip.x, top: tip.y }} role="status">
      <div className="ct-title">{tip.title}</div>
      <div className="ct-value">{tip.value}</div>
    </div>
  );
}

function niceMax(v: number): number {
  if (v <= 5) return 5;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  const step = n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

export function BarChart({ data, unit, onSelect }: { data: { label: string; full: string; value: number }[]; unit: string; onSelect?: (full: string) => void }) {
  const [tip, setTip] = useState<Tip | null>(null);
  const W = 640;
  const H = 240;
  const pad = { l: 34, r: 12, t: 12, b: 34 };
  const max = niceMax(Math.max(1, ...data.map((d) => d.value)));
  const ticks = Array.from({ length: 6 }, (_, i) => Math.round((max / 5) * i));
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const band = plotW / Math.max(data.length, 1);
  const barW = Math.min(46, band * 0.5);
  const y = (v: number) => pad.t + plotH - (v / max) * plotH;
  return (
    <div className="chart-wrap" onMouseLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Gráfico de barras: ${data.map((d) => `${d.full} ${d.value}`).join(', ')}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="grid" />
            <text x={pad.l - 8} y={y(t) + 4} className="tick" textAnchor="end">
              {t}
            </text>
          </g>
        ))}
        {data.map((_, i) => (
          <line key={`v${i}`} x1={pad.l + band * (i + 1)} x2={pad.l + band * (i + 1)} y1={pad.t} y2={pad.t + plotH} className="grid" />
        ))}
        {data.map((d, i) => {
          const x = pad.l + band * i + (band - barW) / 2;
          const h = Math.max((d.value / max) * plotH, d.value ? 2 : 0);
          const top = pad.t + plotH - h;
          const r = Math.min(4, h / 2);
          return (
            <g
              key={d.full}
              className="bar-g"
              onMouseMove={(e) => {
                const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                setTip({ x: e.clientX - box.left, y: e.clientY - box.top, title: d.full, value: `${d.value} ${unit}` });
              }}
              onClick={() => onSelect?.(d.full)}
              style={{ cursor: onSelect ? 'pointer' : 'default' }}
            >
              <rect x={pad.l + band * i} y={pad.t} width={band} height={plotH} fill="transparent" />
              {h > 0 && <path className="bar" d={`M${x},${pad.t + plotH} V${top + r} a${r},${r} 0 0 1 ${r},-${r} h${barW - 2 * r} a${r},${r} 0 0 1 ${r},${r} V${pad.t + plotH} Z`} />}
              <text x={pad.l + band * i + band / 2} y={H - 12} className="xlabel" textAnchor="middle">
                {d.label}
              </text>
            </g>
          );
        })}
        <line x1={pad.l} x2={W - pad.r} y1={pad.t + plotH} y2={pad.t + plotH} className="axis" />
      </svg>
      <Tooltip tip={tip} />
    </div>
  );
}

export interface Slice {
  key: string;
  label: string;
  value: number;
  color: string;
}

export function DonutChart({ slices, centerLabel, onSelect }: { slices: Slice[]; centerLabel: string; onSelect?: (key: string) => void }) {
  const [tip, setTip] = useState<Tip | null>(null);
  const total = slices.reduce((s, x) => s + x.value, 0);
  const S = 300;
  const cx = S / 2;
  const cy = S / 2;
  const R = 82;
  const stroke = 30;
  const C = 2 * Math.PI * R;
  const gap = total > 0 && slices.filter((s) => s.value).length > 1 ? 3 : 0;
  let acc = 0;
  const arcs = slices.map((s) => {
    const frac = total ? s.value / total : 0;
    const start = acc;
    acc += frac;
    return { ...s, frac, start };
  });
  return (
    <div className="chart-wrap donut" onMouseLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${S} ${S}`} role="img" aria-label={`Gráfico de rosca: ${slices.map((s) => `${s.label} ${s.value}`).join(', ')}`}>
        <circle cx={cx} cy={cy} r={R} className="donut-track" strokeWidth={stroke} fill="none" />
        {arcs.map((a) =>
          a.value ? (
            <circle
              key={a.key}
              cx={cx}
              cy={cy}
              r={R}
              fill="none"
              stroke={a.color}
              strokeWidth={stroke}
              strokeDasharray={`${Math.max(a.frac * C - gap, 0.5)} ${C}`}
              strokeDashoffset={-a.start * C}
              transform={`rotate(-90 ${cx} ${cy})`}
              className="donut-seg"
              onMouseMove={(e) => {
                const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                setTip({ x: e.clientX - box.left, y: e.clientY - box.top, title: a.label, value: `${a.value} de ${total} (${Math.round(a.frac * 100)}%)` });
              }}
              onClick={() => onSelect?.(a.key)}
              style={{ cursor: onSelect ? 'pointer' : 'default' }}
            />
          ) : null
        )}
        {arcs.map((a) => {
          if (!a.value) return null;
          const mid = (a.start + a.frac / 2) * 2 * Math.PI - Math.PI / 2;
          const r1 = R + stroke / 2 + 4;
          const r2 = R + stroke / 2 + 18;
          const x1 = cx + Math.cos(mid) * r1;
          const y1 = cy + Math.sin(mid) * r1;
          const x2 = cx + Math.cos(mid) * r2;
          const y2 = cy + Math.sin(mid) * r2;
          const right = Math.cos(mid) >= 0;
          const x3 = x2 + (right ? 14 : -14);
          return (
            <g key={`l${a.key}`} className="donut-label">
              <polyline points={`${x1},${y1} ${x2},${y2} ${x3},${y2}`} fill="none" stroke={a.color} strokeWidth={1.5} />
              <text x={x3 + (right ? 3 : -3)} y={y2 - 3} textAnchor={right ? 'start' : 'end'} className="dl-name">
                {a.label}
              </text>
              <text x={x3 + (right ? 3 : -3)} y={y2 + 11} textAnchor={right ? 'start' : 'end'} className="dl-value">
                {a.value}
              </text>
            </g>
          );
        })}
        <text x={cx} y={cy + 4} textAnchor="middle" className="donut-total">
          {total}
        </text>
        <text x={cx} y={cy + 24} textAnchor="middle" className="donut-sub">
          {centerLabel}
        </text>
      </svg>
      <Tooltip tip={tip} />
      <ul className="legend-row">
        {slices.map((s) => (
          <li key={s.key}>
            <i style={{ background: s.color }} aria-hidden />
            {s.label} <span className="muted">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
