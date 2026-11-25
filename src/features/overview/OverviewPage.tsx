import { ArrowDown, ArrowRight, ArrowUp, CircuitBoard, List, Network } from "lucide-react";
import { PerformanceChart } from "../../components/charts/PerformanceChart";
import { LoadingState } from "../../components/feedback/States";
import { HardwareCard } from "../../components/hardware/HardwareCard";
import type { PageId } from "../../components/layout/navigation";
import { PageContainer } from "../../components/layout/PageContainer";
import { MetricValue, Value } from "../../components/metrics/MetricValue";
import { StatList } from "../../components/metrics/StatList";
import { bytesParts, formatBytes, formatPercent, formatRate, pctParts, rateParts } from "../../lib/format";
import { useHardware } from "../../stores/hardware";
import { useTelemetry } from "../../stores/telemetry";
import type { PerfTab } from "../performance/PerformancePage";
import { Cockpit } from "./Cockpit";
import { StatRow } from "./StatRow";

const ratio = (v: number | null, max: number | null) => (v != null && max ? (v / max) * 100 : null);

interface Props {
  onNavigate: (p: PageId) => void;
  onOpenPerformance: (tab: PerfTab) => void;
}


export function OverviewPage({ onNavigate, onOpenPerformance }: Props) {
  const { system: s, disks, processes, history, stale } = useTelemetry();
  const { hardware } = useHardware();
  if (!s) return <LoadingState />;

  const gpu = s.gpus.value?.[0];
  const cores = s.cpu.perCorePercent.value;
  const busiest = cores && cores.length ? Math.max(...cores) : null;
  const vramUsed = gpu?.vramUsedBytes.value;
  const vramTotal = gpu?.vramTotalBytes.value;
  const vramPct = vramUsed != null && vramTotal ? (vramUsed / vramTotal) * 100 : null;
  const committed = s.memory.committedBytes.value;
  const commitLimit = s.memory.commitLimitBytes.value;
  const commitPct = committed != null && commitLimit ? (committed / commitLimit) * 100 : null;
  const systemDisk = disks?.disks.find((d) => d.mountPoint.toUpperCase().startsWith("C:")) ?? disks?.disks[0];
  const diskUsed = systemDisk ? systemDisk.totalBytes - systemDisk.availableBytes : null;
  const diskPct = systemDisk && systemDisk.totalBytes > 0 && diskUsed != null ? (diskUsed / systemDisk.totalBytes) * 100 : null;
  const top = [...(processes?.processes ?? [])].sort((a, b) => (b.cpuPercent ?? -1) - (a.cpuPercent ?? -1)).slice(0, 6);

  return (
    <PageContainer title="Overview" subtitle={hardware ? `${hardware.os.hostName ?? "This PC"} · ${hardware.cpu.brand ?? ""}` : "Live system telemetry"}>
      <Cockpit s={s} onOpen={onOpenPerformance} />

      <div className="cockpit-stats">
        <div className="cockpit-stats__column">
          <StatRow label="CPU Temperature" percent={s.cpu.temperatureC.value} value={<MetricValue metric={s.cpu.temperatureC} format={(v) => [v.toFixed(0), "°C"]} />} />
          <StatRow
            label="CPU Frequency"
            percent={ratio(s.cpu.frequencyMhz.value, s.cpu.peakFrequencyMhz.value)}
            scaleHint="Bar: share of the highest clock measured this session (Windows does not report max boost)"
            value={<MetricValue metric={s.cpu.frequencyMhz} format={(v) => [String(v), "MHz"]} />}
          />
          <StatRow label="Busiest core" percent={busiest} value={busiest != null ? <Value value={pctParts(busiest, 0)} /> : <span className="metric-value metric-value--missing">Measuring…</span>} />
          <StatRow label="Committed memory" percent={commitPct} value={<MetricValue metric={s.memory.committedBytes} format={(v) => bytesParts(v)} />} />
        </div>

        <button type="button" className="cockpit-stats__disk" onClick={() => onNavigate("storage")} aria-label="Storage: open details">
          <span className="cockpit-stats__disk-title">
            Disk usage {systemDisk?.mountPoint}
            {systemDisk && diskUsed != null && <strong>{formatBytes(diskUsed, 0)} / {formatBytes(systemDisk.totalBytes, 0)}</strong>}
          </span>
          <span className="cockpit-stats__disk-value">
            {diskPct != null ? <Value value={pctParts(diskPct, 0)} /> : <span className="metric-value metric-value--missing">Measuring…</span>}
          </span>
          <span className={`cockpit-stats__marker${diskPct != null && diskPct >= 90 ? " cockpit-stats__marker--danger" : ""}`} aria-hidden="true" />
          {diskPct != null && diskPct >= 90 && <span className="cockpit-stats__warning">Low free space</span>}
        </button>

        <div className="cockpit-stats__column">
          {gpu ? (
            <>
              <StatRow label="GPU Temperature" percent={gpu.temperatureC.value} value={<MetricValue metric={gpu.temperatureC} format={(v) => [v.toFixed(0), "°C"]} />} />
              <StatRow
                label="GPU Clock"
                percent={ratio(gpu.coreClockMhz.value, gpu.maxCoreClockMhz.value)}
                scaleHint={gpu.maxCoreClockMhz.value != null ? `Bar: share of the ${gpu.maxCoreClockMhz.value} MHz hardware maximum` : undefined}
                value={<MetricValue metric={gpu.coreClockMhz} format={(v) => [String(v), "MHz"]} />}
              />
              <StatRow label="GPU Memory" percent={vramPct} value={<MetricValue metric={gpu.vramUsedBytes} format={(v) => bytesParts(v)} />} />
              <StatRow label="GPU Fan" percent={gpu.fanPercent.value} value={<MetricValue metric={gpu.fanPercent} format={(v) => [v.toFixed(0), "%"]} />} />
            </>
          ) : (
            <StatRow label="GPU" value={<span className="metric-value metric-value--missing">No GPU detected</span>} />
          )}
        </div>
      </div>

      <HardwareCard
        title="Net"
        icon={Network}
        aside={
          <button type="button" className="button button--ghost" onClick={() => onNavigate("network")}>
            Adapters <ArrowRight className="button__icon" aria-hidden="true" />
          </button>
        }
      >
        <div className="net-split">
          <div className="net-split__item">
            <PerformanceChart size="lg" stale={stale} format={formatRate} series={[{ data: history.rx, color: "var(--color-chart-download)", label: "Download" }]} />
            <div className="net-split__caption">
              <ArrowDown className="net-split__icon u-download" aria-hidden="true" />
              Download: <MetricValue metric={s.network.rxBytesPerSec} format={rateParts} />
            </div>
          </div>
          <div className="net-split__item">
            <PerformanceChart size="lg" stale={stale} format={formatRate} series={[{ data: history.tx, color: "var(--color-chart-upload)", label: "Upload" }]} />
            <div className="net-split__caption">
              <ArrowUp className="net-split__icon u-upload" aria-hidden="true" />
              Upload: <MetricValue metric={s.network.txBytesPerSec} format={rateParts} />
            </div>
          </div>
        </div>
      </HardwareCard>

      <div className="grid grid--split">
        <HardwareCard
          title="Top processes"
          icon={List}
          aside={
            <button type="button" className="button button--ghost" onClick={() => onNavigate("processes")}>
              All processes <ArrowRight className="button__icon" aria-hidden="true" />
            </button>
          }
        >
          {!processes ? (
            <LoadingState label="Enumerating processes…" />
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th><span className="data-table__heading">Name</span></th>
                    <th className="is-numeric data-table__col--narrow"><span className="data-table__heading">PID</span></th>
                    <th className="is-numeric data-table__col--medium"><span className="data-table__heading">CPU</span></th>
                    <th className="is-numeric data-table__col--wide"><span className="data-table__heading">Memory</span></th>
                  </tr>
                </thead>
                <tbody>
                  {top.map((p) => (
                    <tr key={p.pid}>
                      <td className="data-table__primary" title={p.name}>{p.name}</td>
                      <td className="is-numeric data-table__mono">{p.pid}</td>
                      <td className="is-numeric data-table__mono">{p.cpuPercent == null ? "…" : formatPercent(p.cpuPercent)}</td>
                      <td className="is-numeric data-table__mono" title={p.memoryBytes == null ? "Access denied" : undefined}>
                        {p.memoryBytes == null ? "n/a" : formatBytes(p.memoryBytes)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </HardwareCard>
        <HardwareCard
          title="System"
          icon={CircuitBoard}
          aside={
            <button type="button" className="button button--ghost" onClick={() => onNavigate("hardware")}>
              Details <ArrowRight className="button__icon" aria-hidden="true" />
            </button>
          }
        >
          {!hardware ? (
            <LoadingState label="Reading hardware inventory…" />
          ) : (
            <StatList
              single
              items={[
                ["Processor", hardware.cpu.brand],
                ["Graphics", hardware.gpus.map((g) => g.model).filter(Boolean).join(", ") || null],
                ["Installed memory", hardware.memoryTotalBytes != null ? formatBytes(hardware.memoryTotalBytes, 0) : null],
                ["Operating system", hardware.os.longVersion ?? hardware.os.name],
              ]}
            />
          )}
        </HardwareCard>
      </div>
    </PageContainer>
  );
}
