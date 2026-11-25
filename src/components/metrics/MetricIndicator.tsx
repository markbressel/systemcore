import { useSmoothValue } from "../../hooks/useSmoothValue";

export type Resource = "cpu" | "memory" | "gpu" | "storage";

interface Props {
  percent: number | null;
  label: string;
  resource: Resource;
  thin?: boolean;
}

/** Utilization bar. Switches to warning at 80 % and danger at 90 %; the % is always also shown as text nearby. */
export function MetricIndicator({ percent, label, resource, thin }: Props) {
  const p = percent == null ? 0 : Math.max(0, Math.min(100, percent));
  const shown = useSmoothValue(p) ?? p;
  const level = percent == null ? "" : p >= 90 ? " metric-indicator--danger" : p >= 80 ? " metric-indicator--warning" : "";
  return (
    <div
      className={`metric-indicator metric-indicator--${resource}${thin ? " metric-indicator--thin" : ""}${level}`}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent == null ? undefined : Math.round(p)}
    >
      {/* Width is live data, so it has to be an inline style. */}
      <div className="metric-indicator__fill" style={{ width: `${shown}%` }} />
    </div>
  );
}
