import { ArrowDown, ArrowUp, History, Play, Square, Timer } from "lucide-react";
import type { ReactNode } from "react";
import { ErrorState } from "../../components/feedback/States";
import { HardwareCard } from "../../components/hardware/HardwareCard";
import { PageContainer } from "../../components/layout/PageContainer";
import { Gauge } from "../../components/metrics/Gauge";
import { useSmoothValue } from "../../hooks/useSmoothValue";
import { t } from "../../lib/i18n";
import { runSpeedTest, stopSpeedTest, useSpeedTest } from "../../stores/speedtest";
import type { SpeedPhase } from "../../types/telemetry";
import { formatMbps, SPEED_SCALE } from "./speedScale";

const STEPS: { phase: SpeedPhase; label: string }[] = [
  { phase: "ping", label: "Ping" },
  { phase: "download", label: "Download" },
  { phase: "upload", label: "Upload" },
];
const ORDER: SpeedPhase[] = ["connecting", "ping", "download", "upload", "done"];

const DIAL_LABEL: Record<SpeedPhase, string> = {
  connecting: "Connecting…",
  ping: "Measuring ping",
  download: "Download",
  upload: "Upload",
  done: "Complete",
};

interface TileProps {
  icon: typeof Timer;
  label: string;
  value: number | null;
  unit: string;
  format: (v: number) => string;
  active: boolean;
  sub?: ReactNode;
  tone: "ping" | "download" | "upload";
}

function ResultTile({ icon: Icon, label, value, unit, format, active, sub, tone }: TileProps) {
  return (
    <div className={`speed-tile speed-tile--${tone}${active ? " speed-tile--active" : ""}`}>
      <div className="speed-tile__head">
        <Icon className="speed-tile__icon" aria-hidden="true" />
        {t(label)}
      </div>
      <div className="speed-tile__value">
        {value == null ? "—" : format(value)}
        <span className="speed-tile__unit">{unit}</span>
      </div>
      <div className="speed-tile__sub">{sub}</div>
    </div>
  );
}

export function SpeedTestPage() {
  const { running, live, error, history } = useSpeedTest();
  const phase = live?.phase ?? null;
  const stepIndex = phase ? ORDER.indexOf(phase) : -1;
  const progress = useSmoothValue((live?.progress ?? 0) * 100) ?? 0;

  // The dial follows the active transfer and rests at 0 otherwise, so it glides down between phases and after the test.
  const dialValue = (phase === "upload" ? live?.uploadMbps : phase === "download" ? live?.downloadMbps : null) ?? 0;

  return (
    <PageContainer
      title={t("Speed Test")}
      subtitle={t("Ping, download and upload measured against Cloudflare's global network (speed.cloudflare.com). Runs only when you start it.")}
    >
      {error && <ErrorState message={t(error)} />}

      <section className="speedtest panel">
        <div className="speedtest__dial">
          <Gauge
            value={running || phase === "done" ? dialValue : null}
            label={t(phase ? DIAL_LABEL[phase] : "Ready")}
            missingText={running ? t("Measuring…") : t("Press start")}
            scale={SPEED_SCALE}
            unit="Mbps"
            formatValue={formatMbps}
          />
        </div>

        <div className="speedtest__side">
          <ol className="speedtest__steps" aria-label={t("Test progress")}>
            {STEPS.map((s) => {
              const i = ORDER.indexOf(s.phase);
              const state = stepIndex > i ? "done" : stepIndex === i ? "active" : "pending";
              return (
                <li key={s.phase} className={`speedtest__step speedtest__step--${state}`}>
                  {t(s.label)}
                </li>
              );
            })}
          </ol>
          <div className="metric-indicator" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
            <span className="metric-indicator__fill" style={{ width: `${progress}%` }} />
          </div>

          {running ? (
            <button type="button" className="speedtest__go speedtest__go--stop" onClick={() => void stopSpeedTest()}>
              <Square className="speedtest__go-icon" aria-hidden="true" /> {t("Cancel")}
            </button>
          ) : (
            <button type="button" className="speedtest__go" onClick={() => void runSpeedTest()}>
              <Play className="speedtest__go-icon" aria-hidden="true" /> {phase === "done" ? t("Run again") : t("Start test")}
            </button>
          )}

          <p className="page__note">
            {live?.server ? `${t("Server: Cloudflare · {server}", { server: live.server })} · ` : ""}
            {t("About 10 s per direction. On fast connections a test can use several hundred MB of data.")}
          </p>
        </div>
      </section>

      <div className="speedtest__tiles">
        <ResultTile
          tone="ping"
          icon={Timer}
          label="Ping"
          unit="ms"
          value={live?.pingMs ?? null}
          format={(v) => v.toFixed(0)}
          active={phase === "ping" || phase === "connecting"}
          sub={live?.jitterMs != null ? t("Jitter {ms} ms", { ms: live.jitterMs.toFixed(1) }) : t("Round-trip time")}
        />
        <ResultTile
          tone="download"
          icon={ArrowDown}
          label="Download"
          unit="Mbps"
          value={live?.downloadMbps ?? null}
          format={formatMbps}
          active={phase === "download"}
          sub={phase === "download" ? t("Live") : phase === "upload" || phase === "done" ? t("Final") : t("6 parallel streams")}
        />
        <ResultTile
          tone="upload"
          icon={ArrowUp}
          label="Upload"
          unit="Mbps"
          value={live?.uploadMbps ?? null}
          format={formatMbps}
          active={phase === "upload"}
          sub={phase === "upload" ? t("Live") : phase === "done" ? t("Final") : t("4 parallel streams")}
        />
      </div>

      {history.length > 0 && (
        <HardwareCard title={t("Results this session")} icon={History}>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th><span className="data-table__heading">{t("Time")}</span></th>
                  <th className="is-numeric"><span className="data-table__heading">{t("Ping")}</span></th>
                  <th className="is-numeric"><span className="data-table__heading">{t("Jitter")}</span></th>
                  <th className="is-numeric"><span className="data-table__heading">{t("Download")}</span></th>
                  <th className="is-numeric"><span className="data-table__heading">{t("Upload")}</span></th>
                  <th className="is-numeric"><span className="data-table__heading">{t("Server")}</span></th>
                </tr>
              </thead>
              <tbody>
                {history.map((r) => (
                  <tr key={r.finishedAt}>
                    <td className="data-table__primary">{new Date(r.finishedAt).toLocaleTimeString()}</td>
                    <td className="is-numeric data-table__mono">{r.pingMs?.toFixed(0) ?? "—"} ms</td>
                    <td className="is-numeric data-table__mono">{r.jitterMs?.toFixed(1) ?? "—"} ms</td>
                    <td className="is-numeric data-table__mono u-download">{r.downloadMbps != null ? formatMbps(r.downloadMbps) : "—"} Mbps</td>
                    <td className="is-numeric data-table__mono u-upload">{r.uploadMbps != null ? formatMbps(r.uploadMbps) : "—"} Mbps</td>
                    <td className="is-numeric data-table__mono">{r.server ?? "—"}</td>
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
