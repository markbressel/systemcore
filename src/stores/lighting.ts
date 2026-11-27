import { useSyncExternalStore } from "react";
import { listRgbDevices, setRgbColor } from "../lib/tauri";
import type { RgbDevice } from "../types/telemetry";
import { getSettings, subscribeSettings, type Settings } from "./settings";

/** The theme's built-in accent (settings store null = this orange). */
export const DEFAULT_ACCENT = "#f07832";

interface LightingState {
  devices: RgbDevice[] | null;
  scanning: boolean;
  /** Last write error per device id. */
  errors: Record<string, string>;
}

let state: LightingState = { devices: null, scanning: false, errors: {} };
const listeners = new Set<() => void>();
const set = (patch: Partial<LightingState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
export const useLighting = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );

/** The color a device should show now, or null when the user has not chosen one. */
export function deviceColor(s: Settings, id: string): string | null {
  return s.lighting.followAccent ? (s.appearance.accent ?? DEFAULT_ACCENT) : (s.lighting.colors[id] ?? null);
}

// Color pickers fire on every drag step: keep one write in flight and send only the newest color after it.
let writing = false;
let queued = false;
export async function applyColors() {
  if (writing) {
    queued = true;
    return;
  }
  writing = true;
  const errors: Record<string, string> = {};
  for (const d of state.devices ?? []) {
    const color = deviceColor(getSettings(), d.id);
    if (!color) continue;
    await setRgbColor(d.id, color).catch((e) => (errors[d.id] = String(e)));
  }
  set({ errors });
  writing = false;
  if (queued) {
    queued = false;
    await applyColors();
  }
}

export async function scanDevices() {
  set({ scanning: true });
  const devices = await listRgbDevices().catch(() => [] as RgbDevice[]);
  set({ devices, scanning: false });
  await applyColors();
}

/** Main window: find devices, paint them, and repaint when the colors or the accent change. */
export function startLighting() {
  const key = () => {
    const s = getSettings();
    return JSON.stringify([s.lighting, s.lighting.followAccent && s.appearance.accent]);
  };
  let last = key();
  const onSettings = () => {
    const next = key();
    if (next !== last) {
      last = next;
      void applyColors();
    }
  };
  // Dynamic Lighting only lets the foreground app drive lights: repaint when the window comes back.
  const onFocus = () => void applyColors();
  const stop = subscribeSettings(onSettings);
  window.addEventListener("focus", onFocus);
  void scanDevices();
  return () => {
    stop();
    window.removeEventListener("focus", onFocus);
  };
}
