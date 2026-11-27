import { Cpu, History, MonitorPlay, Play, Square, Thermometer } from "lucide-react";
import { useEffect, useState } from "react";
import { PerformanceChart } from "../../components/charts/PerformanceChart";
import { ErrorState } from "../../components/feedback/States";
import { HardwareCard } from "../../components/hardware/HardwareCard";
import { PageContainer } from "../../components/layout/PageContainer";
import { Gauge } from "../../components/metrics/Gauge";
import { t } from "../../lib/i18n";
import { useTelemetry } from "../../stores/telemetry";
import { PHASE_SECONDS, runBenchmark, stopBenchmark, useBenchmark } from "../../stores/benchmark";
import { GameSearch } from "./GameSearch";

const TOTAL = PHASE_SECONDS * 2;
const gbOrNull = (bytes: number | null | undefined) => (bytes == null ? null : bytes / 1024 ** 3);
const temp = (v: number | null) => (v == null ? "—" : `${v.toFixed(0)} °C`);

/** "12 % below your best" against earlier runs; null when there is nothing to compare with. */
function versusBest(score: number | null, earlier: (number | null)[]) {
  const best = Math.max(...earlier.filter((x): x is number => x != null));
  if (score == null || !Number.isFinite(best) || best <= 0) return null;
  const diff = ((score - best) / best) * 100;
  if (Math.abs(diff) < 3) return { text: t("Same as your best run"), slower: false };
  return diff > 0 ? { text: t("{n} % above your best run", { n: diff.toFixed(0) }), slower: false } : { text: t("{n} % below your best run", { n: (-diff).toFixed(0) }), slower: diff <= -10 };
}

function ScoreTile({ icon: Icon, label, score, compare, active }: { icon: typeof Cpu; label: string; score: number | null; compare: ReturnType<typeof versusBest>; active: boolean }) {
  return (
    <div className={`speed-tile${active ? " speed-tile--active" : ""}`}>
      <div className="speed-tile__head">
        <Icon className="speed-tile__icon" aria-hidden="true" />
        {label}
      </div>
      <div className="speed-tile__value">
        {score == null ? "—" : score.toLocaleString()}
        <span className="speed-tile__unit">{t("points")}</span>
      </div>
      <div className={`speed-tile__sub${compare?.slower ? " u-danger" : ""}`}>{active ? t("Running…") : (compare?.text ?? t("First run: nothing to compare yet"))}</div>
    </div>
  );
}

