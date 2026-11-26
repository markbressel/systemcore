// App settings, persisted in localStorage. The main window and the overlay share one origin,
// so the browser's `storage` event carries every change to the other window.
import { useSyncExternalStore } from "react";
import { launchedAtLogin, onOverlayChanged, setOverlay, setPrefs, showMain } from "../lib/tauri";
import type { Corner } from "../features/overlay/placement";
import { setLanguage, systemLanguage, type Language } from "../lib/i18n";

export type OverlayRow = "fps" | "cpu" | "gpu" | "ram" | "net" | "limit";

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
  /** Open the overlay while a fullscreen app (game) is in front, close it after. */
  autoShow: boolean;
  /** High priority + High performance power plan while a fullscreen game is in front. */
  gameMode: boolean;
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
  /** Notify when one program keeps using a lot of CPU or RAM. */
  hogEnabled: boolean;
  hogCpuPercent: number;
  hogMemoryGb: number;
  hogMinutes: number;
  /** A program's memory keeps growing for hours. */
  leakEnabled: boolean;
  /** CPU/GPU slows down because it is too hot. */
  throttleEnabled: boolean;
}

export type Theme = "dark" | "light";

export interface AppearanceSettings {
  theme: Theme;
  /** Custom accent color as #rrggbb; null keeps the theme's orange. */
  accent: string | null;
  language: Language;
}

export interface Settings {
  overlay: OverlaySettings;
  startup: StartupSettings;
  alerts: AlertSettings;
  appearance: AppearanceSettings;
}

const KEY = "systemcore.settings";
const DEFAULTS: Settings = {
  overlay: {
    corner: "top-right",
    freeMove: false,
    locked: false,
    position: null,
    scale: 1,
    rows: { fps: true, cpu: true, gpu: true, ram: true, net: true, limit: true },
    compact: false,
    autoShow: false,
    gameMode: false,
  },
  startup: { closeToTray: true, startHidden: true, overlayAtStartup: false },
  alerts: { enabled: false, cpuTempC: 90, gpuTempC: 85, ramPercent: 90, hogEnabled: false, hogCpuPercent: 50, hogMemoryGb: 4, hogMinutes: 3, leakEnabled: true, throttleEnabled: true },
  appearance: { theme: "dark", accent: null, language: systemLanguage() },
};

function load(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return {
      overlay: { ...DEFAULTS.overlay, ...raw.overlay, rows: { ...DEFAULTS.overlay.rows, ...raw.overlay?.rows } },
      startup: { ...DEFAULTS.startup, ...raw.startup },
      alerts: { ...DEFAULTS.alerts, ...raw.alerts },
      appearance: { ...DEFAULTS.appearance, ...raw.appearance },
    };
  } catch {
    return DEFAULTS;
  }
}

let settings = load();
setLanguage(settings.appearance.language);
let overlayOpen = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

window.addEventListener("storage", (e) => {
  if (e.key === KEY) {
    const before = settings.appearance.language;
    settings = load();
    // Every window renders its text once per load, so a language change reloads it.
    if (settings.appearance.language !== before) location.reload();
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

/** Switches the UI language; the windows reload to render every text in it. */
export function setAppLanguage(language: Language) {
  updateSettings("appearance", { language });
  location.reload();
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

const HEX = /^#[0-9a-f]{6}$/i;
const ACCENT_VARS = ["accent", "accent-hover", "accent-active", "accent-soft", "text-on-accent"];

/** Relative luminance (WCAG) of #rrggbb, 0 = black … 1 = white. */
export function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Derives the accent family from one color; anything that is not #rrggbb restores the theme default. */
function applyAccent(accent: string | null) {
  const style = document.documentElement.style;
  if (!accent || !HEX.test(accent)) {
    ACCENT_VARS.forEach((v) => style.removeProperty(`--color-${v}`));
    return;
  }
  style.setProperty("--color-accent", accent);
  style.setProperty("--color-accent-hover", `color-mix(in srgb, ${accent} 85%, white)`);
  style.setProperty("--color-accent-active", `color-mix(in srgb, ${accent} 80%, black)`);
  style.setProperty("--color-accent-soft", `color-mix(in srgb, ${accent} 22%, var(--color-bg-primary))`);
  // Dark text on light accents (yellow, cyan), white on dark ones (blue, purple).
  style.setProperty("--color-text-on-accent", luminance(accent) > 0.35 ? "#111318" : "#ffffff");
}

/** Main window only: push backend prefs on every change and apply the startup choices once. */
export function startAppSettings() {
  let sent = "";
  const push = () => {
    const next = JSON.stringify({ closeToTray: settings.startup.closeToTray, autoOverlay: settings.overlay.autoShow, gameMode: settings.overlay.gameMode, language: settings.appearance.language, alerts: settings.alerts });
    if (next !== sent) {
      sent = next;
      void setPrefs(JSON.parse(next)).catch(() => {});
    }
  };
  push();
  listeners.add(push);
  // Theme applies to the main window only; the overlay keeps the dark tokens over games.
  const applyTheme = () => {
    document.documentElement.dataset.theme = settings.appearance.theme;
    applyAccent(settings.appearance.accent);
  };
  applyTheme();
  listeners.add(applyTheme);

  void (async () => {
    // The window starts hidden; at login it stays in the tray unless the user wants it shown.
    if ((await launchedAtLogin()) && !settings.startup.startHidden) await showMain();
    if (settings.startup.overlayAtStartup) await setOverlay(true);
  })().catch(() => {});

  return () => {
    listeners.delete(push);
    listeners.delete(applyTheme);
  };
}

// Dev only: module state (subscriptions, timers) cannot be hot-swapped, so reload the page instead.
if (import.meta.hot) import.meta.hot.accept(() => location.reload());
