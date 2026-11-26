// App settings, persisted in localStorage. The main window and the overlay share one origin,
// so the browser's `storage` event carries every change to the other window.
import { useSyncExternalStore } from "react";
import { launchedAtLogin, onOverlayChanged, setOverlay, setPrefs, showMain } from "../lib/tauri";
import type { Corner } from "../features/overlay/placement";

export type OverlayRow = "cpu" | "gpu" | "ram" | "net";

export interface OverlaySettings {
  corner: Corner;
  /** Drag the overlay anywhere instead of pinning it to a corner. */
  freeMove: boolean;
  /** In free mode: stop dragging and keep the saved position. */
  locked: boolean;
  /** Last dragged position, physical pixels. */
  position: { x: number; y: number } | null;
  /** Size multiplier, 0.75–1.5. */
  scale: number;
  /** Which readings the overlay shows. */
  rows: Record<OverlayRow, boolean>;
  /** One slim line instead of the card. */
  compact: boolean;
}

export interface StartupSettings {
  /** Closing the main window keeps SystemCore running in the tray. */
  closeToTray: boolean;
  /** When Windows starts SystemCore at login, stay in the tray. */
  startHidden: boolean;
  /** Open the overlay every time SystemCore starts. */
  overlayAtStartup: boolean;
}

export interface AlertSettings {
  enabled: boolean;
  cpuTempC: number;
  gpuTempC: number;
  ramPercent: number;
}

export interface Settings {
  overlay: OverlaySettings;
  startup: StartupSettings;
  alerts: AlertSettings;
}

const KEY = "systemcore.settings";
const DEFAULTS: Settings = {
  overlay: {
    corner: "top-right",
    freeMove: false,
    locked: false,
    position: null,
    scale: 1,
    rows: { cpu: true, gpu: true, ram: true, net: true },
    compact: false,
  },
  startup: { closeToTray: true, startHidden: true, overlayAtStartup: false },
  alerts: { enabled: false, cpuTempC: 90, gpuTempC: 85, ramPercent: 90 },
};

function load(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return {
      overlay: { ...DEFAULTS.overlay, ...raw.overlay, rows: { ...DEFAULTS.overlay.rows, ...raw.overlay?.rows } },
      startup: { ...DEFAULTS.startup, ...raw.startup },
      alerts: { ...DEFAULTS.alerts, ...raw.alerts },
    };
  } catch {
    return DEFAULTS;
  }
}

let settings = load();
let overlayOpen = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

window.addEventListener("storage", (e) => {
  if (e.key === KEY) {
    settings = load();
    emit();
  }
});

export function updateSettings<K extends keyof Settings>(section: K, patch: Partial<Settings[K]>) {
  settings = { ...settings, [section]: { ...settings[section], ...patch } };
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage blocked: the change still applies for this session.
  }
  emit();
}

export const updateOverlay = (patch: Partial<OverlaySettings>) => updateSettings("overlay", patch);

export const useSettings = () => useSyncExternalStore(subscribe, () => settings);

/** Overlay window open/closed; the backend reports every change (UI, tray, hotkey, the overlay's own X). */
export const useOverlayOpen = () => useSyncExternalStore(subscribe, () => overlayOpen);
void onOverlayChanged((open) => {
  overlayOpen = open;
  emit();
}).catch(() => {});

export async function toggleOverlayWindow() {
  overlayOpen = await setOverlay();
  emit();
}

/** Main window only: push backend prefs on every change and apply the startup choices once. */
export function startAppSettings() {
  let sent = "";
  const push = () => {
    const next = JSON.stringify({ closeToTray: settings.startup.closeToTray, alerts: settings.alerts });
    if (next !== sent) {
      sent = next;
      void setPrefs(JSON.parse(next)).catch(() => {});
    }
  };
  push();
  listeners.add(push);

  void (async () => {
    // The window starts hidden; at login it stays in the tray unless the user wants it shown.
    if ((await launchedAtLogin()) && !settings.startup.startHidden) await showMain();
    if (settings.startup.overlayAtStartup) await setOverlay(true);
  })().catch(() => {});

  return () => {
    listeners.delete(push);
  };
}