export function BenchmarkPage() {
  const b = useBenchmark();
  const { system } = useTelemetry();
  const load = b.phase === "cpu" ? system?.cpu.usagePercent.value : b.phase === "gpu" ? system?.gpus.value?.[0]?.usagePercent.value : null;
  const running = b.phase != null;
  // Re-render every second while running so the progress bar moves.
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [running]);

  const elapsed = b.phase ? (b.phase === "gpu" ? PHASE_SECONDS : 0) + Math.min(PHASE_SECONDS, (Date.now() - b.phaseStartedAt) / 1000) : 0;
  const progress = running ? (elapsed / TOTAL) * 100 : b.cpuScore != null ? 100 : 0;
  // Compare the latest run with the ones before it.
  const [latest, ...earlier] = b.results;
  const showLatest = !running && b.cpuScore != null && latest;
  const shown: { cpuScore: number | null; gpuScore: number | null } = running ? { cpuScore: b.cpuScore, gpuScore: null } : showLatest ? latest : { cpuScore: null, gpuScore: null };
  const cpuCompare = showLatest ? versusBest(latest.cpuScore, earlier.map((r) => r.cpuScore)) : null;
  const gpuCompare = showLatest ? versusBest(latest.gpuScore, earlier.map((r) => r.gpuScore)) : null;
  const slower = cpuCompare?.slower || gpuCompare?.slower;

  return (
    <PageContainer
      title={t("Benchmark")}
      subtitle={t("{s} s on every CPU core, then {s} s of heavy GPU shading. Compare runs over time to spot a PC that got slower.", { s: PHASE_SECONDS })}
    >
      {b.error && <ErrorState message={t(b.error)} />}

      <section className="speedtest panel">
        <div className="speedtest__dial">
          <Gauge
            value={load ?? null}
            label={b.phase === "cpu" ? t("CPU load") : b.phase === "gpu" ? t("GPU load") : t("Ready")}
            missingText={running ? t("Measuring…") : t("Press start")}
          />
        </div>
        <div className="speedtest__side">
          <ol className="speedtest__steps" aria-label={t("Test progress")}>
            {(["cpu", "gpu"] as const).map((p, i) => {
              const state = b.phase === p ? "active" : (b.phase === "gpu" && i === 0) || (!running && b.cpuScore != null) ? "done" : "pending";
              return (
                <li key={p} className={`speedtest__step speedtest__step--${state}`}>
                  {p === "cpu" ? t("CPU load") : t("GPU load")}
                </li>
              );
            })}
          </ol>
          <div className="metric-indicator" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
            <span className="metric-indicator__fill" style={{ width: `${progress}%` }} />
          </div>
          {running ? (
            <button type="button" className="speedtest__go speedtest__go--stop" onClick={stopBenchmark}>
              <Square className="speedtest__go-icon" aria-hidden="true" /> {t("Cancel")}
            </button>
          ) : (
            <button type="button" className="speedtest__go" onClick={() => void runBenchmark()}>
              <Play className="speedtest__go-icon" aria-hidden="true" /> {b.cpuScore != null ? t("Run again") : t("Start test")}
            </button>
          )}
          <p className="page__note">
            {t("Close games and heavy programs first for a fair score. The PC runs at full load for a minute, so fans will spin up. Scores only compare runs on this PC.")}
          </p>
          {b.throttled && (
            <p className="page__note u-danger">
              {t("The PC slowed itself down because it got too hot during this test, so the score is lower than it could be. Check the fans, dust and airflow.")}
            </p>
          )}
          {slower && !running && (
            <p className="page__note u-danger">
              {t("This run is clearly slower than your best. Common causes: dust in the cooler, high temperatures, or programs running in the background.")}
            </p>
          )}
        </div>
      </section>

      <div className="speedtest__tiles">
        <ScoreTile icon={Cpu} label={t("CPU score")} score={shown.cpuScore} compare={cpuCompare} active={b.phase === "cpu"} />
        <ScoreTile icon={MonitorPlay} label={t("GPU score")} score={shown.gpuScore} compare={gpuCompare} active={b.phase === "gpu"} />
      </div>

      <GameSearch
        pc={{
          cpu: latest?.cpuScore ?? null,
          gpu: latest?.gpuScore ?? null,
          vramGb: gbOrNull(system?.gpus.value?.[0]?.vramTotalBytes.value),
          ramGb: gbOrNull(system?.memory.totalBytes.value),
        }}
      />

      {b.cpuTemp.length > 0 && (
        <HardwareCard title={t("Temperature during the test")} icon={Thermometer}>
          <PerformanceChart
            size="lg"
            length={TOTAL}
            max={110}
            format={(v) => `${v.toFixed(0)} °C`}
            startLabel="0 s"
            agoLabel={(n) => `${b.cpuTemp.length - 1 - n} s`}
            series={[
              { label: "CPU", color: "var(--color-chart-cpu)", data: b.cpuTemp },
              { label: "GPU", color: "var(--color-chart-gpu)", data: b.gpuTemp },
            ]}
          />
          {b.cpuTemp.every((x) => x == null) && <p className="page__note">{t("CPU temperature needs LibreHardwareMonitor running; GPU temperature is NVIDIA-only for now.")}</p>}
        </HardwareCard>
      )}

      {b.results.length > 0 && (
        <HardwareCard title={t("Earlier runs")} icon={History}>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th><span className="data-table__heading">{t("Date")}</span></th>
                  <th className="is-numeric"><span className="data-table__heading">{t("CPU score")}</span></th>
                  <th className="is-numeric"><span className="data-table__heading">{t("GPU score")}</span></th>
                  <th className="is-numeric"><span className="data-table__heading">{t("CPU max")}</span></th>
                  <th className="is-numeric"><span className="data-table__heading">{t("GPU max")}</span></th>
                </tr>
              </thead>
              <tbody>
                {b.results.map((r) => (
                  <tr key={r.finishedAt}>
                    <td className="data-table__primary">{new Date(r.finishedAt).toLocaleString()}</td>
                    <td className="is-numeric data-table__mono">{r.cpuScore.toLocaleString()}</td>
                    <td className="is-numeric data-table__mono">{r.gpuScore?.toLocaleString() ?? "—"}</td>
                    <td className="is-numeric data-table__mono">{temp(r.cpuMaxTempC)}</td>
                    <td className="is-numeric data-table__mono">
                      {temp(r.gpuMaxTempC)}
                      {r.throttled && <span className="u-danger" title={t("Slowed down from heat during this run")}> · {t("hot")}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </HardwareCard>
      )}
    </PageContainer>
  );
}
