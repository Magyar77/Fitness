import { useId, useRef, useState } from 'react';
import { daysBetween, type IsoDate } from '../../engine/dates';

export interface ChartPoint {
  x: IsoDate;
  y: number;
  label: string;
}

export interface ChartSeries {
  name: string;
  /** CSS colour (use the --series-N tokens). */
  color: string;
  points: ChartPoint[];
  line?: boolean;
  dots?: boolean;
}

interface Props {
  title: string;
  unit: string;
  series: ChartSeries[];
  /** e.g. "less is better" for assistance. */
  note?: string;
}

const W = 340;
const H = 190;
const PAD = { left: 38, right: 14, top: 14, bottom: 26 };

function niceStep(range: number): number {
  const raw = range / 4;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * mag) return m * mag;
  return 10 * mag;
}

function shortDate(d: IsoDate): string {
  return new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const fmt = (v: number) => `${Number(v.toFixed(1))}`;

export function LineChart({ title, unit, series, note }: Props) {
  const id = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const all = series.flatMap((s) => s.points);
  if (!all.length) return <p className="muted small">No data yet.</p>;

  const dates = [...new Set(all.map((p) => p.x))].sort();
  const first = dates[0]!;
  const span = Math.max(1, daysBetween(first, dates.at(-1)!));
  const ys = all.map((p) => p.y);
  let lo = Math.min(...ys);
  let hi = Math.max(...ys);
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const step = niceStep(hi - lo);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(Math.round(v * 1000) / 1000);

  const sx = (d: IsoDate) => (dates.length === 1 ? (PAD.left + W - PAD.right) / 2 : PAD.left + (daysBetween(first, d) / span) * (W - PAD.left - PAD.right));
  const sy = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);

  const activeDate = active === null ? null : dates[active]!;
  const activeX = activeDate ? sx(activeDate) : 0;

  function pick(clientX: number) {
    const box = wrap.current?.getBoundingClientRect();
    if (!box) return;
    const x = ((clientX - box.left) / box.width) * W;
    let best = 0;
    dates.forEach((d, i) => {
      if (Math.abs(sx(d) - x) < Math.abs(sx(dates[best]!) - x)) best = i;
    });
    setActive(best);
  }

  function key(e: React.KeyboardEvent) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const cur = active ?? (e.key === 'ArrowRight' ? -1 : dates.length);
      setActive(Math.max(0, Math.min(dates.length - 1, cur + (e.key === 'ArrowRight' ? 1 : -1))));
    } else if (e.key === 'Escape') setActive(null);
  }

  const lastSeries = series[0]!;
  const lastPoint = lastSeries.points.at(-1);

  return (
    <figure className="chart" aria-labelledby={`${id}-t`}>
      <figcaption id={`${id}-t`}>
        <span className="chart-title">{title}</span>
        {note && <span className="muted small"> · {note}</span>}
      </figcaption>
      {series.length > 1 && (
        <div className="legend">
          {series.map((s) => (
            <span key={s.name}>
              <i style={{ background: s.color, height: s.line === false ? 8 : 2, width: s.line === false ? 8 : 14, borderRadius: s.line === false ? 4 : 1 }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
      <div
        ref={wrap}
        className="chart-plot"
        tabIndex={0}
        role="img"
        aria-label={`${title}. Use left and right arrows to read values.`}
        onPointerMove={(e) => pick(e.clientX)}
        onPointerDown={(e) => pick(e.clientX)}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setActive(null)}
        onKeyDown={key}
        onBlur={() => setActive(null)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={sy(t)} y2={sy(t)} className="grid" />
              <text x={PAD.left - 6} y={sy(t) + 3.5} textAnchor="end" className="axis">{fmt(t)}</text>
            </g>
          ))}
          <text x={PAD.left} y={H - 6} className="axis">{shortDate(first)}</text>
          {dates.length > 1 && <text x={W - PAD.right} y={H - 6} textAnchor="end" className="axis">{shortDate(dates.at(-1)!)}</text>}
          {activeDate && <line x1={activeX} x2={activeX} y1={PAD.top} y2={H - PAD.bottom} className="crosshair" />}
          {series.map((s) =>
            s.line !== false && s.points.length > 1 ? (
              <polyline key={`l${s.name}`} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
                points={s.points.map((p) => `${sx(p.x)},${sy(p.y)}`).join(' ')} />
            ) : null,
          )}
          {series.map((s) =>
            s.dots !== false
              ? s.points.map((p) => (
                  <circle key={`d${s.name}${p.x}`} cx={sx(p.x)} cy={sy(p.y)} r={p.x === activeDate ? 5.5 : 4} fill={s.color} className="dot" />
                ))
              : null,
          )}
          {lastPoint && series.length === 1 && (
            <text x={Math.min(sx(lastPoint.x), W - PAD.right)} y={sy(lastPoint.y) - 9} textAnchor="end" className="direct">{fmt(lastPoint.y)} {unit}</text>
          )}
        </svg>
        {activeDate && (
          <div className="tooltip" style={{ left: `${(activeX / W) * 100}%` }} role="status">
            <strong>{shortDate(activeDate)}</strong>
            {series.map((s) => {
              const p = s.points.find((q) => q.x === activeDate);
              return p ? (
                <span key={s.name}>
                  {series.length > 1 && <i style={{ background: s.color }} />}
                  {p.label}
                </span>
              ) : null;
            })}
          </div>
        )}
      </div>
      <details className="small">
        <summary>Show as table</summary>
        <table className="data-table">
          <thead>
            <tr><th>Date</th>{series.map((s) => <th key={s.name}>{s.name}</th>)}</tr>
          </thead>
          <tbody>
            {[...dates].reverse().map((d) => (
              <tr key={d}>
                <td>{shortDate(d)}</td>
                {series.map((s) => <td key={s.name}>{s.points.find((p) => p.x === d)?.label ?? '–'}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
