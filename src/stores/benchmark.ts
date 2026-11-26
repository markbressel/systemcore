// 60-second load test: 30 s on every CPU core (Rust), then 30 s of heavy WebGL shading on the GPU.
// Lives outside React so the test keeps running while the user switches pages.
import { useSyncExternalStore } from "react";
import { t } from "../lib/i18n";
import { cancelBenchmark, runCpuBenchmark } from "../lib/tauri";
import { telemetrySnapshot } from "./telemetry";

export const PHASE_SECONDS = 30;
const KEY = "systemcore.benchmarks";
const MAX_RESULTS = 20;

export interface BenchmarkResult {
  finishedAt: number;
  cpuScore: number;
  gpuScore: number | null;
  cpuMaxTempC: number | null;
  gpuMaxTempC: number | null;
  /** The CPU or GPU slowed itself down from heat during the run (absent in older results). */
  throttled?: boolean;
}

export interface BenchmarkState {
  phase: "cpu" | "gpu" | null;
  phaseStartedAt: number;
  /** One sample per second over the whole run. */
  cpuTemp: (number | null)[];
  gpuTemp: (number | null)[];
  throttled: boolean;
  cpuScore: number | null;
  gpuScore: number | null;
  error: string | null;
  results: BenchmarkResult[];
}

function loadResults(): BenchmarkResult[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

let state: BenchmarkState = { phase: null, phaseStartedAt: 0, cpuTemp: [], gpuTemp: [], throttled: false, cpuScore: null, gpuScore: null, error: null, results: loadResults() };
let cancelled = false;
const listeners = new Set<() => void>();
const set = (patch: Partial<BenchmarkState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

export const useBenchmark = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );

const FRAGMENT = `#version 300 es
precision highp float;
uniform float t;
out vec4 o;
void main() {
  vec2 p = gl_FragCoord.xy / vec2(1920.0, 1080.0) - 0.5;
  vec3 c = vec3(0.0);
  for (int i = 0; i < 512; i++) {
    p = vec2(p.x * p.x - p.y * p.y, 2.0 * p.x * p.y) + vec2(sin(t + float(i) * 0.013), cos(t * 0.7)) * 0.6;
    c += abs(sin(vec3(p, t) * 3.1));
  }
  o = vec4(c / 512.0, 1.0);
}`;
const VERTEX = `#version 300 es
void main() { gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4.0 - 1.0, 0.0, 1.0); }`;

/** Full-HD frames of a heavy shader per second; the canvas is never shown. */
async function runGpu(ms: number): Promise<number | null> {
  const canvas = document.createElement("canvas");
  canvas.width = 1920;
  canvas.height = 1080;
  const gl = canvas.getContext("webgl2", { antialias: false, powerPreference: "high-performance" });
  if (!gl) throw new Error(t("WebGL 2 is not available, so the GPU test cannot run."));
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(t("GPU test shader failed: {log}", { log: String(gl.getShaderInfoLog(s)) }));
    return s;
  };
  const program = gl.createProgram()!;
  gl.attachShader(program, shader(gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(program);
  gl.useProgram(program);
  const tLoc = gl.getUniformLocation(program, "t");
  const pixel = new Uint8Array(4);
  let frames = 0;
  let batch = 1;
  const start = performance.now();
  try {
    while (performance.now() - start < ms && !cancelled) {
      const b0 = performance.now();
      for (let i = 0; i < batch; i++) {
        gl.uniform1f(tLoc, frames++ * 0.01);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      // Reading a pixel waits for the GPU to finish, so wall time measures real GPU work.
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      // Grow batches on fast GPUs so the sync cost stays small; stay well under the driver's 2 s timeout.
      if (performance.now() - b0 < 50 && batch < 64) batch *= 2;
      await new Promise((r) => setTimeout(r, 0));
    }
    return cancelled ? null : frames / ((performance.now() - start) / 1000);
  } finally {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}

export async function runBenchmark() {
  if (state.phase) return;
  cancelled = false;
  set({ phase: "cpu", phaseStartedAt: Date.now(), cpuTemp: [], gpuTemp: [], throttled: false, cpuScore: null, gpuScore: null, error: null });
  const sampler = setInterval(() => {
    const s = telemetrySnapshot().system;
    const gpu = s?.gpus.value?.[0];
    set({
      cpuTemp: [...state.cpuTemp, s?.cpu.temperatureC.value ?? null],
      gpuTemp: [...state.gpuTemp, gpu?.temperatureC.value ?? null],
      throttled: state.throttled || !!s?.cpu.thermalThrottling || !!gpu?.thermalThrottling,
    });
  }, 1000);
  try {
    const cpuScore = Math.round(await runCpuBenchmark(PHASE_SECONDS));
    set({ cpuScore, phase: "gpu", phaseStartedAt: Date.now() });
    let gpuScore: number | null = null;
    let error: string | null = null;
    try {
      const fps = await runGpu(PHASE_SECONDS * 1000);
      if (cancelled) throw new Error("Cancelled.");
      gpuScore = fps == null ? null : Math.round(fps * 10);
    } catch (e) {
      if (cancelled) throw e;
      error = String(e instanceof Error ? e.message : e);
    }
    const max = (xs: (number | null)[]) => xs.reduce<number | null>((m, x) => (x != null && (m == null || x > m) ? x : m), null);
    const result: BenchmarkResult = { finishedAt: Date.now(), cpuScore, gpuScore, cpuMaxTempC: max(state.cpuTemp), gpuMaxTempC: max(state.gpuTemp), throttled: state.throttled };
    const results = [result, ...state.results].slice(0, MAX_RESULTS);
    try {
      localStorage.setItem(KEY, JSON.stringify(results));
    } catch {
      // Storage blocked: the result still shows for this session.
    }
    set({ gpuScore, error, results });
  } catch (e) {
    set({ error: cancelled ? null : String(e instanceof Error ? e.message : e) });
  } finally {
    clearInterval(sampler);
    set({ phase: null });
  }
}

export function stopBenchmark() {
  cancelled = true;
  void cancelBenchmark().catch(() => {});
}

// Dev only: module state (subscriptions, timers) cannot be hot-swapped, so reload the page instead.
if (import.meta.hot) import.meta.hot.accept(() => location.reload());
