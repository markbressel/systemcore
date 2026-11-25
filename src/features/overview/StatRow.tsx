import type { ReactNode } from "react";
import { useSmoothValue } from "../../hooks/useSmoothValue";

interface Props {
  label: string;
  value: ReactNode;
  /** Bar fill 0–100 (%, °C on a 0–100 °C scale, or share of a measured maximum). Omit when there is no defined scale. */
  percent?: number | null;
  /** Tooltip explaining what the bar is relative to, when it isn't obvious. */
  scaleHint?: string;
}

/** Label with a slim level bar on the left, large readout on the right (overview side columns). */
export function StatRow({ label, value, percent, scaleHint }: Props) {
  const fill = useSmoothValue(percent == null ? null : Math.max(2, Math.min(100, percent)));
  return (
    <div className="stat-row" title={scaleHint}>
      <div className="stat-row__meta">
        <span className="stat-row__label">{label}</span>
        <span className="stat-row__track" aria-hidden="true">
          {fill != null && <span className="stat-row__fill" style={{ width: `${fill}%` }} />}
        </span>
      </div>
      <div className="stat-row__value">{value}</div>
    </div>
  );
}
