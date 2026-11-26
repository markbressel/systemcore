import { Activity, Cpu, Gauge, MemoryStick, Network, Thermometer } from "lucide-react";
import { useEffect, useState } from "react";
import { PerformanceChart } from "../../components/charts/PerformanceChart";
import { EmptyState } from "../../components/feedback/States";
import { HardwareCard } from "../../components/hardware/HardwareCard";
import { PageContainer } from "../../components/layout/PageContainer";
import { formatRate } from "../../lib/format";
import { getHistory } from "../../lib/tauri";
import type { HistoryPoint } from "../../types/telemetry";

const RANGES = [
  { minutes: 60, label: "1 hour" },
  { minutes: 360, label: "6 hours" },
  { minutes: 1440, label: "24 hours" },
];

/** Buckets returned per request (fixed by the backend). */
const SLOTS = 360;
const REFRESH_MS = 10_000;

function ago(minutes: number) {
  const slotSecs = (minutes * 60) / SLOTS;
  return (n: number) => {
    const s = n * slotSecs;
    if (s < 60) return "now";
    return s < 3600 ? `${Math.round(s / 60)} min ago` : `${(s / 3600).toFixed(1)} h ago`;
  };
}

export function HistoryPage() {
  const [minutes, setMinutes] = useState(60);
  const [points, setPoints] = useState<HistoryPoint[] | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => getHistory(minutes).then((p) => alive && setPoints(p)).catch(() => alive && setPoints([]));
    void load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [minutes]);

  const col = (k: keyof HistoryPoint) => (points ?? []).map((p) => p[k]);
  const has = (k: keyof HistoryPoint) => (points ?? []).some((p) => p[k] != null);
  const common = { length: SLOTS, size: "lg" as const, startLabel: `−${RANGES.find((r) => r.minutes === minutes)?.label}`, agoLabel: ago(minutes) };
  const pct = (v: number) => `${v.toFixed(0)}%`;

  return (
    <PageContainer
      title="History"
      subtitle="Recorded every 5 seconds while SystemCore runs (also in the tray). Kept for 24 hours, on this PC only."
      actions={
        <div className="tabs" role="tablist" aria-label="Time range">
          {RANGES.map((r) => (
            <button
              key={r.minutes}
              type="button"
              role="tab"
              aria-selected={minutes === r.minutes}
              className={`tabs__tab${minutes === r.minutes ? " tabs__tab--active" : ""}`}
              onClick={() => setMinutes(r.minutes)}
            >
              {r.label}
            </button>
          ))}
        </div>
      }
    >
      {points && !has("cpu") ? (
        <EmptyState icon={Activity}>No history yet. The first points appear a few seconds after SystemCore starts.</EmptyState>
      ) : (
        <div className="history">
          <HardwareCard title="Load" icon={Cpu}>
            <PerformanceChart
              {...common}
              max={100}
              format={pct}
              series={[
                { label: "CPU", color: "var(--color-chart-cpu)", data: col("cpu") },
                { label: "GPU", color: "var(--color-chart-gpu)", data: col("gpu") },
              ]}
            />
          </HardwareCard>
          <HardwareCard title="Temperatures" icon={Thermometer} aside={<span className="history__note">Peak per interval</span>}>
            <PerformanceChart
              {...common}
              format={(v) => `${v.toFixed(0)}°C`}
              series={[
                { label: "CPU", color: "var(--color-chart-cpu)", data: col("cpuTemp") },
                { label: "GPU", color: "var(--color-chart-gpu)", data: col("gpuTemp") },
              ]}
            />
          </HardwareCard>
          <HardwareCard title="Memory" icon={MemoryStick}>
            <PerformanceChart {...common} max={100} format={pct} series={[{ label: "RAM", color: "var(--color-chart-memory)", data: col("ram") }]} />
          </HardwareCard>
          <HardwareCard title="Network" icon={Network}>
            <PerformanceChart
              {...common}
              format={formatRate}
              series={[
                { label: "Download", color: "var(--color-chart-download)", data: col("rx") },
                { label: "Upload", color: "var(--color-chart-upload)", data: col("tx") },
              ]}
            />
          </HardwareCard>
          <HardwareCard title="Ping" icon={Activity}>
            <PerformanceChart {...common} format={(v) => `${v.toFixed(0)} ms`} series={[{ label: "Ping", color: "var(--color-accent)", data: col("ping") }]} />
          </HardwareCard>
          {has("fps") && (
            <HardwareCard title="Frame rate" icon={Gauge} aside={<span className="history__note">Foreground app</span>}>
              <PerformanceChart {...common} format={(v) => `${v.toFixed(0)} fps`} series={[{ label: "FPS", color: "var(--color-accent)", data: col("fps") }]} />
            </HardwareCard>
          )}
        </div>
      )}
    </PageContainer>
  );
}
