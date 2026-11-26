//! Centralized telemetry collection. One background thread owns every sysinfo handle,
//! samples on a fixed schedule, publishes events, and keeps the latest snapshot for late subscribers.

use crate::domain::*;
use crate::platform::windows as win;
use crate::prefs::{Alerts, SharedPrefs};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use sysinfo::{
    Components, CpuRefreshKind, Disks, Gpus, MemoryRefreshKind, Networks, ProcessRefreshKind,
    ProcessesToUpdate, System, UpdateKind,
};
use tauri::{AppHandle, Emitter};
use tauri_plugin_notification::NotificationExt;

pub type Shared = Arc<Mutex<Latest>>;

const TICK: Duration = Duration::from_secs(1);
// Cadence in ticks (1 tick = 1 s). CPU and network sample every tick.
const MEMORY_EVERY: u64 = 2;
const PROCESS_EVERY: u64 = 2;
const GPU_EVERY: u64 = 2;
const DISK_EVERY: u64 = 2;
const TEMP_EVERY: u64 = 5;

const HEALTH_EVERY: u64 = 60;

const SRC_SYS: &str = "sysinfo";
const SRC_FREQ: &str = "PDH Processor Information (Task Manager method)";
const SRC_FREQ_FALLBACK: &str = "CallNtPowerInformation (may report base clock)";
const SRC_TEMP: &str = "WMI thermal zone";
const SRC_LHM: &str = "LibreHardwareMonitor (WMI)";
const SRC_GPU: &str = "D3DKMT / PDH";
const SRC_NVML: &str = "NVIDIA NVML";
const SRC_PDH_GPU: &str = "PDH GPU Adapter Memory";
const SRC_COMMIT: &str = "GetPerformanceInfo";

const NOTE_CPU_TEMP: &str = "Needs LibreHardwareMonitor";
const NOTE_NVIDIA_ONLY: &str = "NVIDIA GPUs only for now";

/// Bytes per second from two cumulative counters.
/// `None` if the counter went backwards (adapter reset/reconnect) so no fake spike is produced.
pub fn rate(prev: u64, cur: u64, secs: f64) -> Option<f64> {
    if cur < prev || secs <= 0.0 { None } else { Some((cur - prev) as f64 / secs) }
}

/// sysinfo reports per-process CPU as % of one core; Task Manager shows % of the whole machine.
pub fn normalize_process_cpu(raw: f32, logical_cpus: usize) -> f32 {
    (raw / logical_cpus.max(1) as f32).clamp(0.0, 100.0)
}

/// Turns cumulative per-key counters into per-second rates, remembering the previous sample.
#[derive(Default)]
struct RateTracker {
    prev: HashMap<String, (u64, u64)>,
    at: Option<Instant>,
}

impl RateTracker {
    /// Returns (rate_a, rate_b) for each key in the same order as `samples`.
    fn update(&mut self, samples: &[(String, u64, u64)], source: &'static str, now: u64) -> Vec<(Metric<f64>, Metric<f64>)> {
        let elapsed = self.at.map(|t| t.elapsed().as_secs_f64());
        self.at = Some(Instant::now());
        let mut next = HashMap::new();
        let out = samples
            .iter()
            .map(|(key, a, b)| {
                next.insert(key.clone(), (*a, *b));
                match (self.prev.get(key), elapsed) {
                    (Some(&(pa, pb)), Some(secs)) => (
                        Metric::from_option(rate(pa, *a, secs), "B/s", source, now, Status::TemporarilyUnavailable),
                        Metric::from_option(rate(pb, *b, secs), "B/s", source, now, Status::TemporarilyUnavailable),
                    ),
                    _ => (Metric::missing(Status::Initializing, "B/s", source), Metric::missing(Status::Initializing, "B/s", source)),
                }
            })
            .collect();
        self.prev = next;
        out
    }
}

