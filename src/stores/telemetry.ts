import { t } from "../lib/i18n";
// Single app-wide telemetry store. One backend subscription feeds every page;
// components never poll on their own.
import { useSyncExternalStore } from "react";
import { getLatest, subscribeTelemetry } from "../lib/tauri";
import type { DisksSnapshot, Metric, ProcessesSnapshot, SystemSnapshot } from "../types/telemetry";

export const HISTORY_LENGTH = 60;
const STALE_AFTER_MS = 5000;

export interface History {
  cpu: (number | null)[];
  memory: (number | null)[];
  rx: (number | null)[];
  tx: (number | null)[];
  gpu: (number | null)[];
}

export interface TelemetryState {
  system: SystemSnapshot | null;
  processes: ProcessesSnapshot | null;
  disks: DisksSnapshot | null;
  error: string | null;
  history: History;
  /** True when the backend has stopped delivering snapshots. */
  stale: boolean;
}

const emptyHistory = (): History => ({ cpu: [], memory: [], rx: [], tx: [], gpu: [] });

let state: TelemetryState = { system: null, processes: null, disks: null, error: null, history: emptyHistory(), stale: false };
const listeners = new Set<() => void>();

function set(patch: Partial<TelemetryState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

const val = (m: Metric<number>) => (m.status === "available" ? m.value : null);
const push = (arr: (number | null)[], v: number | null) => [...arr.slice(-(HISTORY_LENGTH - 1)), v];

function onSystem(s: SystemSnapshot) {
  const h = state.history;
  const firstGpu = s.gpus.value?.[0];
  set({
    system: s,
    stale: false,
    history: {
      cpu: push(h.cpu, val(s.cpu.usagePercent)),
      memory: push(h.memory, val(s.memory.usagePercent)),
      rx: push(h.rx, val(s.network.rxBytesPerSec)),
      tx: push(h.tx, val(s.network.txBytesPerSec)),
      gpu: push(h.gpu, firstGpu ? val(firstGpu.usagePercent) : null),
    },
  });
}

let started = false;
export function startTelemetry() {
  if (started) return;
  started = true;
  subscribeTelemetry({
    system: onSystem,
    processes: (processes) => set({ processes }),
    disks: (disks) => set({ disks }),
    error: (error) => set({ error }),
  }).catch((e) => set({ error: t("Cannot subscribe to telemetry: {error}", { error: String(e) }) }));
  getLatest()
    .then((l) => {
      set({ processes: state.processes ?? l.processes, disks: state.disks ?? l.disks, error: l.error });
      if (!state.system && l.system) onSystem(l.system);
    })
    .catch((e) => set({ error: t("Backend unavailable: {error}", { error: String(e) }) }));
  setInterval(() => {
    const stale = !!state.system && Date.now() - state.system.sampledAt > STALE_AFTER_MS;
    if (stale !== state.stale) set({ stale });
  }, 1000);
}

/** Current state outside React (e.g. for stores that sample it on a timer). */
export const telemetrySnapshot = () => state;

export function useTelemetry(): TelemetryState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

// Dev only: module state (subscriptions, timers) cannot be hot-swapped, so reload the page instead.
if (import.meta.hot) import.meta.hot.accept(() => location.reload());
