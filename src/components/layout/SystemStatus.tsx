import { useTelemetry } from "../../stores/telemetry";
import { StatusBadge } from "../feedback/StatusBadge";
import { t } from "../../lib/i18n";

/** Telemetry pipeline health: live, stale (backend stopped delivering), or error. */
export function SystemStatus() {
  const { system, stale, error } = useTelemetry();
  if (error) return <StatusBadge tone="danger">{t("Telemetry error")}</StatusBadge>;
  if (!system) return <StatusBadge tone="info">{t("Connecting")}</StatusBadge>;
  if (stale) return <StatusBadge tone="warning">{t("Data stale")}</StatusBadge>;
  return <StatusBadge tone="success">{t("Live telemetry")}</StatusBadge>;
}
