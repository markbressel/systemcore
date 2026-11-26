// Mirror of src-tauri/src/domain.rs and hardware.rs — keep in sync.

export type MetricStatus =
  | "available"
  | "initializing"
  | "unsupported"
  | "temporarily_unavailable"
  | "error";

export interface Metric<T> {
  value: T | null;
  unit: string;
  status: MetricStatus;
  source: string;
  /** Unix epoch ms */
  sampledAt: number | null;
  /** Short hint shown when the value is missing (what would enable it). */
  note: string | null;
}

export interface CpuSnapshot {
  usagePercent: Metric<number>;
  perCorePercent: Metric<number[]>;
  frequencyMhz: Metric<number>;
  baseFrequencyMhz: Metric<number>;
  /** Highest effective clock seen this session (scale for the frequency bar). */
  peakFrequencyMhz: Metric<number>;
  temperatureC: Metric<number>;
  /** Slowing down because it is too hot; null without a temperature reading. */
  thermalThrottling: boolean | null;
}

export interface MemorySnapshot {
  totalBytes: Metric<number>;
  usedBytes: Metric<number>;
  availableBytes: Metric<number>;
  usagePercent: Metric<number>;
  swapTotalBytes: Metric<number>;
  swapUsedBytes: Metric<number>;
  committedBytes: Metric<number>;
  commitLimitBytes: Metric<number>;
}

export interface GpuSnapshot {
  id: string;
  model: string | null;
  vendor: string | null;
  usagePercent: Metric<number>;
  vramUsedBytes: Metric<number>;
  vramTotalBytes: Metric<number>;
  sharedUsedBytes: Metric<number>;
  temperatureC: Metric<number>;
  coreClockMhz: Metric<number>;
  maxCoreClockMhz: Metric<number>;
  memoryClockMhz: Metric<number>;
  powerWatts: Metric<number>;
  fanPercent: Metric<number>;
  /** Driver-reported thermal slowdown (NVIDIA only); null when unknown. */
  thermalThrottling: boolean | null;
}

export interface AdapterSnapshot {
  name: string;
  mac: string;
  /** Windows operational status: "Up", "Down", "Dormant", "NotPresent", ... */
  status: string;
  rxBytesPerSec: Metric<number>;
  txBytesPerSec: Metric<number>;
  totalRxBytes: number;
  totalTxBytes: number;
}

export interface NetworkSnapshot {
  rxBytesPerSec: Metric<number>;
  txBytesPerSec: Metric<number>;
  adapters: AdapterSnapshot[];
  /** Round trip to a public server (TCP handshake). */
  latencyMs: Metric<number>;
}

/** The foreground app (normally the game) and its frame rate. */
export interface GameSnapshot {
  process: string | null;
  pid: number | null;
  fullscreen: boolean;
  fps: Metric<number>;
  frameTimeMs: Metric<number>;
  low1Fps: Metric<number>;
}

export interface SystemSnapshot {
  cpu: CpuSnapshot;
  memory: MemorySnapshot;
  gpus: Metric<GpuSnapshot[]>;
  network: NetworkSnapshot;
  uptimeSecs: Metric<number>;
  processCount: Metric<number>;
  game: GameSnapshot;
  sampledAt: number;
}

export interface ProcessInfo {
  pid: number;
  parentPid: number | null;
  name: string;
  cpuPercent: number | null;
  /** null when Windows denies access to the process */
  memoryBytes: number | null;
  status: string;
  /** Unix epoch seconds */
  startTime: number;
  exe: string | null;
  /** Network bytes/s; null without per-process network data (needs administrator rights). */
  netRxBytesPerSec: number | null;
  netTxBytesPerSec: number | null;
}

export interface ProcessesSnapshot {
  processes: ProcessInfo[];
  /** Per-process network traffic is being measured. */
  netPerProcess: boolean;
  sampledAt: number;
}

export interface DiskInfo {
  name: string;
  mountPoint: string;
  fileSystem: string;
  kind: string;
  removable: boolean;
  /** "Healthy" | "Warning" | "Unhealthy" | "Unknown" */
  health: string | null;
  model: string | null;
  totalBytes: number;
  availableBytes: number;
  readBytesPerSec: Metric<number>;
  writeBytesPerSec: Metric<number>;
}

export interface DisksSnapshot {
  disks: DiskInfo[];
  sampledAt: number;
}

export interface Latest {
  system: SystemSnapshot | null;
  processes: ProcessesSnapshot | null;
  disks: DisksSnapshot | null;
  error: string | null;
}

export interface BoardInfo {
  vendor: string | null;
  name: string | null;
  version: string | null;
}

export interface HardwareInfo {
  cpu: {
    brand: string | null;
    vendor: string | null;
    architecture: string;
    physicalCores: number | null;
    logicalProcessors: number;
  };
  memoryTotalBytes: number | null;
  memoryModules: {
    slot: string | null;
    capacityBytes: number | null;
    speedMts: number | null;
    configuredSpeedMts: number | null;
    kind: string | null;
    manufacturer: string | null;
    partNumber: string | null;
  }[];
  os: {
    name: string | null;
    version: string | null;
    longVersion: string | null;
    kernel: string | null;
    hostName: string | null;
  };
  motherboard: BoardInfo;
  system: BoardInfo;
  gpus: { model: string | null; vendor: string | null; vramTotalBytes: number | null }[];
  /** "Name · driver version" per display adapter. */
  gpuDrivers: string[];
  networkAdapters: { name: string; mac: string }[];
}

export type SpeedPhase = "connecting" | "ping" | "download" | "upload" | "done";

/** Mirror of src-tauri/src/speedtest.rs `Progress` (also the final result). */
export interface SpeedProgress {
  phase: SpeedPhase | null;
  /** 0–1 across the whole test */
  progress: number;
  pingMs: number | null;
  jitterMs: number | null;
  downloadMbps: number | null;
  uploadMbps: number | null;
  /** Cloudflare data center code, e.g. "BUD" */
  server: string | null;
}

/** Mirror of src-tauri/src/history.rs `Point`. */
export interface HistoryPoint {
  /** Unix epoch ms */
  t: number;
  cpu: number | null;
  cpuTemp: number | null;
  gpu: number | null;
  gpuTemp: number | null;
  ram: number | null;
  rx: number | null;
  tx: number | null;
  ping: number | null;
  fps: number | null;
}

/** Mirror of src-tauri/src/platform/windows/startup.rs `StartupApp`. */
export interface StartupApp {
  id: string;
  name: string;
  command: string;
  location: string;
  enabled: boolean;
  needsAdmin: boolean;
}

export type Priority = "idle" | "below_normal" | "normal" | "above_normal" | "high";

/** Mirror of src-tauri/src/session.rs `GameSession`. */
export interface GameSession {
  process: string;
  startedAt: number;
  endedAt: number;
  avgFps: number | null;
  low1Fps: number | null;
  cpuMaxTempC: number | null;
  gpuMaxTempC: number | null;
}

/** Mirror of src-tauri/src/cleanup.rs. */
export interface FolderEntry {
  name: string;
  path: string;
  bytes: number;
  isDir: boolean;
}

export interface FolderScan {
  path: string;
  parent: string | null;
  totalBytes: number;
  entries: FolderEntry[];
}

export interface CleanupTarget {
  id: string;
  label: string;
  hint: string;
  bytes: number;
}
