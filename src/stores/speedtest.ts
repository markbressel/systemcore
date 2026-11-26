// Speed test state lives at module level so a running test survives page switches.
import { useSyncExternalStore } from "react";
import { cancelSpeedTest, onSpeedProgress, startSpeedTest } from "../lib/tauri";
import type { SpeedProgress } from "../types/telemetry";

export interface SpeedResult extends SpeedProgress {
  finishedAt: number;
}

interface SpeedTestState {
  running: boolean;
  live: SpeedProgress | null;
  error: string | null;
  /** Results from this session, newest first (not persisted). */
  history: SpeedResult[];
}

const HISTORY_MAX = 8;
let state: SpeedTestState = { running: false, live: null, error: null, history: [] };
const listeners = new Set<() => void>();
const set = (patch: Partial<SpeedTestState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

let subscribed = false;

export async function runSpeedTest() {
  if (state.running) return;
  if (!subscribed) {
    subscribed = true;
    await onSpeedProgress((p) => state.running && set({ live: p }));
  }
  set({ running: true, error: null, live: null });
  try {
    const result = await startSpeedTest();
    set({ running: false, live: result, history: [{ ...result, finishedAt: Date.now() }, ...state.history].slice(0, HISTORY_MAX) });
  } catch (e) {
    const msg = String(e);
    set({ running: false, error: msg === "cancelled" ? null : msg, live: msg === "cancelled" ? null : state.live });
  }
}

export const stopSpeedTest = () => cancelSpeedTest();

export function useSpeedTest(): SpeedTestState {
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
