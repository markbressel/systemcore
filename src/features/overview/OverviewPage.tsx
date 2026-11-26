import { ArrowDown, ArrowRight, ArrowUp, CircuitBoard, HeartPulse, List, Network } from "lucide-react";
import { useEffect, useState } from "react";
import { PerformanceChart } from "../../components/charts/PerformanceChart";
import { LoadingState } from "../../components/feedback/States";
import { HardwareCard } from "../../components/hardware/HardwareCard";
import type { PageId } from "../../components/layout/navigation";
import { PageContainer } from "../../components/layout/PageContainer";
import { MetricValue, Value } from "../../components/metrics/MetricValue";
import { StatList } from "../../components/metrics/StatList";
import { Gauge } from "../../components/metrics/Gauge";
import { listStartupApps } from "../../lib/tauri";
import { t } from "../../lib/i18n";
import { bytesParts, formatBytes, formatPercent, formatRate, pctParts, rateParts } from "../../lib/format";
import { useHardware } from "../../stores/hardware";
import { useTelemetry } from "../../stores/telemetry";
import type { PerfTab } from "../performance/PerformancePage";
import { Cockpit } from "./Cockpit";
import { healthScore } from "./health";
import { SlowCheck } from "./SlowCheck";
import { StatRow } from "./StatRow";

// Plain 0–100 dial: passing a scale turns off the gauge's "high = bad" warning colors.
const SCORE_SCALE = { position: (v: number) => v, labels: [0, 20, 40, 60, 80].map((at) => ({ at, text: String(at) })) };

const ratio = (v: number | null, max: number | null) => (v != null && max ? (v / max) * 100 : null);

interface Props {
  onNavigate: (p: PageId) => void;
  onOpenPerformance: (tab: PerfTab) => void;
}


