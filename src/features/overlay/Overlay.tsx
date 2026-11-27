import { currentMonitor, getCurrentWindow, LogicalSize, PhysicalPosition } from "@tauri-apps/api/window";
import { Activity, AppWindow, ArrowDown, ArrowUp, Lock, Move, X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import logo from "../../assets/logo.png";
import { formatBytes, formatRate } from "../../lib/format";
import { setOverlay, showMain } from "../../lib/tauri";
import { startAppearance, updateOverlay, useSettings } from "../../stores/settings";
import { startTelemetry, useTelemetry } from "../../stores/telemetry";
import type { Metric } from "../../types/telemetry";
import { bottleneck, LIMIT_TEXT } from "./bottleneck";
import { cornerPosition } from "./placement";
import { t } from "../../lib/i18n";

const v = (m: Metric<number> | undefined) => (m?.status === "available" ? m.value : null);
// Red from where the part starts protecting itself: NVIDIA GPUs throttle around 83 °C, Ryzen/Intel CPUs at 95–100 °C.
const HOT_C = { cpu: 90, gpu: 83 };
const temp = (c: number | null, hot: number) => (c == null ? null : <span className={c >= hot ? "overlay__hot" : undefined}>{c.toFixed(0)}°C</span>);
const usedOf = (used: number | null, total: number | null) => (used == null ? null : `${formatBytes(used)}${total ? ` / ${formatBytes(total, 0)}` : ""}`);

interface RowProps {
  label: string;
  tone: "cpu" | "gpu" | "memory";
  percent: number | null;
  /** Shown big next to the label; undefined = no temperature slot (RAM). */
  tempC?: number | null;
  details: ReactNode[];
}

function Row({ label, tone, percent, tempC, details }: RowProps) {
  const shown = details.filter((d) => d != null);
  return (
    <div className={`overlay__row overlay__row--${tone}`}>
      <span className="overlay__label">{label}</span>
      {tempC !== undefined && (
        <span className="overlay__temp" title={tempC == null ? t("No temperature reading. CPU temperature needs SystemCore running as administrator.") : undefined}>
          {temp(tempC, HOT_C[tone as "cpu" | "gpu"]) ?? "—°C"}
        </span>
      )}
      <span className="overlay__bar" aria-hidden="true">
        <span style={{ width: `${Math.min(100, percent ?? 0)}%` }} />
      </span>
      <span className="overlay__value">
        {percent == null ? "—" : percent.toFixed(0)}
        <small>%</small>
      </span>
      <span className="overlay__details">{shown.length ? shown.map((d, i) => <span key={i}>{d}</span>) : "—"}</span>
    </div>
  );
}

function Chip({ label, tone, percent, extra }: { label: string; tone: RowProps["tone"]; percent: number | null; extra?: ReactNode }) {
  return (
    <span className={`overlay__chip overlay__row--${tone}`}>
      <b className="overlay__label">{label}</b>
      <span className="overlay__value">{percent == null ? "—" : `${percent.toFixed(0)}%`}</span>
      {extra != null && <span className="overlay__extra">{extra}</span>}
    </span>
  );
}

/** Frameless always-on-top mini window. Placement comes from Settings → Overlay. */
export function Overlay() {
  useEffect(startTelemetry, []);
  useEffect(startAppearance, []);
  const { system, stale } = useTelemetry();
  const { overlay: o } = useSettings();
  const movable = o.freeMove && !o.locked;

  const root = useRef<HTMLElement>(null);
  const rowsKey = Object.values(o.rows).join();

  // The window follows the card: resize to its rendered size, then place it. Re-runs when the card's
  // content size changes (rows, compact, values) and when scale, mode or corner change.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const win = getCurrentWindow();
    let busy = Promise.resolve();
    const place = (move: boolean) =>
      (busy = busy.then(async () => {
        const r = el.getBoundingClientRect();
        await win.setSize(new LogicalSize(Math.ceil(r.width), Math.ceil(r.height)));
        if (!move) return;
        const m = await currentMonitor();
        const size = await win.outerSize();
        if (o.freeMove && o.position) {
          const p = o.position;
          // A saved spot can be off screen after a resolution change (games often switch it in exclusive
          // fullscreen); then fall back to the corner so the overlay stays visible.
          const onScreen = !m || (p.x >= m.position.x && p.y >= m.position.y && p.x + size.width <= m.position.x + m.size.width && p.y + size.height <= m.position.y + m.size.height);
          if (onScreen) {
            await win.setPosition(new PhysicalPosition(p.x, p.y));
            return;
          }
        }
        if (!m) return;
        const area = { ...m.workArea.position, ...m.workArea.size };
        const { x, y } = cornerPosition(o.corner, area, size, Math.round(16 * m.scaleFactor));
        await win.setPosition(new PhysicalPosition(x, y));
      }).catch(() => {}));
    void place(true);
    // A content-size change only resizes in free mode: this effect's saved position may be older than the
    // user's last drag. Corners still re-place so a right/bottom edge stays anchored.
    const ro = new ResizeObserver(() => void place(!o.freeMove));
    ro.observe(el);
    // Display mode changes (a fullscreen game switching resolution) fire no window event: poll for them.
    let display = `${screen.width}x${screen.height}@${devicePixelRatio}`;
    const watch = setInterval(() => {
      const now = `${screen.width}x${screen.height}@${devicePixelRatio}`;
      if (now !== display) {
        display = now;
        void place(true);
      }
    }, 1000);
    return () => {
      ro.disconnect();
      clearInterval(watch);
    };
    // o.position is deliberately not a dependency: re-placing on every saved drag would fight the drag.
  }, [o.freeMove, o.corner, o.scale, o.compact, rowsKey]);

  // Remember where the user dragged it.
  useEffect(() => {
    if (!movable) return;
    let timer = 0;
    const off = getCurrentWindow().onMoved(({ payload }) => {
      clearTimeout(timer);
      timer = window.setTimeout(() => updateOverlay({ position: { x: payload.x, y: payload.y } }), 300);
    });
    return () => {
      clearTimeout(timer);
      void off.then((f) => f());
    };
  }, [movable]);

  const cpu = system?.cpu;
  const gpu = system?.gpus.value?.[0];
  const mem = system?.memory;
  const ghz = v(cpu?.frequencyMhz);
  const watts = v(gpu?.powerWatts);
  const rx = v(system?.network.rxBytesPerSec);
  const tx = v(system?.network.txBytesPerSec);
  const ping = v(system?.network.latencyMs);
  const game = system?.game;
  const fps = v(game?.fps);
  const frameMs = v(game?.frameTimeMs);
  const low1 = v(game?.low1Fps);
  // Short reason when FPS is missing: no admin rights, or the foreground app is not rendering.
  const fpsHint = game?.fps.status === "unsupported" ? t("Needs admin") : t("No frames");
  const cores = cpu?.perCorePercent.status === "available" ? cpu.perCorePercent.value : null;
  // Only meaningful while a game is running.
  const limit =
    o.rows.limit && (game?.fullscreen || fps != null)
      ? bottleneck({
          gpuPercent: v(gpu?.usagePercent),
          cpuPercent: v(cpu?.usagePercent),
          busiestCorePercent: cores?.length ? Math.max(...cores) : null,
          cpuThrottling: cpu?.thermalThrottling ?? null,
          gpuThrottling: gpu?.thermalThrottling ?? null,
        })
      : null;
  const limitHot = limit === "cpu-hot" || limit === "gpu-hot";

  const rows = o.rows;
  const actions = (
    // Shown on hover; mousedown must not start a window drag.
    <span className="overlay__actions" onMouseDown={(e) => e.stopPropagation()}>
      <button type="button" className="overlay__action" title={t("Open SystemCore")} aria-label={t("Open SystemCore")} onClick={() => void showMain()}>
        <AppWindow aria-hidden="true" />
      </button>
      <button type="button" className="overlay__action" title={t("Close overlay")} aria-label={t("Close overlay")} onClick={() => void setOverlay(false)}>
        <X aria-hidden="true" />
      </button>
    </span>
  );
  const live = <span className={`overlay__live${stale || !system ? " overlay__live--off" : ""}`} title={stale ? t("Data stale") : t("Live")} />;
  const modeIcon = movable ? <Move className="overlay__mode" aria-label={t("Drag to move")} /> : o.freeMove ? <Lock className="overlay__mode" aria-label={t("Position locked")} /> : null;
  const rateText = (r: number | null) => (r == null ? "—" : formatRate(r));
  const pingText = ping == null ? "—" : `${ping.toFixed(0)} ms`;

  return (
    <main
      ref={root}
      className={`overlay${o.compact ? " overlay--compact" : ""}${movable ? " overlay--movable" : ""}`}
      style={{ zoom: o.scale }}
      onMouseDown={(e) => {
        if (movable && e.button === 0) void getCurrentWindow().startDragging();
      }}
    >
      {o.compact ? (
        <>
          <img className="overlay__logo" src={logo} alt="" />
          {live}
          {rows.fps && (
            <span className="overlay__chip overlay__chip--fps">
              <b className="overlay__label">FPS</b>
              <span className="overlay__value">{fps == null ? "—" : fps.toFixed(0)}</span>
            </span>
          )}
          {limit && (
            <span className={`overlay__chip overlay__chip--limit${limitHot ? " overlay__hot" : ""}`} title={t("What holds the frame rate back")}>
              <b className="overlay__label">{t("LIMIT")}</b>
              <span className="overlay__value">{t(LIMIT_TEXT[limit])}</span>
            </span>
          )}
          {rows.cpu && <Chip label="CPU" tone="cpu" percent={v(cpu?.usagePercent)} extra={temp(v(cpu?.temperatureC), HOT_C.cpu)} />}
          {rows.gpu && <Chip label="GPU" tone="gpu" percent={v(gpu?.usagePercent)} extra={temp(v(gpu?.temperatureC), HOT_C.gpu)} />}
          {rows.ram && <Chip label="RAM" tone="memory" percent={v(mem?.usagePercent)} />}
          {rows.net && (
            <span className="overlay__chip overlay__chip--net">
              <ArrowDown aria-hidden="true" />
              <span className="overlay__rate">{rateText(rx)}</span>
              <ArrowUp aria-hidden="true" />
              <span className="overlay__rate">{rateText(tx)}</span>
              <Activity aria-hidden="true" />
              <span className="overlay__ping">{pingText}</span>
            </span>
          )}
          {modeIcon}
          {actions}
        </>
      ) : (
        <>
          <header className="overlay__head">
            <img className="overlay__logo" src={logo} alt="" />
            <span className="overlay__brand">
              SYSTEM<b>CORE</b>
            </span>
            {modeIcon}
            {live}
            {actions}
          </header>

          {rows.fps && (
            <div className="overlay__fps" title={game?.process ?? undefined}>
              <span className="overlay__fps-value">
                {fps == null ? "—" : fps.toFixed(0)}
                <small>FPS</small>
              </span>
              <span className="overlay__fps-details">
                {fps == null ? (
                  <span>{fpsHint}</span>
                ) : (
                  <>
                    <span>{frameMs?.toFixed(1)} ms</span>
                    <span>{t("1% low")} {low1?.toFixed(0)}</span>
                  </>
                )}
                <span className="overlay__fps-app">{game?.process?.replace(/\.exe$/i, "") ?? ""}</span>
              </span>
            </div>
          )}
          {limit && (
            <div className={`overlay__limit${limitHot ? " overlay__hot" : ""}`} title={t("What holds the frame rate back")}>
              {t("Limited by")} <b>{t(LIMIT_TEXT[limit])}</b>
            </div>
          )}
          {rows.cpu && <Row label="CPU" tone="cpu" percent={v(cpu?.usagePercent)} tempC={v(cpu?.temperatureC)} details={[ghz == null ? null : `${(ghz / 1000).toFixed(2)} GHz`]} />}
          {rows.gpu && (
            <Row
              label="GPU"
              tone="gpu"
              percent={v(gpu?.usagePercent)}
              tempC={v(gpu?.temperatureC)}
              details={[usedOf(v(gpu?.vramUsedBytes), v(gpu?.vramTotalBytes)), watts == null ? null : `${watts.toFixed(0)} W`]}
            />
          )}
          {rows.ram && <Row label="RAM" tone="memory" percent={v(mem?.usagePercent)} details={[usedOf(v(mem?.usedBytes), v(mem?.totalBytes))]} />}

          {rows.net && (
            <footer className="overlay__net">
              <span>
                <ArrowDown aria-hidden="true" /> {rateText(rx)}
              </span>
              <span>
                <Activity aria-hidden="true" /> {pingText}
              </span>
              <span>
                <ArrowUp aria-hidden="true" /> {rateText(tx)}
              </span>
            </footer>
          )}
        </>
      )}
    </main>
  );
}