struct Collector {
    sys: System,
    networks: Option<Networks>,
    disks: Option<Disks>,
    gpus: Option<Gpus>,
    components: Option<Components>,
    pdh: Option<win::pdh::Pdh>,
    nvidia: Option<win::nvidia::Nvidia>,
    disk_health: HashMap<String, win::wmi_sources::DiskHealth>,
    net_rates: RateTracker,
    disk_rates: RateTracker,
    tick: u64,
    memory: Option<MemorySnapshot>,
    gpu: Metric<Vec<GpuSnapshot>>,
    temperature: Metric<f32>,
    process_count: Metric<usize>,
    cpu_samples: u64,
    process_samples: u64,
    peak_mhz: u64,
}

impl Collector {
    fn new() -> Result<Self, String> {
        let sys = System::new().map_err(|e| format!("Cannot initialise system provider: {e:?}"))?;
        Ok(Self {
            sys,
            networks: Networks::new_with_refreshed_list().ok(),
            disks: Disks::new_with_refreshed_list().ok(),
            gpus: Gpus::new_with_refreshed_list().ok(),
            components: Components::new_with_refreshed_list().ok(),
            pdh: win::pdh::Pdh::new(),
            nvidia: win::nvidia::Nvidia::new(),
            disk_health: HashMap::new(),
            net_rates: RateTracker::default(),
            disk_rates: RateTracker::default(),
            tick: 0,
            memory: None,
            gpu: Metric::missing(Status::Initializing, "", SRC_GPU),
            temperature: Metric::missing(Status::Initializing, "°C", SRC_TEMP),
            process_count: Metric::missing(Status::Initializing, "", SRC_SYS),
            cpu_samples: 0,
            process_samples: 0,
            peak_mhz: 0,
        })
    }

    fn due(&self, every: u64) -> bool {
        self.tick % every == 0
    }

    fn cpu(&mut self, now: u64) -> CpuSnapshot {
        self.sys.refresh_cpu_specifics(CpuRefreshKind::nothing().with_usage().with_frequency());
        self.cpu_samples += 1;
        // Usage is a delta between two samples; the first one is meaningless.
        let ready = self.cpu_samples > 1;
        let cpus = self.sys.cpus();
        let usage = if ready {
            Metric::ok(self.sys.global_cpu_usage(), "%", SRC_SYS, now)
        } else {
            Metric::missing(Status::Initializing, "%", SRC_SYS)
        };
        let per_core = if ready {
            Metric::ok(cpus.iter().map(|c| c.usage()).collect(), "%", SRC_SYS, now)
        } else {
            Metric::missing(Status::Initializing, "%", SRC_SYS)
        };
        let (effective, base) = match self.pdh.as_ref().filter(|p| p.collect()) {
            Some(p) => p.cpu_frequency(),
            None => (None, None),
        };
        let frequency_mhz = match effective {
            Some(mhz) => Metric::ok(mhz, "MHz", SRC_FREQ, now),
            None => {
                let f = cpus.first().map(|c| c.frequency()).filter(|f| *f > 0);
                Metric::from_option(f, "MHz", SRC_FREQ_FALLBACK, now, Status::Unsupported)
            }
        };
        if let Some(f) = frequency_mhz.value {
            self.peak_mhz = self.peak_mhz.max(f);
        }
        CpuSnapshot {
            usage_percent: usage,
            per_core_percent: per_core,
            frequency_mhz,
            base_frequency_mhz: Metric::from_option(base, "MHz", SRC_FREQ, now, Status::Unsupported),
            peak_frequency_mhz: Metric::from_option(Some(self.peak_mhz).filter(|p| *p > 0), "MHz", SRC_FREQ, now, Status::Initializing),
            temperature_c: self.temperature.clone(),
        }
    }

    fn refresh_temperature(&mut self, now: u64) {
        if let Some(t) = win::wmi_sources::lhm_cpu_temperature() {
            self.temperature = Metric::ok(t, "°C", SRC_LHM, now);
            return;
        }
        // Fallback: ACPI thermal zone. Usually absent on desktops without admin rights or vendor drivers.
        let zone = self.components.as_mut().and_then(|c| {
            c.refresh(true);
            c.iter().filter_map(|x| x.temperature()).filter(|t| t.is_finite() && *t > 0.0).reduce(f32::max)
        });
        self.temperature = Metric::from_option(zone, "°C", SRC_TEMP, now, Status::Unsupported).with_note(NOTE_CPU_TEMP);
    }

