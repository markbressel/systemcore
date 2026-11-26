//! Settings the backend needs to act on while the UI may be hidden. The UI owns them (localStorage)
//! and pushes a copy here with `set_prefs` whenever they change.

use crate::domain::SystemSnapshot;
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AlertPrefs {
    pub enabled: bool,
    pub cpu_temp_c: f32,
    pub gpu_temp_c: f32,
    pub ram_percent: f32,
    /// Notify when one program keeps using a lot of CPU or RAM.
    pub hog_enabled: bool,
    /// Share of the whole machine, like Task Manager.
    pub hog_cpu_percent: f32,
    pub hog_memory_gb: f32,
    pub hog_minutes: f32,
    /// Notify when a program's memory keeps growing for hours (likely a leak).
    pub leak_enabled: bool,
    /// Notify when the CPU or GPU slows down because it is too hot.
    pub throttle_enabled: bool,
}

#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct Prefs {
    /// Closing the main window hides it to the tray instead of quitting.
    pub close_to_tray: bool,
    /// Show the overlay while a fullscreen app (normally a game) is in front.
    pub auto_overlay: bool,
    /// High priority + High performance power plan while a fullscreen game is in front.
    pub game_mode: bool,
    /// UI language ("en" or "hu"); notifications follow it.
    pub language: String,
    pub alerts: AlertPrefs,
}

pub type SharedPrefs = Arc<Mutex<Prefs>>;

/// Re-arm margin: a value must drop this far below its limit before it can alert again.
const HYSTERESIS: f32 = 5.0;

/// True once when `value` reaches `limit`; quiet until it falls back below `limit - HYSTERESIS`.
fn crossed(fired: &mut bool, value: Option<f32>, limit: f32) -> bool {
    let Some(v) = value else { return false };
    if !*fired && v >= limit {
        *fired = true;
        return true;
    }
    if *fired && v < limit - HYSTERESIS {
        *fired = false;
    }
    false
}

/// Threshold alerts (CPU temp, GPU temp, RAM %) with per-metric "already fired" state.
#[derive(Default)]
pub struct Alerts {
    fired: [bool; 3],
}

impl Alerts {
    pub fn check(&mut self, a: &AlertPrefs, s: &SystemSnapshot, hu: bool) -> Vec<String> {
        if !a.enabled {
            self.fired = [false; 3];
            return vec![];
        }
        let gpu = s.gpus.value.as_ref().and_then(|g| g.first()).and_then(|g| g.temperature_c.value);
        let names = if hu { ["CPU-hőmérséklet", "GPU-hőmérséklet", "Memóriahasználat"] } else { ["CPU temperature", "GPU temperature", "Memory usage"] };
        let checks = [
            (names[0], s.cpu.temperature_c.value, a.cpu_temp_c, "°C"),
            (names[1], gpu, a.gpu_temp_c, "°C"),
            (names[2], s.memory.usage_percent.value, a.ram_percent, "%"),
        ];
        checks
            .into_iter()
            .zip(self.fired.iter_mut())
            .filter_map(|((name, v, limit, unit), fired)| {
                crossed(fired, v, limit).then(|| {
                    let v = v.unwrap_or_default();
                    if hu {
                        format!("{name}: {v:.0}{unit} (a korlátod {limit:.0}{unit}).")
                    } else {
                        format!("{name} is {v:.0}{unit} (your limit is {limit:.0}{unit}).")
                    }
                })
            })
            .collect()
    }
}

/// One process sample for [`HogWatch`].
pub struct ProcSample<'a> {
    pub pid: u32,
    pub start_time: u64,
    pub name: &'a str,
    pub cpu_percent: Option<f32>,
    pub memory_bytes: Option<u64>,
}

#[derive(Default)]
struct HogState {
    cpu_since: Option<u64>,
    mem_since: Option<u64>,
    cpu_told: bool,
    mem_told: bool,
}

/// Notifies once when a process stays above the CPU or RAM limit for the set number of minutes;
/// it can notify again after the process calms down.
#[derive(Default)]
pub struct HogWatch {
    state: HashMap<(u32, u64), HogState>,
}

impl HogWatch {
    pub fn update(&mut self, now_secs: u64, procs: &[ProcSample], a: &AlertPrefs, hu: bool) -> Vec<String> {
        if !a.hog_enabled {
            self.state.clear();
            return vec![];
        }
        let need = (a.hog_minutes.max(0.5) * 60.0) as u64;
        let mins = a.hog_minutes;
        let mut next = HashMap::new();
        let mut out = vec![];
        for p in procs {
            let mut s = self.state.remove(&(p.pid, p.start_time)).unwrap_or_default();
            let check = |over: bool, since: &mut Option<u64>, told: &mut bool| -> bool {
                if !over {
                    *since = None;
                    *told = false;
                    return false;
                }
                let start = *since.get_or_insert(now_secs);
                if !*told && now_secs - start >= need {
                    *told = true;
                    return true;
                }
                false
            };
            let cpu = p.cpu_percent.unwrap_or(0.0);
            if check(cpu >= a.hog_cpu_percent, &mut s.cpu_since, &mut s.cpu_told) {
                out.push(if hu {
                    format!("{} {mins} perce {cpu:.0}% CPU-t használ.", p.name)
                } else {
                    format!("{} has used {cpu:.0}% CPU for {mins} min.", p.name)
                });
            }
            let gb = p.memory_bytes.unwrap_or(0) as f32 / 1e9;
            if check(gb >= a.hog_memory_gb, &mut s.mem_since, &mut s.mem_told) {
                out.push(if hu {
                    format!("{} {mins} perce {gb:.1} GB RAM-ot használ.", p.name)
                } else {
                    format!("{} has used {gb:.1} GB of RAM for {mins} min.", p.name)
                });
            }
            next.insert((p.pid, p.start_time), s);
        }
        // Exited processes drop out here.
        self.state = next;
        out
    }
}

