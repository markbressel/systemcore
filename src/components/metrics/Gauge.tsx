import { useId } from "react";
import { useSmoothValue } from "../../hooks/useSmoothValue";

interface Props {
  /** Reading (0–100 % by default), or null when unavailable (no needle is drawn — never a fake 0). */
  value: number | null;
  label: string;
  /** Text shown in the hub when value is null, e.g. "Measuring…". */
  missingText?: string;
  size?: "md" | "lg";
  /** false = draw `value` exactly (for scripted animations); default glides between samples. */
  smooth?: boolean;
  /** Non-percent dial: maps a value to a 0–100 dial position and labels positions. Default: 0–100 %. */
  scale?: { position: (v: number) => number; labels: { at: number; text: string }[] };
  unit?: string;
  formatValue?: (v: number) => string;
}

const PERCENT_LABELS = Array.from({ length: 10 }, (_, i) => ({ at: i * 10, text: String(i * 10) }));

const C = 100; // center
const R_ARC = 88;
const R_SECTOR = 70;

// Scale starts at the bottom (6 o'clock) and runs clockwise, like an instrument dial.
const angle = (v: number) => ((90 + v * 3.6) * Math.PI) / 180;
const point = (v: number, r: number) => [C + r * Math.cos(angle(v)), C + r * Math.sin(angle(v))] as const;

function sector(v: number) {
  if (v <= 0) return "";
  const [x0, y0] = point(0, R_SECTOR);
  const [x1, y1] = point(Math.min(v, 99.99), R_SECTOR);
  return `M${C},${C} L${x0},${y0} A${R_SECTOR},${R_SECTOR} 0 ${v > 50 ? 1 : 0} 1 ${x1},${y1} Z`;
}

const TICKS = Array.from({ length: 50 }, (_, i) => i * 2);

export function Gauge({ value, label, missingText = "Measuring…", size = "lg", smooth = true, scale, unit = "%", formatValue }: Props) {
  const id = useId();
  const clamp = (x: number) => Math.max(0, Math.min(100, x));
  // `target` is the dial position (0–100); `value` stays the real reading for the printed number.
  const target = value == null ? null : clamp(scale ? scale.position(value) : value);
  // Needle, arc and sector glide; the printed number stays the exact latest sample.
  const v = useSmoothValue(target, smooth ? 220 : 0);
  const circumference = 2 * Math.PI * R_ARC;
  // Warning/danger colors only mean something on a utilization (percent) dial.
  const level = target == null || scale ? "" : target >= 90 ? " gauge--danger" : target >= 80 ? " gauge--warning" : "";
  const text = value == null ? null : formatValue ? formatValue(value) : clamp(value).toFixed(0);
  const [nx, ny] = point(v ?? 0, R_SECTOR + 4);

  return (
    <div
      className={`gauge gauge--${size}${level}`}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={scale ? undefined : 100}
      aria-valuenow={value == null ? undefined : Math.round(value)}
      aria-valuetext={text == null ? missingText : `${text} ${unit}`}
    >
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <defs>
          <radialGradient id={`${id}hub`}>
            <stop offset="0%" stopColor="var(--color-accent-soft)" />
            <stop offset="100%" stopColor="var(--color-bg-primary)" />
          </radialGradient>
          <linearGradient id={`${id}sector`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="var(--gauge-color)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--gauge-color)" stopOpacity="0.08" />
          </linearGradient>
        </defs>

        <circle className="gauge__rim" cx={C} cy={C} r="98" />
        <circle className="gauge__track" cx={C} cy={C} r={R_ARC} />
        {v != null && (
          <circle
            className="gauge__arc"
            cx={C}
            cy={C}
            r={R_ARC}
            transform={`rotate(90 ${C} ${C})`}
            strokeDasharray={`${(circumference * v) / 100} ${circumference}`}
          />
        )}

        {TICKS.map((t) => {
          const major = t % 10 === 0;
          const [x0, y0] = point(t, major ? 74 : 78);
          const [x1, y1] = point(t, 82);
          return <line key={t} className={major ? "gauge__tick gauge__tick--major" : "gauge__tick"} x1={x0} y1={y0} x2={x1} y2={y1} />;
        })}
        {(scale?.labels ?? PERCENT_LABELS).map(({ at, text: t }) => {
          const [x, y] = point(at, 63);
          return (
            <text key={at} className="gauge__scale" x={x} y={y} textAnchor="middle" dominantBaseline="central">
              {t}
            </text>
          );
        })}

        {v != null && (
          <>
            <path d={sector(v)} fill={`url(#${id}sector)`} />
            <line className="gauge__needle" x1={C} y1={C} x2={nx} y2={ny} />
          </>
        )}

        <circle cx={C} cy={C} r="40" fill={`url(#${id}hub)`} className="gauge__hub" />
      </svg>

      <div className="gauge__readout">
        {text == null ? (
          <span className="gauge__missing">{missingText}</span>
        ) : (
          <span className="gauge__value">
            {text}
            <span className="gauge__unit">{unit}</span>
          </span>
        )}
        <span className="gauge__label">{label}</span>
      </div>
    </div>
  );
}
