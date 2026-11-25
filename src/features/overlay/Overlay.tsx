import { currentMonitor, getCurrentWindow, PhysicalPosition } from "@tauri-apps/api/window";
import { ArrowDown, ArrowUp, Lock, Move } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import logo from "../../assets/logo.png";
import { formatBytes, formatRate } from "../../lib/format";
import { updateOverlay, useSettings } from "../../stores/settings";
import { startTelemetry, useTelemetry } from "../../stores/telemetry";
import type { Metric } from "../../types/telemetry";
import { cornerPosition } from "./placement";

const v = (m: Metric<number> | undefined) => (m?.status === "available" ? m.value : null);
const temp = (c: number | null) => (c == null ? null : <span className={c >= 85 ? "overlay__hot" : undefined}>{c.toFixed(0)}°C</span>);
const usedOf = (used: number | null, total: number | null) => (used == null ? null : `${formatBytes(used)}${total ? ` / ${formatBytes(total, 0)}` : ""}`);

interface RowProps {
  label: string;
  tone: "cpu" | "gpu" | "memory";
  percent: number | null;
  details: ReactNode[];
}

function Row({ label, tone, percent, details }: RowProps) {
  const shown = details.filter((d) => d != null);
  return (
    <div className={`overlay__row overlay__row--${tone}`}>
      <span className="overlay__label">{label}</span>
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

/** Frameless always-on-top mini window. Placement comes from Settings → Overlay. */
export function Overlay() {
  useEffect(startTelemetry, []);
  const { system, stale } = useTelemetry();
  const { overlay: o } = useSettings();
  const movable = o.freeMove && !o.locked;

  // Place the window when the mode or corner changes (not on every saved drag position).
  useEffect(() => {
    const win = getCurrentWindow();
    (async () => {
      if (o.freeMove) {
        if (o.position) await win.setPosition(new PhysicalPosition(o.position.x, o.position.y));
        return;
      }
      const m = await currentMonitor();
      if (!m) return;
      const area = { ...m.workArea.position, ...m.workArea.size };
      const { x, y } = cornerPosition(o.corner, area, await win.outerSize(), Math.round(16 * m.scaleFactor));
      await win.setPosition(new PhysicalPosition(x, y));
    })().catch(() => {});
  }, [o.freeMove, o.corner]);

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

  return (
    <main
      className={`overlay${movable ? " overlay--movable" : ""}`}
      onMouseDown={(e) => {
        if (movable && e.button === 0) void getCurrentWindow().startDragging();
      }}
    >
      <header className="overlay__head">
        <img className="overlay__logo" src={logo} alt="" />
        <span className="overlay__brand">
          SYSTEM<b>CORE</b>
        </span>
        {movable ? <Move className="overlay__mode" aria-label="Drag to move" /> : o.freeMove ? <Lock className="overlay__mode" aria-label="Position locked" /> : null}
        <span className={`overlay__live${stale || !system ? " overlay__live--off" : ""}`} title={stale ? "Data stale" : "Live"} />
      </header>

      <Row label="CPU" tone="cpu" percent={v(cpu?.usagePercent)} details={[temp(v(cpu?.temperatureC)), ghz == null ? null : `${(ghz / 1000).toFixed(2)} GHz`]} />
      <Row
        label="GPU"
        tone="gpu"
        percent={v(gpu?.usagePercent)}
        details={[temp(v(gpu?.temperatureC)), usedOf(v(gpu?.vramUsedBytes), v(gpu?.vramTotalBytes)), watts == null ? null : `${watts.toFixed(0)} W`]}
      />
      <Row label="RAM" tone="memory" percent={v(mem?.usagePercent)} details={[usedOf(v(mem?.usedBytes), v(mem?.totalBytes))]} />

      <footer className="overlay__net">
        <span>
          <ArrowDown aria-hidden="true" /> {rx == null ? "—" : formatRate(rx)}
        </span>
        <span>
          <ArrowUp aria-hidden="true" /> {tx == null ? "—" : formatRate(tx)}
        </span>
      </footer>
    </main>
  );
}
