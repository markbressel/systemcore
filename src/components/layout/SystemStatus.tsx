import { useTelemetry } from "../../stores/telemetry";
import { StatusBadge } from "../feedback/StatusBadge";

/** Telemetry pipeline health: live, stale (backend stopped delivering), or error. */
export function SystemStatus() {
  const { system, stale, error } = useTelemetry();
  if (error) return <StatusBadge tone="danger">Telemetry error</StatusBadge>;
  if (!system) return <StatusBadge tone="info">Connecting</StatusBadge>;
  if (stale) return <StatusBadge tone="warning">Data stale</StatusBadge>;
  return <StatusBadge tone="success">Live telemetry</StatusBadge>;
}
