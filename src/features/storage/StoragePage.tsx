import { HardDrive, Usb } from "lucide-react";
import { EmptyState, LoadingState } from "../../components/feedback/States";
import { StatusBadge, type Tone } from "../../components/feedback/StatusBadge";
import { PageContainer } from "../../components/layout/PageContainer";
import { MetricIndicator } from "../../components/metrics/MetricIndicator";
import { MetricValue } from "../../components/metrics/MetricValue";
import { StatList } from "../../components/metrics/StatList";
import { formatBytes, formatPercent, rateParts } from "../../lib/format";
import { t } from "../../lib/i18n";
import { useTelemetry } from "../../stores/telemetry";
import { CleanupCard } from "./CleanupCard";
import { SpaceCard } from "./SpaceCard";

export function StoragePage() {
  const { disks } = useTelemetry();
  if (!disks) return <LoadingState label={t("Reading volumes…")} />;

  return (
    <PageContainer title={t("Storage")} subtitle={t("Mounted volumes · capacity refreshed every 2 s · activity from I/O counters · health from Windows Storage Management")}>
      {disks.disks.length === 0 && <EmptyState icon={HardDrive}>{t("No volumes reported by the provider.")}</EmptyState>}
      <div className="grid grid--auto">
        {disks.disks.map((d) => {
          const used = d.totalBytes - d.availableBytes;
          const pct = d.totalBytes > 0 ? (used / d.totalBytes) * 100 : null;
          const Icon = d.removable ? Usb : HardDrive;
          const kind = d.kind.startsWith("Unknown") ? t("Unspecified by drive") : t(d.kind);
          const healthTone: Tone = d.health === "Healthy" ? "success" : d.health === "Warning" ? "warning" : d.health === "Unhealthy" ? "danger" : "neutral";
          return (
            <section key={d.mountPoint} className="panel" aria-label={t("Volume {mount}", { mount: d.mountPoint })}>
              <div className="panel__header">
                <div className="drive__heading">
                  <Icon className="panel__icon" aria-hidden="true" />
                  <span className="drive__mount">{d.mountPoint}</span>
                  <span className="drive__name" title={d.model ?? undefined}>{d.model ?? (d.name || t("Local disk"))}</span>
                </div>
                <span className="drive__usage">{pct != null ? formatPercent(pct) : "—"}</span>
              </div>
              <MetricIndicator resource="storage" percent={pct} label={t("{mount} usage", { mount: d.mountPoint })} />
              <StatList
                items={[
                  [t("Used"), <span className="u-mono">{formatBytes(used)}</span>],
                  [t("Free"), <span className="u-mono">{formatBytes(d.availableBytes)}</span>],
                  [t("Capacity"), <span className="u-mono">{formatBytes(d.totalBytes)}</span>],
                  [t("File system"), d.fileSystem || null],
                  [t("Drive type"), <StatusBadge tone="neutral">{kind}{d.removable ? ` · ${t("removable")}` : ""}</StatusBadge>],
                  [t("Health"), d.health && <StatusBadge tone={healthTone}>{t(d.health)}</StatusBadge>],
                ]}
              />
              <div className="drive__activity">
                <div>
                  <div className="stat-list__label">{t("Read")}</div>
                  <MetricValue metric={d.readBytesPerSec} format={rateParts} />
                </div>
                <div>
                  <div className="stat-list__label">{t("Write")}</div>
                  <MetricValue metric={d.writeBytesPerSec} format={rateParts} />
                </div>
              </div>
            </section>
          );
        })}
      </div>
      <div className="grid grid--split">
        <CleanupCard />
        <SpaceCard drives={disks.disks.filter((d) => !d.removable).map((d) => d.mountPoint)} />
      </div>
    </PageContainer>
  );
}
