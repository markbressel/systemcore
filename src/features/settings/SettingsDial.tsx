import type { LucideIcon } from "lucide-react";
import { useId } from "react";
import { useSmoothValue } from "../../hooks/useSmoothValue";
import { t } from "../../lib/i18n";

interface Item<T extends string> {
  id: T;
  label: string;
  icon: LucideIcon;
}

interface Props<T extends string> {
  items: readonly Item<T>[];
  value: T;
  onChange: (id: T) => void;
}

// Same geometry as the Gauge dial: 0 at 6 o'clock, running clockwise over 0–100.
const C = 100;
const R_ARC = 88;
const R_ITEM = 58;
const R_NEEDLE = 42;
const angle = (v: number) => ((90 + v * 3.6) * Math.PI) / 180;
const point = (v: number, r: number) => [C + r * Math.cos(angle(v)), C + r * Math.sin(angle(v))] as const;
const TICKS = Array.from({ length: 50 }, (_, i) => i * 2);

/** Settings menu drawn as an instrument dial: the needle glides to the chosen section like the speed test gauge. */
export function SettingsDial<T extends string>({ items, value, onChange }: Props<T>) {
  const id = useId();
  const spot = (i: number) => (100 * (i + 0.5)) / items.length;
  const index = Math.max(0, items.findIndex((it) => it.id === value));
  const v = useSmoothValue(spot(index), 220) ?? spot(index);
  const circumference = 2 * Math.PI * R_ARC;
  const [nx, ny] = point(v, R_NEEDLE);

  return (
    <nav className="gauge settings-dial" aria-label={t("Settings sections")}>
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <defs>
          <radialGradient id={`${id}hub`}>
            <stop offset="0%" stopColor="var(--color-accent-soft)" />
            <stop offset="100%" stopColor="var(--color-bg-primary)" />
          </radialGradient>
        </defs>
        <circle className="gauge__rim" cx={C} cy={C} r="98" />
        <circle className="gauge__track" cx={C} cy={C} r={R_ARC} />
        <circle
          className="gauge__arc"
          cx={C}
          cy={C}
          r={R_ARC}
          transform={`rotate(90 ${C} ${C})`}
          strokeDasharray={`${(circumference * v) / 100} ${circumference}`}
        />
        {TICKS.map((t) => {
          const major = t % 10 === 0;
          const [x0, y0] = point(t, major ? 74 : 78);
          const [x1, y1] = point(t, 82);
          return <line key={t} className={major ? "gauge__tick gauge__tick--major" : "gauge__tick"} x1={x0} y1={y0} x2={x1} y2={y1} />;
        })}
        <line className="gauge__needle" x1={C} y1={C} x2={nx} y2={ny} />
        <circle cx={C} cy={C} r="16" fill={`url(#${id}hub)`} className="gauge__hub" />
      </svg>

      <div role="tablist" aria-label={t("Settings sections")}>
        {items.map(({ id: itemId, label, icon: Icon }, i) => {
          const [x, y] = point(spot(i), R_ITEM);
          const active = itemId === value;
          return (
            <button
              key={itemId}
              type="button"
              role="tab"
              aria-selected={active}
              className={`settings-dial__item${active ? " settings-dial__item--active" : ""}`}
              style={{ left: `${x / 2}%`, top: `${y / 2}%` }}
              onClick={() => onChange(itemId)}
            >
              <span className="settings-dial__icon">
                <Icon aria-hidden="true" />
              </span>
              <span className="settings-dial__label">{t(label)}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