    fn refresh_memory(&mut self, now: u64) {
        self.sys.refresh_memory_specifics(MemoryRefreshKind::everything());
        let s = &self.sys;
        let total = s.total_memory();
        let commit = win::memory::commit();
        let ok = |v| Metric::ok(v, "B", SRC_SYS, now);
        self.memory = Some(MemorySnapshot {
            total_bytes: ok(total),
            used_bytes: ok(s.used_memory()),
            available_bytes: ok(s.available_memory()),
            usage_percent: if total > 0 {
                Metric::ok(s.used_memory() as f32 / total as f32 * 100.0, "%", SRC_SYS, now)
            } else {
                Metric::missing(Status::Error, "%", SRC_SYS)
            },
            swap_total_bytes: ok(s.total_swap()),
            swap_used_bytes: ok(s.used_swap()),
            committed_bytes: Metric::from_option(commit.map(|c| c.0), "B", SRC_COMMIT, now, Status::Error),
            commit_limit_bytes: Metric::from_option(commit.map(|c| c.1), "B", SRC_COMMIT, now, Status::Error),
        });
    }

    fn refresh_gpus(&mut self, now: u64) {
        self.gpu = match self.gpus.as_mut() {
            None => Metric::missing(Status::Unsupported, "", SRC_GPU),
            Some(g) => {
                g.refresh(true);
                let nv = self.nvidia.as_ref().map(|n| n.read()).unwrap_or_default();
                // shortcut: PDH adapters are keyed by LUID, not PCI; only attributed when there is exactly one GPU.
                let pdh_mem = if g.len() == 1 { self.pdh.as_ref().and_then(|p| p.gpu_memory()) } else { None };
                let list = g
                    .iter()
                    .map(|gpu| {
                        let pci = gpu.pci();
                        let n = nv.iter().find(|r| r.domain == pci.domain && r.bus == pci.bus && r.device == pci.device);
                        let (used, used_src) = match (n.and_then(|r| r.vram_used), &pdh_mem) {
                            (Some(u), _) => (Some(u), SRC_NVML),
                            (None, Some(m)) => (Some(m.dedicated), SRC_PDH_GPU),
                            // A GPU in use never has 0 B dedicated memory in use; 0 means the counter is unavailable.
                            (None, None) => (gpu.used_memory().filter(|m| *m > 0), SRC_GPU),
                        };
                        let sensor = |v: Option<f32>, unit| Metric::from_option(v, unit, SRC_NVML, now, Status::Unsupported).with_note(NOTE_NVIDIA_ONLY);
                        let clock = |v: Option<u64>| Metric::from_option(v, "MHz", SRC_NVML, now, Status::Unsupported).with_note(NOTE_NVIDIA_ONLY);
                        GpuSnapshot {
                            id: pci.to_string(),
                            model: gpu.model().map(str::to_owned),
                            vendor: gpu.vendor().map(str::to_owned),
                            // First reading is None by design (time-diff based).
                            usage_percent: Metric::from_option(gpu.usage(), "%", SRC_GPU, now, Status::Initializing),
                            vram_used_bytes: Metric::from_option(used, "B", used_src, now, Status::Unsupported),
                            vram_total_bytes: Metric::from_option(n.and_then(|r| r.vram_total).or(gpu.total_memory()), "B", SRC_GPU, now, Status::Unsupported),
                            shared_used_bytes: Metric::from_option(pdh_mem.as_ref().map(|m| m.shared), "B", SRC_PDH_GPU, now, Status::Unsupported)
                                .with_note("Single-GPU systems only for now"),
                            temperature_c: sensor(n.and_then(|r| r.temperature_c), "°C"),
                            core_clock_mhz: clock(n.and_then(|r| r.core_clock_mhz)),
                            max_core_clock_mhz: clock(n.and_then(|r| r.max_core_clock_mhz)),
                            memory_clock_mhz: clock(n.and_then(|r| r.memory_clock_mhz)),
                            power_watts: sensor(n.and_then(|r| r.power_watts), "W"),
                            fan_percent: sensor(n.and_then(|r| r.fan_percent), "%"),
                        }
                    })
                    .collect();
                Metric::ok(list, "", SRC_GPU, now)
            }
        };
    }

