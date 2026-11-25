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
  const t = useTelemetry();
  if (!t.system) return <LoadingState />;

  return (
    <PageContainer
      title="Performance"
      subtitle="Detailed resource telemetry · 60-second history"
      actions={
        <div className="tabs" role="tablist" aria-label="Resource">
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
              {label}
            </button>
          ))}
        </div>
      }
    >
      {tab === "cpu" && <CpuView s={t.system} t={t} />}
      {tab === "memory" && <MemoryView s={t.system} t={t} />}
      {tab === "gpu" && <GpuView s={t.system} t={t} />}
    </PageContainer>
  );
}

interface ViewProps {
  s: SystemSnapshot;
  t: TelemetryState;
}

function CpuView({ s, t }: ViewProps) {
  const { hardware } = useHardware();
  const { cpu } = s;
  const cores = cpu.perCorePercent.value;
  return (
    <>
      <HardwareCard title={hardware?.cpu.brand ?? "Processor"} icon={Cpu} aside={<MetricStatus status={cpu.usagePercent.status} source={cpu.usagePercent.source} />}>
        <div className="readout">
          <Gauge size="md" label="CPU Usage" value={cpu.usagePercent.status === "available" ? cpu.usagePercent.value : null} />
          <div>
            <div className="readout__label">Current frequency</div>
            <div className="readout__value readout__value--sm" title="May report base clock on some systems">
              <MetricValue metric={cpu.frequencyMhz} format={(v) => [(v / 1000).toFixed(2), "GHz"]} />
            </div>
          </div>
          <div>
            <div className="readout__label">Temperature</div>
            <div className="readout__value readout__value--sm"><MetricValue metric={cpu.temperatureC} format={(v) => [v.toFixed(0), "°C"]} /></div>
          </div>
        </div>
        <PerformanceChart title="Total utilization · %" size="lg" max={100} format={fmtPct} stale={t.stale} series={[{ data: t.history.cpu, color: "var(--color-chart-cpu)", label: "CPU" }]} />
        <StatList
          items={[
            ["Vendor", hardware?.cpu.vendor],
            ["Architecture", hardware?.cpu.architecture],
            ["Physical cores", hardware?.cpu.physicalCores],
            ["Logical processors", hardware?.cpu.logicalProcessors || cores?.length],
            ["Base frequency", <MetricValue metric={cpu.baseFrequencyMhz} format={(v) => [(v / 1000).toFixed(2), "GHz"]} />],
          ]}
        />
      </HardwareCard>

      <HardwareCard title="Per-core utilization" icon={Grid3x3} aside={cores && <span>{cores.length} logical processors</span>}>
        {cores ? (
          <div className="core-grid">
            {cores.map((c, i) => (
              <div key={i} className="core-grid__cell">
                <div className="core-grid__top">
                  <span className="core-grid__id">CPU {i}</span>
                  <span className="core-grid__value">{c.toFixed(0)}%</span>
                </div>
                <MetricIndicator resource="cpu" thin percent={c} label={`Logical processor ${i}`} />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState compact>Measuring per-core usage…</EmptyState>
        )}
      </HardwareCard>
    </>
  );
}

function MemoryView({ s, t }: ViewProps) {
  const mem = s.memory;
  const used = mem.usedBytes.value;
  const total = mem.totalBytes.value;
  const usedPct = used != null && total ? (used / total) * 100 : null;
  const smoothUsed = useSmoothValue(usedPct);
  return (
    <>
      <HardwareCard title="Physical memory" icon={MemoryStick} aside={<MetricStatus status={mem.usagePercent.status} source={mem.usagePercent.source} />}>
        <div className="readout">
          <Gauge size="md" label="Memory" value={mem.usagePercent.status === "available" ? mem.usagePercent.value : null} />
          <div>
            <div className="readout__label">In use</div>
            <div className="readout__value"><MetricValue metric={mem.usedBytes} format={bytes} /></div>
          </div>
          <div>
            <div className="readout__label">Available</div>
            <div className="readout__value readout__value--sm"><MetricValue metric={mem.availableBytes} format={bytes} /></div>
          </div>
        </div>
        <PerformanceChart title="Memory utilization · %" size="lg" max={100} format={fmtPct} stale={t.stale} series={[{ data: t.history.memory, color: "var(--color-chart-memory)", label: "Memory" }]} />
      </HardwareCard>

      <HardwareCard title="Memory distribution" icon={PieChart}>
        {usedPct != null && total != null && used != null ? (
          <div className="distribution">
            <div className="distribution__bar" role="img" aria-label={`${formatPercent(usedPct)} in use, ${formatPercent(100 - usedPct)} available`}>
              <div className="distribution__part distribution__part--memory" style={{ width: `${smoothUsed ?? usedPct}%` }} />
              <div className="distribution__part distribution__part--free" />
            </div>
            <div className="distribution__legend">
              <span className="chart__legend-item" style={{ ["--series-color" as string]: "var(--color-chart-memory)" }}>
                In use · <span className="u-mono">{formatBytes(used, 2)}</span>
              </span>
              <span className="chart__legend-item" style={{ ["--series-color" as string]: "var(--color-surface-active)" }}>
                Available · <span className="u-mono">{formatBytes(total - used, 2)}</span>
              </span>
            </div>
          </div>
        ) : (
          <EmptyState compact>Measuring…</EmptyState>
        )}
        <StatList
          items={[
            ["Total physical", <MetricValue metric={mem.totalBytes} format={bytes} />],
            ["Committed", <MetricValue metric={mem.committedBytes} format={bytes} />],
            ["Commit limit", <MetricValue metric={mem.commitLimitBytes} format={bytes} />],
            ["Page file in use", <MetricValue metric={mem.swapUsedBytes} format={bytes} />],
            ["Page file size", <MetricValue metric={mem.swapTotalBytes} format={bytes} />],
          ]}
        />
      </HardwareCard>
    </>
  );
}

function GpuView({ s, t }: ViewProps) {
  if (s.gpus.status !== "available") {
    return <EmptyState icon={Monitor}><MetricValue metric={s.gpus} format={() => ""} /></EmptyState>;
  }
  const gpus = s.gpus.value ?? [];
  if (gpus.length === 0) return <EmptyState icon={Monitor}>No GPU detected by the provider.</EmptyState>;

  return (
    <>
      {gpus.map((g, i) => {
        const used = g.vramUsedBytes.value;
        const total = g.vramTotalBytes.value;
        const vramPct = used != null && total ? (used / total) * 100 : null;
        return (
          <HardwareCard key={g.id} title={g.model ?? "Unknown GPU"} icon={Monitor} aside={<MetricStatus status={g.usagePercent.status} source={g.usagePercent.source} />}>
            <div className="readout">
              <Gauge size="md" label="GPU Usage" value={g.usagePercent.status === "available" ? g.usagePercent.value : null} />
              <div>
                <div className="readout__label">Dedicated memory</div>
                <div className="readout__value readout__value--sm"><MetricValue metric={g.vramUsedBytes} format={bytes} /></div>
              </div>
              <div>
                <div className="readout__label">Temperature</div>
                <div className="readout__value readout__value--sm"><MetricValue metric={g.temperatureC} format={(v) => [v.toFixed(0), "°C"]} /></div>
              </div>
              <div>
                <div className="readout__label">Power draw</div>
                <div className="readout__value readout__value--sm"><MetricValue metric={g.powerWatts} format={(v) => [v.toFixed(1), "W"]} /></div>
              </div>
            </div>
            {i === 0 && (
              <PerformanceChart title="GPU utilization · %" size="lg" max={100} format={fmtPct} stale={t.stale} series={[{ data: t.history.gpu, color: "var(--color-chart-gpu)", label: "GPU" }]} />
            )}
            <div className="grid grid--halves">
              <div>
                <div className="panel__group-title"><GaugeIcon className="tabs__icon" aria-hidden="true" /> Memory{vramPct != null && ` · ${vramPct.toFixed(0)}% dedicated in use`}</div>
                {vramPct != null && <MetricIndicator resource="gpu" percent={vramPct} label="Dedicated memory usage" />}
                <StatList
                  single
                  items={[
                    ["Dedicated used", <MetricValue metric={g.vramUsedBytes} format={bytes} />],
                    ["Dedicated total", <MetricValue metric={g.vramTotalBytes} format={bytes} />],
                    ["Shared memory", <MetricValue metric={g.sharedUsedBytes} format={bytes} />],
                  ]}
                />
              </div>
              <div>
                <div className="panel__group-title"><Thermometer className="tabs__icon" aria-hidden="true" /> Sensors</div>
                <StatList
                  single
                  items={[
                    ["Vendor", g.vendor],
                    ["Temperature", <MetricValue metric={g.temperatureC} format={(v) => [v.toFixed(0), "°C"]} />],
                    ["Core clock", <MetricValue metric={g.coreClockMhz} format={(v) => [String(v), "MHz"]} />],
                    ["Memory clock", <MetricValue metric={g.memoryClockMhz} format={(v) => [String(v), "MHz"]} />],
                    ["Power draw", <MetricValue metric={g.powerWatts} format={(v) => [v.toFixed(1), "W"]} />],
                    ["Fan", <MetricValue metric={g.fanPercent} format={(v) => [v.toFixed(0), "%"]} />],
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
