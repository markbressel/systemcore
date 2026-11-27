import { useState } from "react";
import { useSmoothValue } from "../../hooks/useSmoothValue";
import { Gauge } from "../../components/metrics/Gauge";
import { MetricValue } from "../../components/metrics/MetricValue";
import { formatBytes, formatDuration, pctParts } from "../../lib/format";
import { t } from "../../lib/i18n";
import type { SystemSnapshot } from "../../types/telemetry";
import type { PerfTab } from "../performance/PerformancePage";

interface Props {
  s: SystemSnapshot;
  onOpen: (tab: PerfTab) => void;
}

// Instrument-cluster bezel: two squared-off dial pods joined by a shallow, flat bridge (not two round lobes).
// Stretches with the container.
const BEZEL =
  "M18 196C18 92 70 22 190 18L300 16C360 16 392 58 440 58L560 58C608 58 640 16 700 16L810 18C930 22 982 92 982 196C982 300 936 378 820 384L700 386C640 386 610 348 560 348L440 348C390 348 360 386 300 386L180 384C64 378 18 300 18 196Z";

// Small car-style temperature dial (C–H), like the coolant gauge beside a speedometer.
const TEMP_MIN = 40;
const TEMP_MAX = 100;
const TEMP_HOT = 90;
const tempPoint = (c: number, r: number) => {
  const f = Math.max(0, Math.min(1, (c - TEMP_MIN) / (TEMP_MAX - TEMP_MIN)));
  const a = ((200 + f * 140) * Math.PI) / 180;
  return [50 + r * Math.cos(a), 50 + r * Math.sin(a)] as const;
};
const tempArc = (from: number, to: number) => `M${tempPoint(from, 40).join(",")} A40,40 0 0 1 ${tempPoint(to, 40).join(",")}`;

function TempGauge({ celsius, label, name }: { celsius: number | null; label: string; name: string }) {
  const v = useSmoothValue(celsius);
  const [nx, ny] = tempPoint(v ?? TEMP_MIN, 34);
  const hot = celsius != null && celsius >= TEMP_HOT;
  return (
    <div
      className={`cockpit__temp${hot ? " cockpit__temp--hot" : ""}`}
      role="meter"
      aria-label={name}
      aria-valuemin={TEMP_MIN}
      aria-valuemax={TEMP_MAX}
      aria-valuenow={celsius == null ? undefined : Math.round(celsius)}
      aria-valuetext={celsius == null ? t("Not supported") : `${Math.round(celsius)} °C`}
    >
      <svg viewBox="0 0 100 66" aria-hidden="true">
        <path className="cockpit__temp-track" d={tempArc(TEMP_MIN, TEMP_HOT)} />
        <path className="cockpit__temp-red" d={tempArc(TEMP_HOT, TEMP_MAX)} />
        <text className="cockpit__temp-end" x="6" y="50">C</text>
        <text className="cockpit__temp-end" x="94" y="50" textAnchor="end">H</text>
        {v != null && <line className="cockpit__temp-needle" x1="50" y1="50" x2={nx} y2={ny} />}
        <circle className="cockpit__temp-hub" cx="50" cy="50" r="3.5" />
        <text className="cockpit__temp-value" x="50" y="64" textAnchor="middle">
          {label} {celsius == null ? "—" : `${Math.round(celsius)}°`}
        </text>
      </svg>
    </div>
  );
}

const INFO_KEY = "cockpit.info";

function readInfoIndex() {
  try {
    return Number(localStorage.getItem(INFO_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function Cockpit({ s, onOpen }: Props) {
  const cpu = s.cpu.usagePercent;
  const gpu = s.gpus.value?.[0];
  const mem = s.memory;
  const memPct = useSmoothValue(mem.usagePercent.value);
  const gpuMissing = !gpu ? (s.gpus.status === "available" ? t("No GPU") : t("Not supported")) : t("Measuring…");

  // Trip-computer line under the memory display; the arrows pick which reading it shows.
  const info: [string, string | null][] = [
    [t("Uptime"), s.uptimeSecs.value != null ? formatDuration(s.uptimeSecs.value) : null],
    [t("Power draw"), gpu?.powerWatts.value != null ? `${gpu.powerWatts.value.toFixed(0)} W` : null],
    [t("Ping"), s.network.latencyMs.value != null ? `${Math.round(s.network.latencyMs.value)} ms` : null],
    [t("Processes"), s.processCount.value != null ? String(s.processCount.value) : null],
  ];
  const [infoIndex, setInfoIndex] = useState(readInfoIndex);
  const [infoLabel, infoValue] = info[((infoIndex % info.length) + info.length) % info.length];
  const stepInfo = (d: number) => {
    const next = (infoIndex + d + info.length) % info.length;
    setInfoIndex(next);
    try {
      localStorage.setItem(INFO_KEY, String(next));
    } catch {
      // Only a remembered preference; fine to lose.
    }
  };

  return (
    <section className="cockpit" aria-label={t("Live system instruments")}>
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

      <button type="button" className="cockpit__dial" onClick={() => onOpen("cpu")} aria-label={t("CPU usage: open details")}>
        <Gauge value={cpu.status === "available" ? cpu.value : null} label={t("CPU Usage")} />
      </button>

      <div className="cockpit__middle">
        <button type="button" className="cockpit__center" onClick={() => onOpen("memory")} aria-label={t("Memory usage: open details")}>
          <span className="cockpit__banner">{t("Memory Usage")}</span>
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
        </button>

        <div className="cockpit__info">
          <button type="button" className="cockpit__arrow" onClick={() => stepInfo(-1)} aria-label={t("Previous reading")}>‹</button>
          <span className="cockpit__plate" key={infoLabel}>
            {infoLabel} <strong>{infoValue ?? "—"}</strong>
          </span>
          <button type="button" className="cockpit__arrow" onClick={() => stepInfo(1)} aria-label={t("Next reading")}>›</button>
        </div>

        <div className="cockpit__temps">
          <TempGauge celsius={s.cpu.temperatureC.value} label="CPU" name={t("CPU Temperature")} />
          <TempGauge celsius={gpu?.temperatureC.value ?? null} label="GPU" name={t("GPU Temperature")} />
        </div>
      </div>

      <button type="button" className="cockpit__dial" onClick={() => onOpen("gpu")} aria-label={t("GPU usage: open details")}>
        <Gauge value={gpu?.usagePercent.status === "available" ? gpu.usagePercent.value : null} label={t("GPU Usage")} missingText={gpuMissing} />
      </button>
    </section>
  );
}
