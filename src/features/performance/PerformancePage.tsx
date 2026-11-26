import { Cpu, Gauge as GaugeIcon, Grid3x3, MemoryStick, Monitor, PieChart, Thermometer } from "lucide-react";
import { PerformanceChart } from "../../components/charts/PerformanceChart";
import { EmptyState, LoadingState } from "../../components/feedback/States";
import { MetricStatus } from "../../components/feedback/StatusBadge";
import { HardwareCard } from "../../components/hardware/HardwareCard";
import { PageContainer } from "../../components/layout/PageContainer";
import { Gauge } from "../../components/metrics/Gauge";
import { MetricIndicator } from "../../components/metrics/MetricIndicator";
import { MetricValue } from "../../components/metrics/MetricValue";
import { StatList } from "../../components/metrics/StatList";
import { bytesParts, formatBytes, formatPercent } from "../../lib/format";
import { t } from "../../lib/i18n";
import { useSmoothValue } from "../../hooks/useSmoothValue";
import { useHardware } from "../../stores/hardware";
import { useTelemetry, type TelemetryState } from "../../stores/telemetry";
import type { SystemSnapshot } from "../../types/telemetry";

export type PerfTab = "cpu" | "memory" | "gpu";

const TABS = [
  { id: "cpu", label: "CPU", icon: Cpu },
  { id: "memory", label: "Memory", icon: MemoryStick },
  { id: "gpu", label: "GPU", icon: Monitor },
] as const;

const fmtPct = (v: number) => formatPercent(v, 0);
const bytes = (v: number) => bytesParts(v, 2);

interface Props {
  tab: PerfTab;
  onTab: (t: PerfTab) => void;
}

export function PerformancePage({ tab, onTab }: Props) {
  const tm = useTelemetry();
  if (!tm.system) return <LoadingState />;

  return (
    <PageContainer
      title={t("Performance")}
      subtitle={t("Detailed resource telemetry · 60-second history")}
      actions={
        <div className="tabs" role="tablist" aria-label={t("Resource")}>
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`tabs__tab${tab === id ? " tabs__tab--active" : ""}`}
              onClick={() => onTab(id)}
            >
              <Icon className="tabs__icon" aria-hidden="true" />
              {t(label)}
            </button>
          ))}
        </div>
      }
    >
      {tab === "cpu" && <CpuView s={tm.system} tm={tm} />}
      {tab === "memory" && <MemoryView s={tm.system} tm={tm} />}
      {tab === "gpu" && <GpuView s={tm.system} tm={tm} />}
    </PageContainer>
  );
}

interface ViewProps {
  s: SystemSnapshot;
  tm: TelemetryState;
}

