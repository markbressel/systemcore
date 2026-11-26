// What holds the frame rate back, from one telemetry sample. Rough by design: it reads load, not frame timings.

export type Limit = "cpu-hot" | "gpu-hot" | "gpu" | "cpu" | "cap";

export interface LimitInput {
  gpuPercent: number | null;
  cpuPercent: number | null;
  /** Busiest single core: games often max out one thread while the total looks low. */
  busiestCorePercent: number | null;
  cpuThrottling: boolean | null;
  gpuThrottling: boolean | null;
}

export const LIMIT_TEXT: Record<Limit, string> = {
  "cpu-hot": "CPU too hot",
  "gpu-hot": "GPU too hot",
  gpu: "GPU",
  cpu: "CPU",
  cap: "FPS cap",
};

export function bottleneck(i: LimitInput): Limit | null {
  if (i.cpuThrottling) return "cpu-hot";
  if (i.gpuThrottling) return "gpu-hot";
  if (i.gpuPercent == null) return null;
  if (i.gpuPercent >= 95) return "gpu";
  const cpuBusy = (i.busiestCorePercent ?? 0) >= 90 || (i.cpuPercent ?? 0) >= 90;
  if (cpuBusy && i.gpuPercent < 85) return "cpu";
  // Neither is busy: a frame limiter or V-Sync is holding the game back.
  if (i.gpuPercent < 60 && (i.busiestCorePercent ?? 100) < 70) return "cap";
  return null;
}