export function OverviewPage({ onNavigate, onOpenPerformance }: Props) {
  const { system: s, disks, processes, history, stale } = useTelemetry();
  const { hardware } = useHardware();
  const [startupApps, setStartupApps] = useState<number | null>(null);
  useEffect(() => {
    listStartupApps()
      .then((apps) => setStartupApps(apps.filter((a) => a.enabled).length))
      .catch(() => {});
  }, []);
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
  const health = healthScore({
    cpuTempC: s.cpu.temperatureC.value,
    gpuTempC: gpu?.temperatureC.value ?? null,
    ramPercent: s.memory.usagePercent.value,
    disks: (disks?.disks ?? []).filter((d) => !d.removable).map((d) => ({ mount: d.mountPoint, health: d.health, totalBytes: d.totalBytes, availableBytes: d.availableBytes })),
    startupApps,
    throttling: !!s.cpu.thermalThrottling || !!gpu?.thermalThrottling,
  });
  const top = [...(processes?.processes ?? [])].sort((a, b) => (b.cpuPercent ?? -1) - (a.cpuPercent ?? -1)).slice(0, 6);

  return (
    <PageContainer title={t("Overview")} subtitle={hardware ? `${hardware.os.hostName ?? t("This PC")} · ${hardware.cpu.brand ?? ""}` : t("Live system telemetry")}>
      <Cockpit s={s} onOpen={onOpenPerformance} />

      <div className="cockpit-stats">
        <div className="cockpit-stats__column">
          <StatRow label={t("CPU Temperature")} percent={s.cpu.temperatureC.value} value={<MetricValue metric={s.cpu.temperatureC} format={(v) => [v.toFixed(0), "°C"]} />} />
          <StatRow
            label={t("CPU Frequency")}
            percent={ratio(s.cpu.frequencyMhz.value, s.cpu.peakFrequencyMhz.value)}
            scaleHint={t("Bar: share of the highest clock measured this session (Windows does not report max boost)")}
            value={<MetricValue metric={s.cpu.frequencyMhz} format={(v) => [String(v), "MHz"]} />}
          />
          <StatRow label={t("Busiest core")} percent={busiest} value={busiest != null ? <Value value={pctParts(busiest, 0)} /> : <span className="metric-value metric-value--missing">{t("Measuring…")}</span>} />
          <StatRow label={t("Committed memory")} percent={commitPct} value={<MetricValue metric={s.memory.committedBytes} format={(v) => bytesParts(v)} />} />
        </div>

        <button type="button" className="cockpit-stats__disk" onClick={() => onNavigate("storage")} aria-label={t("Storage: open details")}>
          <span className="cockpit-stats__disk-title">
            {t("Disk usage")} {systemDisk?.mountPoint}
            {systemDisk && diskUsed != null && <strong>{formatBytes(diskUsed, 0)} / {formatBytes(systemDisk.totalBytes, 0)}</strong>}
          </span>
          <span className="cockpit-stats__disk-value">
            {diskPct != null ? <Value value={pctParts(diskPct, 0)} /> : <span className="metric-value metric-value--missing">{t("Measuring…")}</span>}
          </span>
          <span className={`cockpit-stats__marker${diskPct != null && diskPct >= 90 ? " cockpit-stats__marker--danger" : ""}`} aria-hidden="true" />
          {diskPct != null && diskPct >= 90 && <span className="cockpit-stats__warning">{t("Low free space")}</span>}
        </button>

        <div className="cockpit-stats__column">
          {gpu ? (
            <>
              <StatRow label={t("GPU Temperature")} percent={gpu.temperatureC.value} value={<MetricValue metric={gpu.temperatureC} format={(v) => [v.toFixed(0), "°C"]} />} />
              <StatRow
                label={t("GPU Clock")}
                percent={ratio(gpu.coreClockMhz.value, gpu.maxCoreClockMhz.value)}
                scaleHint={gpu.maxCoreClockMhz.value != null ? t("Bar: share of the {mhz} MHz hardware maximum", { mhz: gpu.maxCoreClockMhz.value }) : undefined}
                value={<MetricValue metric={gpu.coreClockMhz} format={(v) => [String(v), "MHz"]} />}
              />
              <StatRow label={t("GPU Memory")} percent={vramPct} value={<MetricValue metric={gpu.vramUsedBytes} format={(v) => bytesParts(v)} />} />
              <StatRow label={t("GPU Fan")} percent={gpu.fanPercent.value} value={<MetricValue metric={gpu.fanPercent} format={(v) => [v.toFixed(0), "%"]} />} />
            </>
          ) : (
            <StatRow label="GPU" value={<span className="metric-value metric-value--missing">{t("No GPU detected")}</span>} />
          )}
        </div>
      </div>

      <div className="grid grid--split">
      <HardwareCard title={t("PC health")} icon={HeartPulse}>
        <div className="readout health">
          <Gauge value={health.score} label={t("Health")} unit="/100" size="md" scale={SCORE_SCALE} />
          <div className="health__text">
            <p className="health__summary">{health.issues[0] ?? t("Everything looks good: temperatures, drives, memory and startup apps are all fine.")}</p>
            {health.issues.length > 1 && (
              <ul className="health__issues">
                {health.issues.slice(1).map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </HardwareCard>
      <SlowCheck />
      </div>

      <HardwareCard
        title={t("Net")}
        icon={Network}
        aside={
          <button type="button" className="button button--ghost" onClick={() => onNavigate("network")}>
            {t("Adapters")} <ArrowRight className="button__icon" aria-hidden="true" />
          </button>
        }
      >
        <div className="net-split">
          <div className="net-split__item">
            <PerformanceChart size="lg" stale={stale} format={formatRate} series={[{ data: history.rx, color: "var(--color-chart-download)", label: t("Download") }]} />
            <div className="net-split__caption">
              <ArrowDown className="net-split__icon u-download" aria-hidden="true" />
              {t("Download")}: <MetricValue metric={s.network.rxBytesPerSec} format={rateParts} />
            </div>
          </div>
          <div className="net-split__item">
            <PerformanceChart size="lg" stale={stale} format={formatRate} series={[{ data: history.tx, color: "var(--color-chart-upload)", label: t("Upload") }]} />
            <div className="net-split__caption">
              <ArrowUp className="net-split__icon u-upload" aria-hidden="true" />
              {t("Upload")}: <MetricValue metric={s.network.txBytesPerSec} format={rateParts} />
            </div>
          </div>
        </div>
      </HardwareCard>

      <div className="grid grid--split">
        <HardwareCard
          title={t("Top processes")}
          icon={List}
          aside={
            <button type="button" className="button button--ghost" onClick={() => onNavigate("processes")}>
              {t("All processes")} <ArrowRight className="button__icon" aria-hidden="true" />
            </button>
          }
        >
          {!processes ? (
            <LoadingState label={t("Enumerating processes…")} />
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th><span className="data-table__heading">{t("Name")}</span></th>
                    <th className="is-numeric data-table__col--narrow"><span className="data-table__heading">PID</span></th>
                    <th className="is-numeric data-table__col--medium"><span className="data-table__heading">CPU</span></th>
                    <th className="is-numeric data-table__col--wide"><span className="data-table__heading">{t("Memory")}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {top.map((p) => (
                    <tr key={p.pid}>
                      <td className="data-table__primary" title={p.name}>{p.name}</td>
                      <td className="is-numeric data-table__mono">{p.pid}</td>
                      <td className="is-numeric data-table__mono">{p.cpuPercent == null ? "…" : formatPercent(p.cpuPercent)}</td>
                      <td className="is-numeric data-table__mono" title={p.memoryBytes == null ? t("Access denied") : undefined}>
                        {p.memoryBytes == null ? t("n/a") : formatBytes(p.memoryBytes)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </HardwareCard>
        <HardwareCard
          title={t("System")}
          icon={CircuitBoard}
          aside={
            <button type="button" className="button button--ghost" onClick={() => onNavigate("hardware")}>
              {t("Details")} <ArrowRight className="button__icon" aria-hidden="true" />
            </button>
          }
        >
          {!hardware ? (
            <LoadingState label={t("Reading hardware inventory…")} />
          ) : (
            <StatList
              single
              items={[
                [t("Processor"), hardware.cpu.brand],
                [t("Graphics"), hardware.gpus.map((g) => g.model).filter(Boolean).join(", ") || null],
                [t("Installed memory"), hardware.memoryTotalBytes != null ? formatBytes(hardware.memoryTotalBytes, 0) : null],
                [t("Operating system"), hardware.os.longVersion ?? hardware.os.name],
              ]}
            />
          )}
        </HardwareCard>
      </div>
    </PageContainer>
  );
}
