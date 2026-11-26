import type { ReactNode } from "react";
import { STATUS_LABEL } from "../../lib/format";
import type { MetricStatus } from "../../types/telemetry";
import { t } from "../../lib/i18n";

export type Tone = "success" | "warning" | "danger" | "info" | "accent" | "neutral";

interface Props {
  tone: Tone;
  children: ReactNode;
  plain?: boolean;
}

/** Colored marker + text label: status is never communicated by color alone. */
export function StatusBadge({ tone, children, plain }: Props) {
  return <span className={`status-badge status-badge--${tone}${plain ? " status-badge--plain" : ""}`}>{children}</span>;
}

const METRIC_TONE: Record<MetricStatus, Tone> = {
  available: "success",
  initializing: "info",
  unsupported: "neutral",
  temporarily_unavailable: "warning",
  error: "danger",
};

/** Data-availability state of a metric (card footers, detail views). */
export function MetricStatus({ status, source }: { status: MetricStatus; source?: string }) {
  return (
    <span title={source ? t("Source: {source}", { source }) : undefined}>
      <StatusBadge tone={METRIC_TONE[status]} plain>
        {t(STATUS_LABEL[status])}
      </StatusBadge>
    </span>
  );
}
