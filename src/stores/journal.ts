// Game sessions (reported by the backend) and the "what changed on this PC" log, kept in localStorage.
// Started once from the main window.
import { useSyncExternalStore } from "react";
import { diffBaseline, type Baseline, type ChangeEvent } from "../features/history/changes";
import { getHardware, listStartupApps, onGameSession } from "../lib/tauri";
import type { GameSession } from "../types/telemetry";
import { telemetrySnapshot } from "./telemetry";

const SESSIONS_KEY = "systemcore.sessions";
const CHANGES_KEY = "systemcore.changes";
const BASELINE_KEY = "systemcore.baseline";
const MAX_SESSIONS = 50;
const MAX_CHANGES = 100;
const CHECK_EVERY_MS = 60 * 60 * 1000;
/** Let the first disk sample arrive before the first check. */
const FIRST_CHECK_MS = 30_000;

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked: the data still shows for this session.
  }
}

interface JournalState {
  sessions: GameSession[];
  changes: ChangeEvent[];
}

let state: JournalState = { sessions: load(SESSIONS_KEY, []), changes: load(CHANGES_KEY, []) };
const listeners = new Set<() => void>();
const set = (patch: Partial<JournalState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

export const useJournal = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );

async function checkChanges() {
  const disks = telemetrySnapshot().disks?.disks ?? [];
  const [apps, hw] = await Promise.all([listStartupApps(), getHardware()]);
  const next: Baseline = {
    at: Date.now(),
    startup: apps.filter((a) => a.enabled).map((a) => a.name),
    drivers: hw.gpuDrivers,
    diskFree: Object.fromEntries(disks.filter((d) => !d.removable).map((d) => [d.mountPoint, d.availableBytes])),
  };
  const prev = load<Baseline | null>(BASELINE_KEY, null);
  save(BASELINE_KEY, next);
  // The very first run only records the starting point.
  const found = prev ? diffBaseline(prev, next) : [];
  if (found.length) {
    const changes = [...found, ...state.changes].slice(0, MAX_CHANGES);
    save(CHANGES_KEY, changes);
    set({ changes });
  }
}

let started = false;
export function startJournal() {
  if (started) return;
  started = true;
  void onGameSession((s) => {
    const sessions = [s, ...state.sessions].slice(0, MAX_SESSIONS);
    save(SESSIONS_KEY, sessions);
    set({ sessions });
  }).catch(() => {});
  setTimeout(() => void checkChanges().catch(() => {}), FIRST_CHECK_MS);
  setInterval(() => void checkChanges().catch(() => {}), CHECK_EVERY_MS);
}

// Dev only: module state (subscriptions, timers) cannot be hot-swapped, so reload the page instead.
if (import.meta.hot) import.meta.hot.accept(() => location.reload());
