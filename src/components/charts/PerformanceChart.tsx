import { useEffect, useState, type PointerEvent } from "react";
import { HISTORY_LENGTH } from "../../stores/telemetry";
import { StatusBadge } from "../feedback/StatusBadge";

export interface Series {
  data: (number | null)[];
  /** CSS color, normally a token such as var(--color-chart-cpu). */
  color: string;
  label: string;
}

interface Props {
  title?: string;
  series: Series[];
  /** Value formatter including unit, used for axis and tooltip. */
  format: (v: number) => string;
  /** Fixed max (e.g. 100 for %). Omit to auto-scale. */
  max?: number;
  size?: "sm" | "md" | "lg";
  stale?: boolean;
  /** Slots on the x axis (default: the live 60 s window). */
  length?: number;
  /** Left axis label and tooltip time for a slot `n` steps before the newest. */
  startLabel?: string;
  agoLabel?: (n: number) => string;
}

const liveAgo = (n: number) => (n === 0 ? "now" : `${n}s ago`);

// Gaps (null) break the line instead of being drawn as zero.
function paths(data: (number | null)[], max: number, length: number) {
  const offset = length - data.length;
  const segments: [number, number][][] = [];
  let cur: [number, number][] = [];
  data.forEach((v, i) => {
    if (v == null) {
      if (cur.length) segments.push(cur);
      cur = [];
    } else {
      cur.push([offset + i, 100 - (Math.min(v, max) / max) * 100]);
    }
  });
  if (cur.length) segments.push(cur);
  return segments.map((seg) => {
    const line = seg.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join("");
    return { line, area: `${line}L${seg[seg.length - 1][0]},100L${seg[0][0]},100Z` };
  });
}

const valueAt = (data: (number | null)[], slot: number, length: number) => data[slot - (length - data.length)] ?? null;

export function PerformanceChart({ title, series, format, max, size = "md", stale, length = HISTORY_LENGTH, startLabel, agoLabel = liveAgo }: Props) {
  const LAST = length - 1;
  const [hover, setHover] = useState<number | null>(null);
  // Each new sample restarts a one-step scroll animation, so the trace glides left instead of jumping.
  const [sample, setSample] = useState(0);
  const firstData = series[0]?.data;
  useEffect(() => setSample((n) => n + 1), [firstData]);
  const interactive = size !== "sm";
  const peak = Math.max(1, ...series.flatMap((s) => s.data.filter((v): v is number => v != null)));
  const scale = max ?? peak * 1.15;
  const summary = series.map((s) => `${s.label} ${s.data.at(-1) == null ? "not available" : format(s.data.at(-1)!)}`).join(", ");

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHover(Math.max(0, Math.min(LAST, Math.round(((e.clientX - r.left) / r.width) * LAST))));
  };

  const pos = hover == null ? 0 : (hover / LAST) * 100;
  const ago = hover == null ? 0 : LAST - hover;

  return (
    <div className={`chart chart--${size}`}>
      {size !== "sm" && (
        <div className="chart__head">
          {title && <span className="chart__title">{title}</span>}
          <div className="chart__legend">
            {series.map((s) => (
              // The swatch color is data-driven (per series), hence the custom property.
              <span key={s.label} className="chart__legend-item" style={{ ["--series-color" as string]: s.color }}>
                {s.label}
              </span>
            ))}
          </div>
        </div>
      )}
      <div
        className="chart__plot"
        onPointerMove={interactive ? onMove : undefined}
        onPointerLeave={interactive ? () => setHover(null) : undefined}
      >
        <svg viewBox={`0 0 ${LAST} 100`} preserveAspectRatio="none" role="img" aria-label={`${title ?? "History"}, ${startLabel ?? `last ${length} seconds`}. Latest: ${summary}`}>
          {[25, 50, 75].map((y) => (
            <line key={y} x1="0" x2={LAST} y1={y} y2={y} className="chart__grid" />
          ))}
          <g className="chart__scroll" key={sample}>
            {series.map((s) =>
              paths(s.data, scale, length).map((p, i) => (
                <g key={`${s.label}${i}`}>
                  <path d={p.area} fill={s.color} opacity="0.08" />
                  <path d={p.line} fill="none" stroke={s.color} strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                </g>
              )),
            )}
          </g>
        </svg>
        <span className="chart__axis chart__axis--max">{format(scale)}</span>
        {size !== "sm" && (
          <>
            <span className="chart__axis chart__axis--start">{startLabel ?? `−${length}s`}</span>
            <span className="chart__axis chart__axis--end">now</span>
          </>
        )}
        {stale && (
          <span className="chart__stale">
            <StatusBadge tone="warning">Stale</StatusBadge>
          </span>
        )}
        {hover != null && (
          <>
            <div className="chart__cursor" style={{ left: `${pos}%` }} />
            <div className="chart__tooltip" style={pos > 60 ? { right: `${100 - pos}%`, marginRight: 8 } : { left: `${pos}%`, marginLeft: 8 }}>
              <div className="chart__tooltip-time">{agoLabel(ago)}</div>
              {series.map((s) => {
                const v = valueAt(s.data, hover, length);
                return (
                  <div key={s.label} className="chart__tooltip-row">
                    <span>{s.label}</span>
                    <strong>{v == null ? "n/a" : format(v)}</strong>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
