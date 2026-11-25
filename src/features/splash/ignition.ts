// Startup "ignition" timeline, like a car instrument cluster: needles sweep to the top
// and back (calibration), then switch to live readings.

export type IgnitionPhase = "ignition" | "sweep-up" | "hold" | "sweep-down" | "live" | "exit" | "done";

// Phase end times in ms.
export const TIMELINE = {
  ignition: 550,
  sweepUp: 1450,
  hold: 1650,
  sweepDown: 2550,
  live: 3550,
  exit: 4050,
} as const;

const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
const progress = (t: number, from: number, to: number) => easeInOut(Math.min(1, Math.max(0, (t - from) / (to - from))));

/** Phase at time `t`, plus the scripted needle value (null = show live data). */
export function ignitionAt(t: number): { phase: IgnitionPhase; sweep: number | null } {
  const T = TIMELINE;
  if (t < T.ignition) return { phase: "ignition", sweep: 0 };
  if (t < T.sweepUp) return { phase: "sweep-up", sweep: 100 * progress(t, T.ignition, T.sweepUp) };
  if (t < T.hold) return { phase: "hold", sweep: 100 };
  if (t < T.sweepDown) return { phase: "sweep-down", sweep: 100 * (1 - progress(t, T.hold, T.sweepDown)) };
  if (t < T.live) return { phase: "live", sweep: null };
  if (t < T.exit) return { phase: "exit", sweep: null };
  return { phase: "done", sweep: null };
}

export const STATUS_TEXT: Record<IgnitionPhase, string> = {
  ignition: "Ignition",
  "sweep-up": "Calibrating sensors",
  hold: "Calibrating sensors",
  "sweep-down": "Calibrating sensors",
  live: "System ready",
  exit: "System ready",
  done: "System ready",
};
