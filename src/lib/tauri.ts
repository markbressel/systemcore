// The only module that talks to the Rust backend.
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { AlertSettings } from "../stores/settings";
import type { DisksSnapshot, HardwareInfo, Latest, ProcessesSnapshot, SpeedProgress, SystemSnapshot } from "../types/telemetry";

export const getLatest = () => invoke<Latest>("get_latest");
export const getHardware = () => invoke<HardwareInfo>("get_hardware");
export const startSpeedTest = () => invoke<SpeedProgress>("start_speed_test");
export const cancelSpeedTest = () => invoke<void>("cancel_speed_test");
export const killProcess = (pid: number, startTime: number) => invoke<void>("kill_process", { pid, startTime });
/** Open (true), close (false) or toggle (omitted); resolves to whether the overlay is now open. */
export const setOverlay = (open?: boolean) => invoke<boolean>("set_overlay", { open: open ?? null });
export const showMain = () => invoke<void>("show_main");
export const launchedAtLogin = () => invoke<boolean>("launched_at_login");
export const setPrefs = (prefs: { closeToTray: boolean; alerts: AlertSettings }) => invoke<void>("set_prefs", { prefs });
/** Fires whenever the overlay opens or closes, whoever did it (UI, tray, hotkey). */
export const onOverlayChanged = (cb: (open: boolean) => void) => listen<boolean>("overlay:changed", (e) => cb(e.payload));
export const onSpeedProgress = (cb: (p: SpeedProgress) => void) => listen<SpeedProgress>("speedtest:progress", (e) => cb(e.payload));

export interface TelemetryHandlers {
  system: (s: SystemSnapshot) => void;
  processes: (p: ProcessesSnapshot) => void;
  disks: (d: DisksSnapshot) => void;
  error: (e: string) => void;
}

export async function subscribeTelemetry(h: TelemetryHandlers): Promise<UnlistenFn> {
  const offs = await Promise.all([
    listen<SystemSnapshot>("telemetry:system", (e) => h.system(e.payload)),
    listen<ProcessesSnapshot>("telemetry:processes", (e) => h.processes(e.payload)),
    listen<DisksSnapshot>("telemetry:disks", (e) => h.disks(e.payload)),
    listen<string>("telemetry:error", (e) => h.error(e.payload)),
  ]);
  return () => offs.forEach((off) => off());
}
