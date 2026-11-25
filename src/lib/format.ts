/** A formatted measurement: plain text, or [number, unit] so the unit can be styled separately. */
export type Formatted = string | [string, string];

const UNITS = ["B", "KB", "MB", "GB", "TB"];

/** Binary (1024-based) units, matching Windows Explorer / Task Manager. */
export function bytesParts(bytes: number, digits = 1): [string, string] {
  let v = bytes;
  let i = 0;
  while (Math.abs(v) >= 1024 && i < UNITS.length - 1) {
    v /= 1024;
    i++;
  }
  return [v.toFixed(i === 0 ? 0 : digits), UNITS[i]];
}

export const formatBytes = (bytes: number, digits = 1) => bytesParts(bytes, digits).join(" ");
export const rateParts = (bps: number): [string, string] => {
  const [v, u] = bytesParts(bps);
  return [v, `${u}/s`];
};
export const formatRate = (bps: number) => rateParts(bps).join(" ");
export const pctParts = (p: number, digits = 1): [string, string] => [p.toFixed(digits), "%"];
export const formatPercent = (p: number, digits = 1) => `${p.toFixed(digits)}%`;

export function formatDuration(secs: number): string {
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m ${Math.floor(secs % 60)}s`;
}

export const STATUS_LABEL: Record<string, string> = {
  available: "Live",
  initializing: "Measuring…",
  unsupported: "Not supported",
  temporarily_unavailable: "Temporarily unavailable",
  error: "Error",
};