/// How long memory must keep growing before it counts as a leak.
pub const LEAK_WINDOW_SECS: u64 = 2 * 3600;
const LEAK_MIN_GROWTH: u64 = 1_000_000_000;

#[derive(Clone, Copy)]
struct LeakState {
    since: u64,
    start_bytes: u64,
    peak_bytes: u64,
    told: bool,
}

/// Flags a program whose memory has grown by 1 GB+ and at least doubled over two hours without
/// ever dropping back noticeably (a real workload frees memory now and then; a leak does not).
#[derive(Default)]
pub struct LeakWatch {
    state: HashMap<(u32, u64), LeakState>,
}

impl LeakWatch {
    /// Call every few minutes with all processes.
    pub fn update(&mut self, now_secs: u64, procs: &[ProcSample], enabled: bool, hu: bool) -> Vec<String> {
        if !enabled {
            self.state.clear();
            return vec![];
        }
        let mut next = HashMap::new();
        let mut out = vec![];
        for p in procs {
            let Some(bytes) = p.memory_bytes else { continue };
            let fresh = LeakState { since: now_secs, start_bytes: bytes, peak_bytes: bytes, told: false };
            let mut s = self.state.get(&(p.pid, p.start_time)).copied().unwrap_or(fresh);
            if bytes < s.peak_bytes * 9 / 10 {
                // Memory was given back: not a leak, start watching again from here.
                s = fresh;
            }
            s.peak_bytes = s.peak_bytes.max(bytes);
            let grew = bytes.saturating_sub(s.start_bytes);
            if !s.told && now_secs - s.since >= LEAK_WINDOW_SECS && grew >= LEAK_MIN_GROWTH && bytes >= s.start_bytes * 2 {
                s.told = true;
                let hours = (now_secs - s.since) as f32 / 3600.0;
                let (from, to) = (s.start_bytes as f32 / 1e9, bytes as f32 / 1e9);
                out.push(if hu {
                    format!(
                        "{} memóriája {hours:.0} óra alatt {from:.1} GB-ról {to:.1} GB-ra nőtt, és nem szabadult fel. Lehet, hogy szivárog; újraindítva felszabadul.",
                        p.name
                    )
                } else {
                    format!(
                        "{} grew from {from:.1} GB to {to:.1} GB in {hours:.0} h and never released it. It may be leaking memory; restarting it frees the memory.",
                        p.name
                    )
                });
            }
            next.insert((p.pid, p.start_time), s);
        }
        self.state = next;
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn leak_needs_hours_of_steady_growth() {
        let p = |gb: f32| [ProcSample { pid: 1, start_time: 1, name: "Discord.exe", cpu_percent: None, memory_bytes: Some((gb * 1e9) as u64) }];
        let mut w = LeakWatch::default();
        assert!(w.update(0, &p(0.3), true, false).is_empty());
        assert!(w.update(3600, &p(1.2), true, false).is_empty(), "not two hours yet");
        let told = w.update(LEAK_WINDOW_SECS, &p(2.1), true, false);
        assert_eq!(told.len(), 1, "{told:?}");
        assert!(told[0].starts_with("Discord.exe grew from 0.3 GB to 2.1 GB in 2 h"));
        assert!(w.update(LEAK_WINDOW_SECS + 600, &p(2.5), true, false).is_empty(), "told once");

        let mut w = LeakWatch::default();
        w.update(0, &p(0.3), true, false);
        w.update(3600, &p(1.5), true, false);
        w.update(5400, &p(0.8), true, false); // freed memory: restarts the window
        assert!(w.update(LEAK_WINDOW_SECS, &p(2.0), true, false).is_empty());
        assert!(w.update(0, &p(9.0), false, false).is_empty(), "off");
    }

    #[test]
    fn hog_needs_sustained_load_and_notifies_once() {
        let prefs = AlertPrefs { hog_enabled: true, hog_cpu_percent: 50.0, hog_memory_gb: 100.0, hog_minutes: 1.0, ..Default::default() };
        let p = |cpu| [ProcSample { pid: 7, start_time: 1, name: "miner.exe", cpu_percent: Some(cpu), memory_bytes: Some(0) }];
        let mut w = HogWatch::default();
        assert!(w.update(0, &p(90.0), &prefs, false).is_empty());
        assert!(w.update(30, &p(90.0), &prefs, false).is_empty());
        assert_eq!(w.update(60, &p(90.0), &prefs, false), vec!["miner.exe has used 90% CPU for 1 min."]);
        assert!(w.update(90, &p(90.0), &prefs, false).is_empty(), "told once");
        assert!(w.update(100, &p(5.0), &prefs, false).is_empty(), "calmed down: re-arms");
        assert!(w.update(110, &p(90.0), &prefs, false).is_empty(), "timer restarts");
        assert_eq!(w.update(170, &p(90.0), &prefs, false).len(), 1);
    }

    #[test]
    fn alerts_once_then_rearms_below_hysteresis() {
        let mut f = false;
        assert!(!crossed(&mut f, Some(80.0), 90.0));
        assert!(crossed(&mut f, Some(91.0), 90.0));
        assert!(!crossed(&mut f, Some(95.0), 90.0), "no repeat while still hot");
        assert!(!crossed(&mut f, Some(87.0), 90.0), "inside hysteresis: still fired");
        assert!(!crossed(&mut f, None, 90.0));
        assert!(!crossed(&mut f, Some(84.0), 90.0));
        assert!(crossed(&mut f, Some(90.0), 90.0), "re-armed after cooling down");
    }
}
