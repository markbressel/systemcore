import { useSyncExternalStore } from "react";
import { listDisplays, setDisplayColor } from "../lib/tauri";
import type { DisplayInfo } from "../types/telemetry";
import { getSettings, subscribeSettings, type ColorAdjust, type GameProfile } from "./settings";
import { telemetrySnapshot } from "./telemetry";

export const NEUTRAL: ColorAdjust = { brightness: 0, contrast: 0, gamma: 1, temperature: 6500, vibrance: null };

interface DisplayState {
  displays: DisplayInfo[] | null;
  /** Game profile applied right now (exe), or null for the desktop settings. */
  active: string | null;
  error: string | null;
}

let state: DisplayState = { displays: null, active: null, error: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<DisplayState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
export const useDisplay = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );

/** Vibrance the driver had before SystemCore touched it: what "unchanged" (null) restores. */
const baseline = new Map<string, number>();
/** Profile being edited on the Display page: shown live, whatever runs in front. */
let preview: string | null = null;

const sameExe = (a: string, b: string) => a.toLowerCase().replace(/\.exe$/, "") === b.toLowerCase().replace(/\.exe$/, "");

function currentProfile(): GameProfile | null {
  const { display } = getSettings();
  if (preview) return display.profiles.find((p) => p.exe === preview) ?? null;
  const fg = telemetrySnapshot().system?.game.process;
  return display.autoProfiles && fg ? (display.profiles.find((p) => sameExe(p.exe, fg)) ?? null) : null;
}

export function colorFor(id: string, profile: GameProfile | null): ColorAdjust {
  const c = profile?.color ?? getSettings().display.monitors[id] ?? NEUTRAL;
  return { ...c, vibrance: c.vibrance ?? baseline.get(id) ?? null };
}

// Sliders fire on every step: one write in flight, then only the newest state.
let writing = false;
let queued = false;
export async function applyDisplays() {
  if (writing) {
    queued = true;
    return;
  }
  writing = true;
  const profile = currentProfile();
  let error: string | null = null;
  for (const d of state.displays ?? []) {
    await setDisplayColor(d.id, colorFor(d.id, profile)).catch((e) => (error = `${d.name}: ${String(e)}`));
  }
  set({ active: profile?.exe ?? null, error });
  writing = false;
  if (queued) {
    queued = false;
    await applyDisplays();
  }
}

export function previewProfile(exe: string | null) {
  preview = exe;
  void applyDisplays();
}

export async function refreshDisplays() {
  const displays = await listDisplays().catch(() => [] as DisplayInfo[]);
  for (const d of displays) if (d.vibrance && !baseline.has(d.id)) baseline.set(d.id, d.vibrance.current);
  set({ displays });
  await applyDisplays();
}

/** Main window: restore the saved colors at start, follow setting changes, switch game profiles automatically. */
export function startDisplay() {
  let last = JSON.stringify(getSettings().display);
  const stop = subscribeSettings(() => {
    const next = JSON.stringify(getSettings().display);
    if (next !== last) {
      last = next;
      void applyDisplays();
    }
  });
  const timer = setInterval(() => {
    if ((currentProfile()?.exe ?? null) !== state.active) void applyDisplays();
  }, 1000);
  void refreshDisplays();
  return () => {
    stop();
    clearInterval(timer);
  };
}
