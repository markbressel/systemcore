import { Activity, Cpu, Gamepad2, Gauge, GitCompareArrows, MemoryStick, Network, Thermometer } from "lucide-react";
import { useEffect, useState } from "react";
import { PerformanceChart } from "../../components/charts/PerformanceChart";
import { EmptyState } from "../../components/feedback/States";
import { HardwareCard } from "../../components/hardware/HardwareCard";
import { PageContainer } from "../../components/layout/PageContainer";
import { formatRate } from "../../lib/format";
import { getHistory } from "../../lib/tauri";
import { t } from "../../lib/i18n";
import { useJournal } from "../../stores/journal";
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
    if (s < 60) return t("now");
    return s < 3600 ? t("{n} min ago", { n: Math.round(s / 60) }) : t("{n} h ago", { n: (s / 3600).toFixed(1) });
  };
}

const num = (v: number | null, unit = "") => (v == null ? "—" : `${v.toFixed(0)}${unit}`);

function duration(ms: number) {
  const m = Math.round(ms / 60_000);
  return m < 60 ? t("{m} min", { m }) : t("{h} h {m} min", { h: Math.floor(m / 60), m: String(m % 60).padStart(2, "0") });
}

export function HistoryPage() {
  const { sessions, changes } = useJournal();
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
  const common = { length: SLOTS, size: "lg" as const, startLabel: `−${t(RANGES.find((r) => r.minutes === minutes)?.label ?? "")}`, agoLabel: ago(minutes) };
  const pct = (v: number) => `${v.toFixed(0)}%`;

  return (
    <PageContainer
      title={t("History")}
      subtitle={t("Recorded every 5 seconds while SystemCore runs (also in the tray). Kept for 24 hours, on this PC only.")}
      actions={
        <div className="tabs" role="tablist" aria-label={t("Time range")}>
          {RANGES.map((r) => (
            <button
              key={r.minutes}
              type="button"
              role="tab"
              aria-selected={minutes === r.minutes}
              className={`tabs__tab${minutes === r.minutes ? " tabs__tab--active" : ""}`}
              onClick={() => setMinutes(r.minutes)}
            >
              {t(r.label)}
            </button>
          ))}
        </div>
      }
    >
      {points && !has("cpu") ? (
        <EmptyState icon={Activity}>{t("No history yet. The first points appear a few seconds after SystemCore starts.")}</EmptyState>
      ) : (
        <div className="history">
          <HardwareCard title={t("Load")} icon={Cpu}>
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
          <HardwareCard title={t("Temperatures")} icon={Thermometer} aside={<span className="history__note">{t("Peak per interval")}</span>}>
            <PerformanceChart
              {...common}
              format={(v) => `${v.toFixed(0)}°C`}
              series={[
                { label: "CPU", color: "var(--color-chart-cpu)", data: col("cpuTemp") },
                { label: "GPU", color: "var(--color-chart-gpu)", data: col("gpuTemp") },
              ]}
            />
          </HardwareCard>
          <HardwareCard title={t("Memory")} icon={MemoryStick}>
            <PerformanceChart {...common} max={100} format={pct} series={[{ label: "RAM", color: "var(--color-chart-memory)", data: col("ram") }]} />
          </HardwareCard>
          <HardwareCard title={t("Network")} icon={Network}>
            <PerformanceChart
              {...common}
              format={formatRate}
              series={[
                { label: t("Download"), color: "var(--color-chart-download)", data: col("rx") },
                { label: t("Upload"), color: "var(--color-chart-upload)", data: col("tx") },
              ]}
            />
          </HardwareCard>
          <HardwareCard title="Ping" icon={Activity}>
            <PerformanceChart {...common} format={(v) => `${v.toFixed(0)} ms`} series={[{ label: "Ping", color: "var(--color-accent)", data: col("ping") }]} />
          </HardwareCard>
          {has("fps") && (
            <HardwareCard title={t("Frame rate")} icon={Gauge} aside={<span className="history__note">{t("Foreground app")}</span>}>
              <PerformanceChart {...common} format={(v) => `${v.toFixed(0)} fps`} series={[{ label: "FPS", color: "var(--color-accent)", data: col("fps") }]} />
            </HardwareCard>
          )}
        </div>
      )}

      <HardwareCard title={t("Game sessions")} icon={Gamepad2} aside={<span className="history__note">{t("Fullscreen for 2+ minutes")}</span>}>
        {sessions.length === 0 ? (
          <p className="page__note">{t("No game sessions yet. Play something in fullscreen; a summary appears here (and as a notification) when you close it. FPS needs administrator rights.")}</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th><span className="data-table__heading">{t("Game")}</span></th>
                  <th><span className="data-table__heading">{t("Started")}</span></th>
                  <th className="is-numeric"><span className="data-table__heading">{t("Played")}</span></th>
                  <th className="is-numeric"><span className="data-table__heading">{t("Avg FPS")}</span></th>
                  <th className="is-numeric"><span className="data-table__heading">{t("1% low")}</span></th>
                  <th className="is-numeric"><span className="data-table__heading">{t("CPU max")}</span></th>
                  <th className="is-numeric"><span className="data-table__heading">{t("GPU max")}</span></th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.startedAt}>
                    <td className="data-table__primary" title={s.process}>{s.process.replace(/\.exe$/i, "")}</td>
                    <td className="data-table__mono">{new Date(s.startedAt).toLocaleString()}</td>
                    <td className="is-numeric data-table__mono">{duration(s.endedAt - s.startedAt)}</td>
                    <td className="is-numeric data-table__mono">{num(s.avgFps)}</td>
                    <td className="is-numeric data-table__mono">{num(s.low1Fps)}</td>
                    <td className="is-numeric data-table__mono">{num(s.cpuMaxTempC, " °C")}</td>
                    <td className="is-numeric data-table__mono">{num(s.gpuMaxTempC, " °C")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </HardwareCard>

      <HardwareCard title={t("Changes on this PC")} icon={GitCompareArrows} aside={<span className="history__note">{t("Checked every hour")}</span>}>
        {changes.length === 0 ? (
          <p className="page__note">{t("Nothing has changed yet. New startup apps, graphics driver updates and sudden drops in free disk space show up here.")}</p>
        ) : (
          <ul className="change-log">
            {changes.map((c, i) => (
              <li key={`${c.at}-${i}`} className={`change-log__item change-log__item--${c.kind}`}>
                <span className="change-log__time">{new Date(c.at).toLocaleString()}</span>
                {c.text}
              </li>
            ))}
          </ul>
        )}
      </HardwareCard>
    </PageContainer>
  );
}
