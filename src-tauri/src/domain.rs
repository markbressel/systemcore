//! Shared telemetry contract. Mirrored by `src/types/telemetry.ts` — keep both in sync.

use serde::Serialize;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Serialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    Available,
    Initializing,
    Unsupported,
    TemporarilyUnavailable,
    Error,
}

/// A measurement plus enough context to tell whether it can be trusted.
/// `value` is always `None` unless `status == Available` — never a fake zero.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Metric<T> {
    pub value: Option<T>,
    pub unit: &'static str,
    pub status: Status,
    pub source: &'static str,
    /// Unix epoch milliseconds.
    pub sampled_at: Option<u64>,
    /// Short user-facing hint when the value is missing (what would enable it).
    pub note: Option<&'static str>,
}

impl<T> Metric<T> {
    pub fn ok(value: T, unit: &'static str, source: &'static str, at: u64) -> Self {
        Self { value: Some(value), unit, status: Status::Available, source, sampled_at: Some(at), note: None }
    }
    pub fn missing(status: Status, unit: &'static str, source: &'static str) -> Self {
        Self { value: None, unit, status, source, sampled_at: None, note: None }
    }
    pub fn with_note(mut self, note: &'static str) -> Self {
        if self.value.is_none() {
            self.note = Some(note);
        }
        self
    }
    pub fn from_option(v: Option<T>, unit: &'static str, source: &'static str, at: u64, if_none: Status) -> Self {
        match v {
            Some(v) => Self::ok(v, unit, source, at),
            None => Self::missing(if_none, unit, source),
        }
    }
}

pub fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CpuSnapshot {
    pub usage_percent: Metric<f32>,
    pub per_core_percent: Metric<Vec<f32>>,
    pub frequency_mhz: Metric<u64>,
    pub base_frequency_mhz: Metric<u64>,
    /// Highest effective clock seen this session. Windows does not expose the max boost clock,
    /// so this observed peak is the honest scale for the frequency bar.
    pub peak_frequency_mhz: Metric<u64>,
    pub temperature_c: Metric<f32>,
    /// Running slower because it is too hot; `None` without a temperature reading.
    pub thermal_throttling: Option<bool>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MemorySnapshot {
    pub total_bytes: Metric<u64>,
    pub used_bytes: Metric<u64>,
    pub available_bytes: Metric<u64>,
    pub usage_percent: Metric<f32>,
    pub swap_total_bytes: Metric<u64>,
    pub swap_used_bytes: Metric<u64>,
    pub committed_bytes: Metric<u64>,
    pub commit_limit_bytes: Metric<u64>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GpuSnapshot {
    pub id: String,
    pub model: Option<String>,
    pub vendor: Option<String>,
    pub usage_percent: Metric<f32>,
    pub vram_used_bytes: Metric<u64>,
    pub vram_total_bytes: Metric<u64>,
    pub shared_used_bytes: Metric<u64>,
    pub temperature_c: Metric<f32>,
    pub core_clock_mhz: Metric<u64>,
    /// Hardware maximum graphics clock (NVML), the scale for the clock bar.
    pub max_core_clock_mhz: Metric<u64>,
    pub memory_clock_mhz: Metric<u64>,
    pub power_watts: Metric<f32>,
    pub fan_percent: Metric<f32>,
    /// Driver-reported thermal slowdown (NVIDIA only); `None` when unknown.
    pub thermal_throttling: Option<bool>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AdapterSnapshot {
    pub name: String,
    pub mac: String,
    /// Windows operational status: "Up", "Down", "Dormant", "NotPresent", ...
    pub status: String,
    pub rx_bytes_per_sec: Metric<f64>,
    pub tx_bytes_per_sec: Metric<f64>,
    pub total_rx_bytes: u64,
    pub total_tx_bytes: u64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NetworkSnapshot {
    pub rx_bytes_per_sec: Metric<f64>,
    pub tx_bytes_per_sec: Metric<f64>,
    pub adapters: Vec<AdapterSnapshot>,
    /// Round trip to a public server (TCP handshake time).
    pub latency_ms: Metric<f32>,
}

/// The app in the foreground (normally the game) and its frame rate.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GameSnapshot {
    pub process: Option<String>,
    pub pid: Option<u32>,
    /// Foreground window covers its whole monitor.
    pub fullscreen: bool,
    pub fps: Metric<f32>,
    pub frame_time_ms: Metric<f32>,
    /// Average FPS of the slowest 1 % of frames over the last ~10 s.
    pub low1_fps: Metric<f32>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SystemSnapshot {
    pub cpu: CpuSnapshot,
    pub memory: MemorySnapshot,
    pub gpus: Metric<Vec<GpuSnapshot>>,
    pub network: NetworkSnapshot,
    pub uptime_secs: Metric<u64>,
    pub process_count: Metric<usize>,
    pub game: GameSnapshot,
    pub sampled_at: u64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProcessInfo {
    pub pid: u32,
    pub parent_pid: Option<u32>,
    pub name: String,
    /// Share of total CPU capacity (0–100, like Task Manager), `None` until a second sample exists.
    pub cpu_percent: Option<f32>,
    /// Working set in bytes. `None` when Windows denies access (it reports 0, which is not a real value).
    pub memory_bytes: Option<u64>,
    pub status: String,
    /// Unix epoch seconds.
    pub start_time: u64,
    /// `None` when Windows denies access (typical for protected/system processes).
    pub exe: Option<String>,
    /// Network bytes per second; `None` without per-process network data (needs administrator rights).
    pub net_rx_bytes_per_sec: Option<f64>,
    pub net_tx_bytes_per_sec: Option<f64>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProcessesSnapshot {
    pub processes: Vec<ProcessInfo>,
    /// Per-process network traffic is being measured (ETW session running).
    pub net_per_process: bool,
    pub sampled_at: u64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DiskInfo {
    pub name: String,
    pub mount_point: String,
    pub file_system: String,
    pub kind: String,
    pub removable: bool,
    /// Physical disk health from the Storage Management API ("Healthy", "Warning", "Unhealthy", "Unknown").
    pub health: Option<String>,
    pub model: Option<String>,
    pub total_bytes: u64,
    pub available_bytes: u64,
    pub read_bytes_per_sec: Metric<f64>,
    pub write_bytes_per_sec: Metric<f64>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DisksSnapshot {
    pub disks: Vec<DiskInfo>,
    pub sampled_at: u64,
}

/// Most recent snapshot of every channel, so a freshly opened window doesn't wait for the next tick.
#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Latest {
    pub system: Option<SystemSnapshot>,
    pub processes: Option<ProcessesSnapshot>,
    pub disks: Option<DisksSnapshot>,
    pub error: Option<String>,
}
