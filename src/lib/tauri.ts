// The only module that talks to the Rust backend.
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { AlertSettings, ColorAdjust } from "../stores/settings";
import type { CleanupTarget, DisksSnapshot, FolderScan, GameSession, HardwareInfo, HistoryPoint, Latest, Priority, ProcessesSnapshot, DisplayInfo, Peripheral, RgbDevice, SpeedProgress, StartupApp, SystemSnapshot } from "../types/telemetry";

export const getLatest = () => invoke<Latest>("get_latest");
export const listDisplays = () => invoke<DisplayInfo[]>("list_displays");
export const setDisplayColor = (id: string, adjust: ColorAdjust) => invoke<void>("set_display_color", { id, adjust });
export const setDisplayHardware = (id: string, brightness: number | null, contrast: number | null) => invoke<void>("set_display_hardware", { id, brightness, contrast });
export const listPeripherals = () => invoke<Peripheral[]>("list_peripherals");
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
export const getRunAsAdmin = () => invoke<boolean>("get_run_as_admin");
export const setRunAsAdmin = (on: boolean) => invoke<void>("set_run_as_admin", { on });
export const getAutostart = () => invoke<boolean>("get_autostart");
export const setAutostart = (on: boolean) => invoke<void>("set_autostart", { on });
export const hardwareDriverStatus = () => invoke<{ installed: boolean; elevated: boolean }>("hardware_driver_status");
export const restartAsAdmin = () => invoke<void>("restart_as_admin");
/** Resolves to the saved file's path (in Downloads). */
/** Loads every CPU core for `seconds`; resolves to the score (work units per second). */
export const runCpuBenchmark = (seconds: number) => invoke<number>("run_cpu_benchmark", { seconds });
export const cancelBenchmark = () => invoke<void>("cancel_benchmark");
/** Steam store search (Windows apps, top 8). */
export const searchGames = (term: string) => invoke<{ id: number; name: string }[]>("search_games", { term });
/** Steam store requirement texts (HTML), empty when the page lists none. */
export const gameRequirements = (id: number) => invoke<{ name: string; minimum: string; recommended: string }>("game_requirements", { id });
/** Raw RSS/Atom XML of one news source (fixed list on the Rust side). */
export const fetchNews = (source: string) => invoke<string>("fetch_news", { source });
/** Opens an https link in the default browser. */
export const openLink = (url: string) => invoke<void>("open_link", { url });
/** Sends a bug report or suggestion in the background (Formspree, e-mailed to the developer). */
export const sendFeedback = (feedback: { kind: "bug" | "idea"; title: string; message: string; system: string }) => invoke<void>("send_feedback", { feedback });
export interface Upgrade {
  name: string;
  id: string;
  version: string;
  available: string;
  source: string;
}
/** Programs winget can update. */
export const listUpgrades = () => invoke<Upgrade[]>("list_upgrades");
/** Installer download size in bytes, null when the source does not tell. */
export const upgradeSize = (id: string) => invoke<number | null>("upgrade_size", { id });
/** Updates one program silently; rejects with winget's reason. */
export const upgradePackage = (id: string) => invoke<void>("upgrade_package", { id });
/** Everything installed (name + winget id or handle). */
export const listInstalled = () => invoke<{ name: string; id: string }[]>("list_installed");
/** Installs one program silently; rejects with winget's reason. */
export const installPackage = (id: string, source: "winget" | "msstore") => invoke<void>("install_package", { id, source });
/** Downloads a publisher installer from the fixed list on the Rust side, then starts it. */
export const downloadInstaller = (key: string) => invoke<void>("download_installer", { key });
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