    fn network(&mut self, now: u64) -> NetworkSnapshot {
        let Some(nets) = self.networks.as_mut() else {
            return NetworkSnapshot {
                rx_bytes_per_sec: Metric::missing(Status::Unsupported, "B/s", SRC_SYS),
                tx_bytes_per_sec: Metric::missing(Status::Unsupported, "B/s", SRC_SYS),
                adapters: vec![],
            };
        };
        nets.refresh(true);
        let mut list: Vec<_> = nets
            .iter()
            .map(|(name, d)| {
                let meta = (d.mac_address().to_string(), format!("{:?}", d.operational_state()));
                (name.to_string_lossy().into_owned(), d.total_received(), d.total_transmitted(), meta)
            })
            .collect();
        list.sort_by(|a, b| a.0.cmp(&b.0));
        let samples: Vec<_> = list.iter().map(|(n, rx, tx, _)| (n.clone(), *rx, *tx)).collect();
        let rates = self.net_rates.update(&samples, SRC_SYS, now);

        // Total is only valid if every adapter has a valid rate this tick.
        let sum = |pick: fn(&(Metric<f64>, Metric<f64>)) -> &Metric<f64>| -> Metric<f64> {
            let vals: Option<Vec<f64>> = rates.iter().map(|r| pick(r).value).collect();
            match vals {
                Some(v) if !rates.is_empty() => Metric::ok(v.iter().sum(), "B/s", SRC_SYS, now),
                _ => Metric::missing(Status::Initializing, "B/s", SRC_SYS),
            }
        };
        let rx_total = sum(|r| &r.0);
        let tx_total = sum(|r| &r.1);
        NetworkSnapshot {
            rx_bytes_per_sec: rx_total,
            tx_bytes_per_sec: tx_total,
            adapters: list
                .into_iter()
                .zip(rates)
                .map(|((name, rx, tx, (mac, status)), (rx_rate, tx_rate))| AdapterSnapshot {
                    name,
                    mac,
                    status,
                    rx_bytes_per_sec: rx_rate,
                    tx_bytes_per_sec: tx_rate,
                    total_rx_bytes: rx,
                    total_tx_bytes: tx,
                })
                .collect(),
        }
    }

    fn processes(&mut self, now: u64) -> ProcessesSnapshot {
        // Command lines and environment are deliberately never collected (may contain secrets).
        self.sys.refresh_processes_specifics(
            ProcessesToUpdate::All,
            true,
            ProcessRefreshKind::nothing().with_cpu().with_memory().with_exe(UpdateKind::OnlyIfNotSet),
        );
        self.process_samples += 1;
        let cpu_ready = self.process_samples > 1;
        let n_cpu = self.sys.cpus().len();
        let processes: Vec<ProcessInfo> = self
            .sys
            .processes()
            .values()
            .map(|p| ProcessInfo {
                pid: p.pid().as_u32(),
                parent_pid: p.parent().map(|x| x.as_u32()),
                name: p.name().to_string_lossy().into_owned(),
                cpu_percent: cpu_ready.then(|| normalize_process_cpu(p.cpu_usage(), n_cpu)),
                memory_bytes: Some(p.memory()).filter(|m| *m > 0),
                status: p.status().to_string(),
                start_time: p.start_time(),
                exe: p.exe().map(|e| e.to_string_lossy().into_owned()),
            })
            .collect();
        self.process_count = Metric::ok(processes.len(), "", SRC_SYS, now);
        ProcessesSnapshot { processes, sampled_at: now }
    }

