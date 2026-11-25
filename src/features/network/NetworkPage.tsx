import { ArrowDown, ArrowUp, Network } from "lucide-react";
import { useState } from "react";
import { PerformanceChart } from "../../components/charts/PerformanceChart";
import { LoadingState } from "../../components/feedback/States";
import { StatusBadge, type Tone } from "../../components/feedback/StatusBadge";
import { HardwareCard } from "../../components/hardware/HardwareCard";
import { PageContainer } from "../../components/layout/PageContainer";
import { MetricValue } from "../../components/metrics/MetricValue";
import { formatBytes, formatRate, rateParts } from "../../lib/format";
import { useTelemetry } from "../../stores/telemetry";

const STATE: Record<string, [Tone, string]> = {
  Up: ["success", "Connected"],
  Down: ["neutral", "Disconnected"],
  Dormant: ["warning", "Dormant"],
  NotPresent: ["neutral", "Not present"],
  Testing: ["info", "Testing"],
};

export function NetworkPage() {
  const { system: s, history, stale } = useTelemetry();
  const [showIdle, setShowIdle] = useState(false);
  if (!s) return <LoadingState />;
  const n = s.network;
  // Windows lists many virtual/filter adapters that never carry traffic.
  const adapters = n.adapters.filter((a) => showIdle || a.totalRxBytes + a.totalTxBytes > 0);

  return (
    <PageContainer title="Network" subtitle="Throughput calculated from cumulative adapter byte counters">
      <HardwareCard title="All adapters" icon={Network}>
        <div className="readout">
          <div>
            <div className="readout__label"><ArrowDown className="topbar__icon u-download" aria-hidden="true" /> Download</div>
            <div className="readout__value u-download"><MetricValue metric={n.rxBytesPerSec} format={rateParts} /></div>
          </div>
          <div>
            <div className="readout__label"><ArrowUp className="topbar__icon u-upload" aria-hidden="true" /> Upload</div>
            <div className="readout__value u-upload"><MetricValue metric={n.txBytesPerSec} format={rateParts} /></div>
          </div>
        </div>
        <PerformanceChart
          title="Throughput"
          size="lg"
          stale={stale}
          format={formatRate}
          series={[
            { data: history.rx, color: "var(--color-chart-download)", label: "Download" },
            { data: history.tx, color: "var(--color-chart-upload)", label: "Upload" },
          ]}
        />
      </HardwareCard>

      <HardwareCard
        title="Adapters"
        icon={Network}
        aside={
          <label className="checkbox">
            <input type="checkbox" checked={showIdle} onChange={(e) => setShowIdle(e.target.checked)} />
            Show adapters without traffic
          </label>
        }
      >
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th><span className="data-table__heading">Adapter</span></th>
                <th className="data-table__col--medium"><span className="data-table__heading">Status</span></th>
                <th className="data-table__col--wide"><span className="data-table__heading">MAC</span></th>
                <th className="is-numeric data-table__col--medium"><span className="data-table__heading">Download</span></th>
                <th className="is-numeric data-table__col--medium"><span className="data-table__heading">Upload</span></th>
                <th className="is-numeric data-table__col--narrow"><span className="data-table__heading">Received</span></th>
                <th className="is-numeric data-table__col--narrow"><span className="data-table__heading">Sent</span></th>
              </tr>
            </thead>
            <tbody>
              {adapters.map((a) => {
                const [tone, label] = STATE[a.status] ?? ["neutral", a.status];
                return (
                  <tr key={a.name}>
                    <td className="data-table__primary" title={a.name}>{a.name}</td>
                    <td><StatusBadge tone={tone} plain>{label}</StatusBadge></td>
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
                  <td colSpan={7} className="data-table__empty">No adapter has carried traffic yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </HardwareCard>
    </PageContainer>
  );
}
