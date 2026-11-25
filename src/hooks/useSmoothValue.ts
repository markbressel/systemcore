import { useEffect, useRef, useState } from "react";

const prefersReducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/**
 * Follows `target` with exponential smoothing on animation frames, so a needle glides between
 * once-per-second samples instead of jumping. `null` (no data) is passed through immediately.
 * `timeConstantMs <= 0` disables smoothing (caller drives the value frame by frame).
 */
export function useSmoothValue(target: number | null, timeConstantMs = 220): number | null {
  const [shown, setShown] = useState(target);
  const current = useRef(target);

  useEffect(() => {
    if (target == null || current.current == null || timeConstantMs <= 0 || prefersReducedMotion()) {
      current.current = target;
      setShown(target);
      return;
    }
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const from = current.current ?? target;
      const k = 1 - Math.exp(-(now - last) / timeConstantMs);
      last = now;
      const next = Math.abs(target - from) < 0.02 ? target : from + (target - from) * k;
      current.current = next;
      setShown(next);
      if (next !== target) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, timeConstantMs]);

  return shown;
}
