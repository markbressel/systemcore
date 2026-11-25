import { STATUS_LABEL, type Formatted } from "../../lib/format";
import type { Metric } from "../../types/telemetry";

interface Props<T> {
  metric: Metric<T>;
  format: (v: T) => Formatted;
}

/** Renders a metric's value, or an honest reason why there is none (never a fake zero). */
export function MetricValue<T>({ metric, format }: Props<T>) {
  const title = `Source: ${metric.source}`;
  if (metric.status === "available" && metric.value != null) {
    return <Value value={format(metric.value)} title={title} />;
  }
  return (
    <span
      className={`metric-value metric-value--missing${metric.status === "error" ? " metric-value--error" : ""}`}
      title={metric.note ? `${STATUS_LABEL[metric.status]} · ${title}` : title}
    >
      {metric.note ?? STATUS_LABEL[metric.status]}
    </span>
  );
}

/** A plain formatted value (for data that is not wrapped in a Metric). */
export function Value({ value, title }: { value: Formatted; title?: string }) {
  if (typeof value === "string") {
    return (
      <span className="metric-value" title={title}>
        {value}
      </span>
    );
  }
  return (
    <span className="metric-value" title={title}>
      {value[0]}
      <span className="metric-value__unit">{value[1]}</span>
    </span>
  );
}
