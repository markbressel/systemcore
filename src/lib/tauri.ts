// The only module that talks to the Rust backend.
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { AlertSettings, ColorAdjust } from "../stores/settings";
import type { CleanupTarget, DisksSnapshot, FolderScan, GameSession, HardwareInfo, HistoryPoint, Latest, Priority, ProcessesSnapshot, DisplayInfo, RgbDevice, SpeedProgress, StartupApp, SystemSnapshot } from "../types/telemetry";

export const getLatest = () => invoke<Latest>("get_latest");
export const listDisplays = () => invoke<DisplayInfo[]>("list_displays");
export const setDisplayColor = (id: string, adjust: ColorAdjust) => invoke<void>("set_display_color", { id, adjust });
export const setDisplayHardware = (id: string, brightness: number | null, contrast: number | null) => invoke<void>("set_display_hardware", { id, brightness, contrast });
export const listRgbDevices = () => invoke<RgbDevice[]>("list_rgb_devices");
export const setRgbColor = (id: string, color: string) => invoke<void>("set_rgb_color", { id, color });
export const getHardware = () => invoke<HardwareInfo>("get_hardware");
export const startSpeedTest = () => invoke<SpeedProgress>("start_speed_test");
export const cancelSpeedTest = () => invoke<void>("cancel_speed_test");
export const killProcess = (pid: number, startTime: number) => invoke<void>("kill_process", { pid, startTime });
/** Open (true), close (false) or toggle (omitted); resolves to whether the overlay is now open. */
export const setOverlay = (open?: boolean) => invoke<boolean>("set_overlay", { open: open ?? null });
export const showMain = () => invoke<void>("show_main");
export const launchedAtLogin = () => invoke<boolean>("launched_at_login");
export const setPrefs = (prefs: { closeToTray: boolean; autoOverlay: boolean; gameMode: boolean; language: string; alerts: AlertSettings }) => invoke<void>("set_prefs", { prefs });
export const openProcessLocation = (pid: number, startTime: number) => invoke<void>("open_process_location", { pid, startTime });
export const getProcessPriority = (pid: number, startTime: number) => invoke<Priority | null>("get_process_priority", { pid, startTime });
export const setProcessPriority = (pid: number, startTime: number, priority: Priority) => invoke<void>("set_process_priority", { pid, startTime, priority });
export const searchProcess = (pid: number, startTime: number) => invoke<void>("search_process", { pid, startTime });
export const listStartupApps = () => invoke<StartupApp[]>("list_startup_apps");
export const setStartupEnabled = (id: string, enabled: boolean) => invoke<void>("set_startup_enabled", { id, enabled });
export const getHistory = (minutes: number) => invoke<HistoryPoint[]>("get_history", { minutes });
export const isElevated = () => invoke<boolean>("is_elevated");
export const hardwareDriverStatus = () => invoke<{ installed: boolean; elevated: boolean }>("hardware_driver_status");
export const restartAsAdmin = () => invoke<void>("restart_as_admin");
/** Resolves to the saved file's path (in Downloads). */
/** Loads every CPU core for `seconds`; resolves to the score (work units per second). */
export const runCpuBenchmark = (seconds: number) => invoke<number>("run_cpu_benchmark", { seconds });
export const cancelBenchmark = () => invoke<void>("cancel_benchmark");
/** Sizes of everything directly inside `path` (default: the home folder), largest first. */
export const scanFolder = (path?: string) => invoke<FolderScan>("scan_folder", { path: path ?? null });
export const cleanupTargets = () => invoke<CleanupTarget[]>("cleanup_targets");
/** Resolves to the bytes freed. */
export const cleanTarget = (id: string) => invoke<number>("clean_target", { id });
export const revealPath = (path: string) => invoke<void>("reveal_path", { path });
/** Fires when a game session (2+ minutes fullscreen) ends. */
export const onGameSession = (cb: (s: GameSession) => void) => listen<GameSession>("game:session", (e) => cb(e.payload));
/** Whether fullscreen optimizations are off (then nothing can show over exclusive fullscreen games). */
export const fsoStatus = () => invoke<{ disabledGlobally: boolean; disabledFor: string[] }>("fso_status");
export const enableFso = () => invoke<void>("enable_fso");
export const saveReport = (text: string) => invoke<string>("save_report", { text });
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
