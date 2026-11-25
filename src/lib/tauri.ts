// The only module that talks to the Rust backend.
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { DisksSnapshot, HardwareInfo, Latest, ProcessesSnapshot, SpeedProgress, SystemSnapshot } from "../types/telemetry";

export const getLatest = () => invoke<Latest>("get_latest");
export const getHardware = () => invoke<HardwareInfo>("get_hardware");
export const startSpeedTest = () => invoke<SpeedProgress>("start_speed_test");
export const cancelSpeedTest = () => invoke<void>("cancel_speed_test");
export const killProcess = (pid: number, startTime: number) => invoke<void>("kill_process", { pid, startTime });
/** Resolves to true when the overlay is now open. */
export const toggleOverlay = () => invoke<boolean>("toggle_overlay");
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
