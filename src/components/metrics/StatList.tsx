import type { ReactNode } from "react";

/** Label/value pairs. A `null`/`undefined` value reads "Not available", never 0. */
export function StatList({ items, single }: { items: [string, ReactNode][]; single?: boolean }) {
  return (
    <dl className={`stat-list${single ? " stat-list--single" : ""}`}>
      {items.map(([label, value], i) => (
        <div key={`${label}${i}`}>
          <dt className="stat-list__label">{label}</dt>
          <dd className="stat-list__value">{value ?? <span className="metric-value metric-value--missing">Not available</span>}</dd>
        </div>
      ))}
    </dl>
  );
}
