import { AppWindow, ArrowDown, ArrowUp, Network } from "lucide-react";
import { useState } from "react";
import { PerformanceChart } from "../../components/charts/PerformanceChart";
import { LoadingState } from "../../components/feedback/States";
import { StatusBadge, type Tone } from "../../components/feedback/StatusBadge";
import { HardwareCard } from "../../components/hardware/HardwareCard";
import { PageContainer } from "../../components/layout/PageContainer";
import { MetricValue } from "../../components/metrics/MetricValue";
import { formatBytes, formatRate, rateParts } from "../../lib/format";
import { t } from "../../lib/i18n";
import { useTelemetry } from "../../stores/telemetry";

const STATE: Record<string, [Tone, string]> = {
  Up: ["success", "Connected"],
  Down: ["neutral", "Disconnected"],
  Dormant: ["warning", "Dormant"],
  NotPresent: ["neutral", "Not present"],
  Testing: ["info", "Testing"],
};

export function NetworkPage() {
  const { system: s, processes, history, stale } = useTelemetry();
  const [showIdle, setShowIdle] = useState(false);
  if (!s) return <LoadingState />;
  const n = s.network;
  // Windows lists many virtual/filter adapters that never carry traffic.
  const adapters = n.adapters.filter((a) => showIdle || a.totalRxBytes + a.totalTxBytes > 0);
  const traffic = (p: { netRxBytesPerSec: number | null; netTxBytesPerSec: number | null }) => (p.netRxBytesPerSec ?? 0) + (p.netTxBytesPerSec ?? 0);
  const apps = (processes?.processes ?? [])
    .filter((p) => traffic(p) > 0)
    .sort((a, b) => traffic(b) - traffic(a))
    .slice(0, 10);

  return (
    <PageContainer title={t("Network")} subtitle={t("Throughput calculated from cumulative adapter byte counters")}>
      <HardwareCard title={t("All adapters")} icon={Network}>
        <div className="readout">
          <div>
            <div className="readout__label"><ArrowDown className="topbar__icon u-download" aria-hidden="true" /> {t("Download")}</div>
            <div className="readout__value u-download"><MetricValue metric={n.rxBytesPerSec} format={rateParts} /></div>
          </div>
          <div>
            <div className="readout__label"><ArrowUp className="topbar__icon u-upload" aria-hidden="true" /> {t("Upload")}</div>
            <div className="readout__value u-upload"><MetricValue metric={n.txBytesPerSec} format={rateParts} /></div>
          </div>
        </div>
        <PerformanceChart
          title={t("Throughput")}
          size="lg"
          stale={stale}
          format={formatRate}
          series={[
            { data: history.rx, color: "var(--color-chart-download)", label: t("Download") },
            { data: history.tx, color: "var(--color-chart-upload)", label: t("Upload") },
          ]}
        />
      </HardwareCard>

      <HardwareCard title={t("Programs using the network")} icon={AppWindow}>
        {!processes ? (
          <LoadingState label={t("Enumerating processes…")} />
        ) : !processes.netPerProcess ? (
          <p className="page__note">
            {t("Windows only reports traffic per program to administrators. Restart SystemCore as administrator (Settings → Gaming) to see which program uses the network.")}
          </p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th><span className="data-table__heading">{t("Program")}</span></th>
                  <th className="is-numeric data-table__col--narrow"><span className="data-table__heading">PID</span></th>
                  <th className="is-numeric data-table__col--medium"><span className="data-table__heading">{t("Download")}</span></th>
                  <th className="is-numeric data-table__col--medium"><span className="data-table__heading">{t("Upload")}</span></th>
                </tr>
              </thead>
              <tbody>
                {apps.map((p) => (
                  <tr key={p.pid}>
                    <td className="data-table__primary" title={p.exe ?? p.name}>{p.name}</td>
                    <td className="is-numeric data-table__mono">{p.pid}</td>
                    <td className="is-numeric data-table__mono u-download">{formatRate(p.netRxBytesPerSec ?? 0)}</td>
                    <td className="is-numeric data-table__mono u-upload">{formatRate(p.netTxBytesPerSec ?? 0)}</td>
                  </tr>
                ))}
                {apps.length === 0 && (
                  <tr>
                    <td colSpan={4} className="data-table__empty">{t("No program is using the network right now.")}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </HardwareCard>

      <HardwareCard
        title={t("Adapters")}
        icon={Network}
        aside={
          <label className="checkbox">
            <input type="checkbox" checked={showIdle} onChange={(e) => setShowIdle(e.target.checked)} />
            {t("Show adapters without traffic")}
          </label>
        }
      >
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th><span className="data-table__heading">{t("Adapter")}</span></th>
                <th className="data-table__col--medium"><span className="data-table__heading">{t("Status")}</span></th>
                <th className="data-table__col--wide"><span className="data-table__heading">{t("MAC")}</span></th>
                <th className="is-numeric data-table__col--medium"><span className="data-table__heading">{t("Download")}</span></th>
                <th className="is-numeric data-table__col--medium"><span className="data-table__heading">{t("Upload")}</span></th>
                <th className="is-numeric data-table__col--narrow"><span className="data-table__heading">{t("Received")}</span></th>
                <th className="is-numeric data-table__col--narrow"><span className="data-table__heading">{t("Sent")}</span></th>
              </tr>
            </thead>
            <tbody>
              {adapters.map((a) => {
                const [tone, label] = STATE[a.status] ?? ["neutral", a.status];
                return (
                  <tr key={a.name}>
                    <td className="data-table__primary" title={a.name}>{a.name}</td>
                    <td><StatusBadge tone={tone} plain>{t(label)}</StatusBadge></td>
                    <td className="data-table__mono">{a.mac}</td>
                    <td className="is-numeric data-table__mono u-download"><MetricValue metric={a.rxBytesPerSec} format={formatRate} /></td>
                    <td className="is-numeric data-table__mono u-upload"><MetricValue metric={a.txBytesPerSec} format={formatRate} /></td>
                    <td className="is-numeric data-table__mono">{formatBytes(a.totalRxBytes)}</td>
                    <td className="is-numeric data-table__mono">{formatBytes(a.totalTxBytes)}</td>
                  </tr>
                );
              })}
              {adapters.length === 0 && (
                <tr>
                  <td colSpan={7} className="data-table__empty">{t("No adapter has carried traffic yet.")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </HardwareCard>
    </PageContainer>
  );
}
