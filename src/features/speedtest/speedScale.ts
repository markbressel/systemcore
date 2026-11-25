// Speed-test dial scale: labels evenly spaced around the dial (like the percent dial's 0–90),
// with piecewise-linear interpolation so both slow and gigabit links move the needle visibly.

export const SPEED_LABELS = [0, 1, 5, 10, 25, 50, 100, 250, 500, 1000];

/** Mbps → dial position 0–100 (each label is 10 apart; above 1000 Mbps creeps toward 95). */
export function speedPosition(mbps: number): number {
  if (!(mbps > 0)) return 0;
  const last = SPEED_LABELS.length - 1;
  if (mbps >= SPEED_LABELS[last]) return Math.min(95, last * 10 + ((mbps - SPEED_LABELS[last]) / SPEED_LABELS[last]) * 5);
  const i = SPEED_LABELS.findIndex((l) => l > mbps);
  const [lo, hi] = [SPEED_LABELS[i - 1], SPEED_LABELS[i]];
  return (i - 1) * 10 + ((mbps - lo) / (hi - lo)) * 10;
}

export const SPEED_SCALE = {
  position: speedPosition,
  labels: SPEED_LABELS.map((v, i) => ({ at: i * 10, text: v >= 1000 ? `${v / 1000}G` : String(v) })),
};

export function formatMbps(v: number): string {
  return v >= 100 ? v.toFixed(0) : v.toFixed(1);
}
