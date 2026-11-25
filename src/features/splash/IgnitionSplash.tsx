import { useEffect, useRef, useState } from "react";
import logo from "../../assets/logo.png";
import { Gauge } from "../../components/metrics/Gauge";
import { useTelemetry } from "../../stores/telemetry";
import { ignitionAt, STATUS_TEXT, TIMELINE } from "./ignition";

const REDUCED_MOTION_MS = 900;

/** Startup screen: logo, name and the two main dials doing an ignition sweep before live readings. */
export function IgnitionSplash({ onDone }: { onDone: () => void }) {
  const [t, setT] = useState(0);
  const reduced = useRef(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  const { system } = useTelemetry();

  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const elapsed = now - start;
      // Reduced motion: no sweep, just a short static intro.
      setT(reduced.current ? (elapsed < REDUCED_MOTION_MS ? TIMELINE.sweepDown : TIMELINE.exit) : elapsed);
      if (elapsed < (reduced.current ? REDUCED_MOTION_MS : TIMELINE.exit)) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const { phase, sweep } = ignitionAt(t);

  useEffect(() => {
    if (phase === "done") onDone();
  }, [phase, onDone]);

  useEffect(() => {
    const skip = (e: KeyboardEvent) => (e.key === "Escape" || e.key === "Enter" || e.key === " ") && onDone();
    window.addEventListener("keydown", skip);
    return () => window.removeEventListener("keydown", skip);
  }, [onDone]);

  const cpu = system?.cpu.usagePercent;
  const gpu = system?.gpus.value?.[0]?.usagePercent;
  const live = (m: typeof cpu) => (m?.status === "available" ? m.value : null);
  const value = (m: typeof cpu) => (sweep != null ? sweep : live(m));

  return (
    <div className={`ignition ignition--${phase}`} onClick={onDone} role="dialog" aria-label="SystemCore is starting">
      <div className="ignition__brand">
        <img className="ignition__logo" src={logo} alt="" />
        <div className="ignition__wordmark">
          SYSTEM<span>CORE</span>
        </div>
      </div>

      <div className="ignition__dials">
        <Gauge value={value(cpu)} label="CPU Usage" smooth={sweep == null} missingText="Measuring…" />
        <Gauge value={value(gpu)} label="GPU Usage" smooth={sweep == null} missingText="Measuring…" />
      </div>

      <div className="ignition__status" aria-live="polite">
        <span className="ignition__status-dot" aria-hidden="true" />
        {STATUS_TEXT[phase]}
      </div>
      <div className="ignition__hint">Click or press Esc to skip</div>
    </div>
  );
}
