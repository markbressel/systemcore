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
}

#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct Prefs {
    /// Closing the main window hides it to the tray instead of quitting.
    pub close_to_tray: bool,
    /// Show the overlay while a fullscreen app (normally a game) is in front.
    pub auto_overlay: bool,
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
    pub fn check(&mut self, a: &AlertPrefs, s: &SystemSnapshot) -> Vec<String> {
        if !a.enabled {
            self.fired = [false; 3];
            return vec![];
        }
        let gpu = s.gpus.value.as_ref().and_then(|g| g.first()).and_then(|g| g.temperature_c.value);
        let checks = [
            ("CPU temperature", s.cpu.temperature_c.value, a.cpu_temp_c, "°C"),
            ("GPU temperature", gpu, a.gpu_temp_c, "°C"),
            ("Memory usage", s.memory.usage_percent.value, a.ram_percent, "%"),
        ];
        checks
            .into_iter()
            .zip(self.fired.iter_mut())
            .filter_map(|((name, v, limit, unit), fired)| {
                crossed(fired, v, limit).then(|| format!("{name} is {:.0}{unit} (your limit is {limit:.0}{unit}).", v.unwrap_or_default()))
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
    pub fn update(&mut self, now_secs: u64, procs: &[ProcSample], a: &AlertPrefs) -> Vec<String> {
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
                out.push(format!("{} has used {cpu:.0}% CPU for {mins} min.", p.name));
            }
            let gb = p.memory_bytes.unwrap_or(0) as f32 / 1e9;
            if check(gb >= a.hog_memory_gb, &mut s.mem_since, &mut s.mem_told) {
                out.push(format!("{} has used {gb:.1} GB of RAM for {mins} min.", p.name));
            }
            next.insert((p.pid, p.start_time), s);
        }
        // Exited processes drop out here.
        self.state = next;
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hog_needs_sustained_load_and_notifies_once() {
        let prefs = AlertPrefs { hog_enabled: true, hog_cpu_percent: 50.0, hog_memory_gb: 100.0, hog_minutes: 1.0, ..Default::default() };
        let p = |cpu| [ProcSample { pid: 7, start_time: 1, name: "miner.exe", cpu_percent: Some(cpu), memory_bytes: Some(0) }];
        let mut w = HogWatch::default();
        assert!(w.update(0, &p(90.0), &prefs).is_empty());
        assert!(w.update(30, &p(90.0), &prefs).is_empty());
        assert_eq!(w.update(60, &p(90.0), &prefs), vec!["miner.exe has used 90% CPU for 1 min."]);
        assert!(w.update(90, &p(90.0), &prefs).is_empty(), "told once");
        assert!(w.update(100, &p(5.0), &prefs).is_empty(), "calmed down: re-arms");
        assert!(w.update(110, &p(90.0), &prefs).is_empty(), "timer restarts");
        assert_eq!(w.update(170, &p(90.0), &prefs).len(), 1);
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
