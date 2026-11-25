import { useSmoothValue } from "../../hooks/useSmoothValue";
import { Gauge } from "../../components/metrics/Gauge";
import { MetricValue } from "../../components/metrics/MetricValue";
import { formatBytes, formatDuration, pctParts } from "../../lib/format";
import type { SystemSnapshot } from "../../types/telemetry";
import type { PerfTab } from "../performance/PerformancePage";

interface Props {
  s: SystemSnapshot;
  onOpen: (tab: PerfTab) => void;
}

// Instrument-panel bezel: two round lobes joined by a waisted bridge. Stretches with the container.
const BEZEL =
  "M20 200C20 70 110 12 230 12C340 12 390 92 500 92C610 92 660 12 770 12C890 12 980 70 980 200C980 330 890 388 770 388C660 388 610 308 500 308C390 308 340 388 230 388C110 388 20 330 20 200Z";

export function Cockpit({ s, onOpen }: Props) {
  const cpu = s.cpu.usagePercent;
  const gpu = s.gpus.value?.[0];
  const mem = s.memory;
  const memPct = useSmoothValue(mem.usagePercent.value);
  const gpuMissing = !gpu ? (s.gpus.status === "available" ? "No GPU" : "Not supported") : "Measuring…";

  return (
    <section className="cockpit" aria-label="Live system instruments">
      <svg className="cockpit__bezel" viewBox="0 0 1000 400" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <radialGradient id="cockpit-fill" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="var(--color-accent-soft)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--color-bg-tertiary)" />
          </radialGradient>
        </defs>
        <path d={BEZEL} className="cockpit__bezel-shape" fill="url(#cockpit-fill)" />
        <path d={BEZEL} className="cockpit__bezel-inner" transform="translate(500 200) scale(0.965 0.93) translate(-500 -200)" />
      </svg>

      <button type="button" className="cockpit__dial" onClick={() => onOpen("cpu")} aria-label="CPU usage: open details">
        <Gauge value={cpu.status === "available" ? cpu.value : null} label="CPU Usage" />
      </button>

      <button type="button" className="cockpit__center" onClick={() => onOpen("memory")} aria-label="Memory usage: open details">
        <span className="cockpit__banner">Memory Usage</span>
        <span className="cockpit__big">
          <MetricValue metric={mem.usagePercent} format={(v) => pctParts(v, 0)} />
        </span>
        <span className="cockpit__bar" aria-hidden="true">
          <span className="cockpit__bar-fill" style={{ width: `${memPct ?? 0}%` }} />
        </span>
        <span className="cockpit__sub">
          {mem.usedBytes.value != null && mem.totalBytes.value != null
            ? `${formatBytes(mem.usedBytes.value)} / ${formatBytes(mem.totalBytes.value, 0)}`
            : "—"}
        </span>
        <span className="cockpit__plate">
          Uptime <strong>{s.uptimeSecs.value != null ? formatDuration(s.uptimeSecs.value) : "—"}</strong>
        </span>
      </button>

      <button type="button" className="cockpit__dial" onClick={() => onOpen("gpu")} aria-label="GPU usage: open details">
        <Gauge value={gpu?.usagePercent.status === "available" ? gpu.usagePercent.value : null} label="GPU Usage" missingText={gpuMissing} />
      </button>
    </section>
  );
}
