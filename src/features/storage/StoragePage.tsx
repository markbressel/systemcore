import { HardDrive, Usb } from "lucide-react";
import { EmptyState, LoadingState } from "../../components/feedback/States";
import { StatusBadge, type Tone } from "../../components/feedback/StatusBadge";
import { PageContainer } from "../../components/layout/PageContainer";
import { MetricIndicator } from "../../components/metrics/MetricIndicator";
import { MetricValue } from "../../components/metrics/MetricValue";
import { StatList } from "../../components/metrics/StatList";
import { formatBytes, formatPercent, rateParts } from "../../lib/format";
import { useTelemetry } from "../../stores/telemetry";

export function StoragePage() {
  const { disks } = useTelemetry();
  if (!disks) return <LoadingState label="Reading volumes…" />;

  return (
    <PageContainer title="Storage" subtitle="Mounted volumes · capacity refreshed every 2 s · activity from I/O counters · health from Windows Storage Management">
      {disks.disks.length === 0 && <EmptyState icon={HardDrive}>No volumes reported by the provider.</EmptyState>}
      <div className="grid grid--auto">
        {disks.disks.map((d) => {
          const used = d.totalBytes - d.availableBytes;
          const pct = d.totalBytes > 0 ? (used / d.totalBytes) * 100 : null;
          const Icon = d.removable ? Usb : HardDrive;
          const kind = d.kind.startsWith("Unknown") ? "Unspecified by drive" : d.kind;
          const healthTone: Tone = d.health === "Healthy" ? "success" : d.health === "Warning" ? "warning" : d.health === "Unhealthy" ? "danger" : "neutral";
          return (
            <section key={d.mountPoint} className="panel" aria-label={`Volume ${d.mountPoint}`}>
              <div className="panel__header">
                <div className="drive__heading">
                  <Icon className="panel__icon" aria-hidden="true" />
                  <span className="drive__mount">{d.mountPoint}</span>
                  <span className="drive__name" title={d.model ?? undefined}>{d.model ?? (d.name || "Local disk")}</span>
                </div>
                <span className="drive__usage">{pct != null ? formatPercent(pct) : "—"}</span>
              </div>
              <MetricIndicator resource="storage" percent={pct} label={`${d.mountPoint} usage`} />
              <StatList
                items={[
                  ["Used", <span className="u-mono">{formatBytes(used)}</span>],
                  ["Free", <span className="u-mono">{formatBytes(d.availableBytes)}</span>],
                  ["Capacity", <span className="u-mono">{formatBytes(d.totalBytes)}</span>],
                  ["File system", d.fileSystem || null],
                  ["Drive type", <StatusBadge tone="neutral">{kind}{d.removable ? " · removable" : ""}</StatusBadge>],
                  ["Health", d.health && <StatusBadge tone={healthTone}>{d.health}</StatusBadge>],
                ]}
              />
              <div className="drive__activity">
                <div>
                  <div className="stat-list__label">Read</div>
                  <MetricValue metric={d.readBytesPerSec} format={rateParts} />
                </div>
                <div>
                  <div className="stat-list__label">Write</div>
                  <MetricValue metric={d.writeBytesPerSec} format={rateParts} />
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </PageContainer>
  );
}