    fn disks(&mut self, now: u64) -> Option<DisksSnapshot> {
        let disks = self.disks.as_mut()?;
        disks.refresh(true);
        let samples: Vec<_> = disks
            .iter()
            .map(|d| {
                let u = d.usage();
                (d.mount_point().to_string_lossy().into_owned(), u.total_read_bytes, u.total_written_bytes)
            })
            .collect();
        let rates = self.disk_rates.update(&samples, SRC_SYS, now);
        let health = &self.disk_health;
        Some(DisksSnapshot {
            disks: disks
                .iter()
                .zip(rates)
                .map(|(d, (r, w))| {
                    let mount = d.mount_point().to_string_lossy().into_owned();
                    let h = health.get(&mount.chars().take(1).collect::<String>().to_uppercase());
                    let kind = d.kind().to_string();
                    DiskInfo {
                    name: d.name().to_string_lossy().into_owned(),
                    mount_point: mount,
                    file_system: d.file_system().to_string_lossy().into_owned(),
                    // sysinfo can't classify some drives; the Storage API's media type fills the gap.
                    kind: if kind.starts_with("Unknown") { h.and_then(|h| h.media).map_or(kind, str::to_owned) } else { kind },
                    removable: d.is_removable(),
                    health: h.map(|h| h.health.to_owned()),
                    model: h.and_then(|h| h.model.clone()),
                    total_bytes: d.total_space(),
                    available_bytes: d.available_space(),
                    read_bytes_per_sec: r,
                    write_bytes_per_sec: w,
                }})
                .collect(),
            sampled_at: now,
        })
    }
}

fn health_rank(h: &str) -> u8 {
    match h {
        "Warning" => 1,
        "Unhealthy" => 2,
        _ => 0,
    }
}

/// One message per drive whose health got worse since the last check (startup counts as "was healthy").
fn health_alerts(prev: &HashMap<String, win::wmi_sources::DiskHealth>, next: &HashMap<String, win::wmi_sources::DiskHealth>) -> Vec<String> {
    let mut out: Vec<String> = next
        .iter()
        .filter(|(letter, d)| health_rank(d.health) > prev.get(*letter).map_or(0, |p| health_rank(p.health)))
        .map(|(letter, d)| format!("Drive {letter}: ({}) reports {}. Back up your data.", d.model.as_deref().unwrap_or("disk"), d.health))
        .collect();
    out.sort();
    out
}

fn store(shared: &Shared, f: impl FnOnce(&mut Latest)) {
    if let Ok(mut l) = shared.lock() {
        f(&mut l);
    }
}