function CpuView({ s, tm }: ViewProps) {
  const { hardware } = useHardware();
  const { cpu } = s;
  const cores = cpu.perCorePercent.value;
  return (
    <>
      <HardwareCard title={hardware?.cpu.brand ?? t("Processor")} icon={Cpu} aside={<MetricStatus status={cpu.usagePercent.status} source={cpu.usagePercent.source} />}>
        <div className="readout">
          <Gauge size="md" label={t("CPU Usage")} value={cpu.usagePercent.status === "available" ? cpu.usagePercent.value : null} />
          <div>
            <div className="readout__label">{t("Current frequency")}</div>
            <div className="readout__value readout__value--sm" title={t("May report base clock on some systems")}>
              <MetricValue metric={cpu.frequencyMhz} format={(v) => [(v / 1000).toFixed(2), "GHz"]} />
            </div>
          </div>
          <div>
            <div className="readout__label">{t("Temperature")}</div>
            <div className="readout__value readout__value--sm"><MetricValue metric={cpu.temperatureC} format={(v) => [v.toFixed(0), "°C"]} /></div>
          </div>
        </div>
        <PerformanceChart title={t("Total utilization · %")} size="lg" max={100} format={fmtPct} stale={tm.stale} series={[{ data: tm.history.cpu, color: "var(--color-chart-cpu)", label: "CPU" }]} />
        <StatList
          items={[
            [t("Vendor"), hardware?.cpu.vendor],
            [t("Architecture"), hardware?.cpu.architecture],
            [t("Physical cores"), hardware?.cpu.physicalCores],
            [t("Logical processors"), hardware?.cpu.logicalProcessors || cores?.length],
            [t("Base frequency"), <MetricValue metric={cpu.baseFrequencyMhz} format={(v) => [(v / 1000).toFixed(2), "GHz"]} />],
          ]}
        />
      </HardwareCard>

      <HardwareCard title={t("Per-core utilization")} icon={Grid3x3} aside={cores && <span>{t("{count} logical processors", { count: cores.length })}</span>}>
        {cores ? (
          <div className="core-grid">
            {cores.map((c, i) => (
              <div key={i} className="core-grid__cell">
                <div className="core-grid__top">
                  <span className="core-grid__id">CPU {i}</span>
                  <span className="core-grid__value">{c.toFixed(0)}%</span>
                </div>
                <MetricIndicator resource="cpu" thin percent={c} label={t("Logical processor {n}", { n: i })} />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState compact>{t("Measuring per-core usage…")}</EmptyState>
        )}
      </HardwareCard>
    </>
  );
}

function MemoryView({ s, tm }: ViewProps) {
  const mem = s.memory;
  const used = mem.usedBytes.value;
  const total = mem.totalBytes.value;
  const usedPct = used != null && total ? (used / total) * 100 : null;
  const smoothUsed = useSmoothValue(usedPct);
  return (
    <>
      <HardwareCard title={t("Physical memory")} icon={MemoryStick} aside={<MetricStatus status={mem.usagePercent.status} source={mem.usagePercent.source} />}>
        <div className="readout">
          <Gauge size="md" label={t("Memory")} value={mem.usagePercent.status === "available" ? mem.usagePercent.value : null} />
          <div>
            <div className="readout__label">{t("In use")}</div>
            <div className="readout__value"><MetricValue metric={mem.usedBytes} format={bytes} /></div>
          </div>
          <div>
            <div className="readout__label">{t("Available")}</div>
            <div className="readout__value readout__value--sm"><MetricValue metric={mem.availableBytes} format={bytes} /></div>
          </div>
        </div>
        <PerformanceChart title={t("Memory utilization · %")} size="lg" max={100} format={fmtPct} stale={tm.stale} series={[{ data: tm.history.memory, color: "var(--color-chart-memory)", label: t("Memory") }]} />
      </HardwareCard>

      <HardwareCard title={t("Memory distribution")} icon={PieChart}>
        {usedPct != null && total != null && used != null ? (
          <div className="distribution">
            <div className="distribution__bar" role="img" aria-label={t("{used} in use, {free} available", { used: formatPercent(usedPct), free: formatPercent(100 - usedPct) })}>
              <div className="distribution__part distribution__part--memory" style={{ width: `${smoothUsed ?? usedPct}%` }} />
              <div className="distribution__part distribution__part--free" />
            </div>
            <div className="distribution__legend">
              <span className="chart__legend-item" style={{ ["--series-color" as string]: "var(--color-chart-memory)" }}>
                {t("In use")} · <span className="u-mono">{formatBytes(used, 2)}</span>
              </span>
              <span className="chart__legend-item" style={{ ["--series-color" as string]: "var(--color-surface-active)" }}>
                {t("Available")} · <span className="u-mono">{formatBytes(total - used, 2)}</span>
              </span>
            </div>
          </div>
        ) : (
          <EmptyState compact>{t("Measuring…")}</EmptyState>
        )}
        <StatList
          items={[
            [t("Total physical"), <MetricValue metric={mem.totalBytes} format={bytes} />],
            [t("Committed"), <MetricValue metric={mem.committedBytes} format={bytes} />],
            [t("Commit limit"), <MetricValue metric={mem.commitLimitBytes} format={bytes} />],
            [t("Page file in use"), <MetricValue metric={mem.swapUsedBytes} format={bytes} />],
            [t("Page file size"), <MetricValue metric={mem.swapTotalBytes} format={bytes} />],
          ]}
        />
      </HardwareCard>
    </>
  );
}

function GpuView({ s, tm }: ViewProps) {
  if (s.gpus.status !== "available") {
    return <EmptyState icon={Monitor}><MetricValue metric={s.gpus} format={() => ""} /></EmptyState>;
  }
  const gpus = s.gpus.value ?? [];
  if (gpus.length === 0) return <EmptyState icon={Monitor}>{t("No GPU detected by the provider.")}</EmptyState>;

  return (
    <>
      {gpus.map((g, i) => {
        const used = g.vramUsedBytes.value;
        const total = g.vramTotalBytes.value;
        const vramPct = used != null && total ? (used / total) * 100 : null;
        return (
          <HardwareCard key={g.id} title={g.model ?? t("Unknown GPU")} icon={Monitor} aside={<MetricStatus status={g.usagePercent.status} source={g.usagePercent.source} />}>
            <div className="readout">
              <Gauge size="md" label={t("GPU Usage")} value={g.usagePercent.status === "available" ? g.usagePercent.value : null} />
              <div>
                <div className="readout__label">{t("Dedicated memory")}</div>
                <div className="readout__value readout__value--sm"><MetricValue metric={g.vramUsedBytes} format={bytes} /></div>
              </div>
              <div>
                <div className="readout__label">{t("Temperature")}</div>
                <div className="readout__value readout__value--sm"><MetricValue metric={g.temperatureC} format={(v) => [v.toFixed(0), "°C"]} /></div>
              </div>
              <div>
                <div className="readout__label">{t("Power draw")}</div>
                <div className="readout__value readout__value--sm"><MetricValue metric={g.powerWatts} format={(v) => [v.toFixed(1), "W"]} /></div>
              </div>
            </div>
            {i === 0 && (
              <PerformanceChart title={t("GPU utilization · %")} size="lg" max={100} format={fmtPct} stale={tm.stale} series={[{ data: tm.history.gpu, color: "var(--color-chart-gpu)", label: "GPU" }]} />
            )}
            <div className="grid grid--halves">
              <div>
                <div className="panel__group-title"><GaugeIcon className="tabs__icon" aria-hidden="true" /> {t("Memory")}{vramPct != null && ` · ${t("{pct}% dedicated in use", { pct: vramPct.toFixed(0) })}`}</div>
                {vramPct != null && <MetricIndicator resource="gpu" percent={vramPct} label={t("Dedicated memory usage")} />}
                <StatList
                  single
                  items={[
                    [t("Dedicated used"), <MetricValue metric={g.vramUsedBytes} format={bytes} />],
                    [t("Dedicated total"), <MetricValue metric={g.vramTotalBytes} format={bytes} />],
                    [t("Shared memory"), <MetricValue metric={g.sharedUsedBytes} format={bytes} />],
                  ]}
                />
              </div>
              <div>
                <div className="panel__group-title"><Thermometer className="tabs__icon" aria-hidden="true" /> {t("Sensors")}</div>
                <StatList
                  single
                  items={[
                    [t("Vendor"), g.vendor],
                    [t("Temperature"), <MetricValue metric={g.temperatureC} format={(v) => [v.toFixed(0), "°C"]} />],
                    [t("Core clock"), <MetricValue metric={g.coreClockMhz} format={(v) => [String(v), "MHz"]} />],
                    [t("Memory clock"), <MetricValue metric={g.memoryClockMhz} format={(v) => [String(v), "MHz"]} />],
                    [t("Power draw"), <MetricValue metric={g.powerWatts} format={(v) => [v.toFixed(1), "W"]} />],
                    [t("Fan"), <MetricValue metric={g.fanPercent} format={(v) => [v.toFixed(0), "%"]} />],
                  ]}
                />
              </div>
            </div>
          </HardwareCard>
        );
      })}
    </>
  );
}
