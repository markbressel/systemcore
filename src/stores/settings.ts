// App settings, persisted in localStorage. The main window and the overlay share one origin,
// so the browser's `storage` event carries every change to the other window.
import { useSyncExternalStore } from "react";
import { onOverlayClosed, toggleOverlay } from "../lib/tauri";
import type { Corner } from "../features/overlay/placement";

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
}

export interface Settings {
  overlay: OverlaySettings;
}

const KEY = "systemcore.settings";
const DEFAULTS: Settings = { overlay: { corner: "top-right", freeMove: false, locked: false, position: null, scale: 1 } };

function load(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return { overlay: { ...DEFAULTS.overlay, ...raw.overlay } };
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

export function updateOverlay(patch: Partial<OverlaySettings>) {
  settings = { ...settings, overlay: { ...settings.overlay, ...patch } };
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage blocked: the change still applies for this session.
  }
  emit();
}

export const useSettings = () => useSyncExternalStore(subscribe, () => settings);

/** Overlay window open/closed, as seen from the main window (only it opens or closes the overlay). */
export const useOverlayOpen = () => useSyncExternalStore(subscribe, () => overlayOpen);
// The overlay can close itself (its own X button); keep the main window's toggle in sync.
void onOverlayClosed(() => {
  overlayOpen = false;
  emit();
}).catch(() => {});

export async function toggleOverlayWindow() {
  overlayOpen = await toggleOverlay();
  emit();
}