pub fn spawn(app: AppHandle, shared: Shared, prefs: SharedPrefs) {
    std::thread::Builder::new()
        .name("telemetry-collector".into())
        .spawn(move || {
            let mut c = match Collector::new() {
                Ok(c) => c,
                Err(e) => {
                    store(&shared, |l| l.error = Some(e.clone()));
                    let _ = app.emit("telemetry:error", e);
                    return;
                }
            };
            let mut alerts = Alerts::default();
            loop {
                let started = Instant::now();
                let now = now_ms();

                if c.due(MEMORY_EVERY) { c.refresh_memory(now); }
                if c.due(GPU_EVERY) { c.refresh_gpus(now); }
                if c.due(TEMP_EVERY) { c.refresh_temperature(now); }
                if c.due(HEALTH_EVERY) {
                    let next = win::wmi_sources::disk_health();
                    for body in health_alerts(&c.disk_health, &next) {
                        let _ = app.notification().builder().title("SystemCore: disk health warning").body(body).show();
                    }
                    c.disk_health = next;
                }
                if c.due(PROCESS_EVERY) {
                    let p = c.processes(now);
                    store(&shared, |l| l.processes = Some(p.clone()));
                    let _ = app.emit("telemetry:processes", p);
                }
                if c.due(DISK_EVERY) {
                    if let Some(d) = c.disks(now) {
                        store(&shared, |l| l.disks = Some(d.clone()));
                        let _ = app.emit("telemetry:disks", d);
                    }
                }

                let cpu = c.cpu(now);
                let network = c.network(now);
                let snap = SystemSnapshot {
                    cpu,
                    memory: c.memory.clone().expect("memory sampled on tick 0"),
                    gpus: c.gpu.clone(),
                    network,
                    uptime_secs: Metric::from_option(System::uptime().ok(), "s", SRC_SYS, now, Status::Error),
                    process_count: c.process_count.clone(),
                    sampled_at: now,
                };
                if let Some(a) = prefs.lock().ok().map(|p| p.alerts.clone()) {
                    for body in alerts.check(&a, &snap) {
                        let _ = app.notification().builder().title("SystemCore alert").body(body).show();
                    }
                }
                store(&shared, |l| l.system = Some(snap.clone()));
                // Events are latest-value only: the UI replaces state, so no backlog can build up.
                let _ = app.emit("telemetry:system", snap);

                c.tick += 1;
                std::thread::sleep(TICK.saturating_sub(started.elapsed()));
            }
        })
        .expect("failed to start telemetry thread");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn health_alerts_only_when_worse() {
        let disk = |health| win::wmi_sources::DiskHealth { health, media: None, model: Some("SSD X".into()) };
        let map = |h| HashMap::from([("C".to_string(), disk(h))]);
        assert_eq!(health_alerts(&HashMap::new(), &map("Warning")), vec!["Drive C: (SSD X) reports Warning. Back up your data."]);
        assert!(health_alerts(&HashMap::new(), &map("Healthy")).is_empty());
        assert!(health_alerts(&map("Warning"), &map("Warning")).is_empty());
        assert_eq!(health_alerts(&map("Warning"), &map("Unhealthy")).len(), 1);
        assert!(health_alerts(&map("Unhealthy"), &map("Healthy")).is_empty());
    }

    #[test]
    fn rate_from_counters() {
        assert_eq!(rate(1_000, 3_000, 2.0), Some(1_000.0));
        assert_eq!(rate(5, 5, 1.0), Some(0.0));
    }

    #[test]
    fn counter_reset_gives_no_spike() {
        assert_eq!(rate(10_000, 50, 1.0), None);
        assert_eq!(rate(0, 10, 0.0), None);
    }

    #[test]
    fn process_cpu_is_share_of_machine() {
        assert_eq!(normalize_process_cpu(400.0, 8), 50.0);
        assert_eq!(normalize_process_cpu(-1.0, 8), 0.0);
        assert_eq!(normalize_process_cpu(10.0, 0), 10.0);
    }

    #[test]
    fn tracker_initializes_then_reports_and_handles_reset() {
        let mut t = RateTracker::default();
        let first = t.update(&[("eth".into(), 100, 100)], "t", 0);
        assert_eq!(first[0].0.status, Status::Initializing);
        assert_eq!(first[0].0.value, None);
        let second = t.update(&[("eth".into(), 200, 100)], "t", 0);
        assert_eq!(second[0].0.status, Status::Available);
        assert!(second[0].0.value.unwrap() > 0.0);
        let reset = t.update(&[("eth".into(), 5, 100)], "t", 0);
        assert_eq!(reset[0].0.status, Status::TemporarilyUnavailable);
        assert_eq!(reset[0].0.value, None);
    }

    #[test]
    fn metric_serializes_to_contract() {
        let m = Metric::ok(1.5f32, "%", "x", 42);
        let j = serde_json::to_value(&m).unwrap();
        assert_eq!(j["status"], "available");
        assert_eq!(j["sampledAt"], 42);
        let none: Metric<f32> = Metric::missing(Status::TemporarilyUnavailable, "%", "x");
        let j = serde_json::to_value(&none).unwrap();
        assert_eq!(j["value"], serde_json::Value::Null);
        assert_eq!(j["status"], "temporarily_unavailable");
    }
}
