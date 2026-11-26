//! Settings the backend needs to act on while the UI may be hidden. The UI owns them (localStorage)
//! and pushes a copy here with `set_prefs` whenever they change.

use crate::domain::SystemSnapshot;
use serde::Deserialize;
use std::sync::{Arc, Mutex};

#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlertPrefs {
    pub enabled: bool,
    pub cpu_temp_c: f32,
    pub gpu_temp_c: f32,
    pub ram_percent: f32,
}

#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Prefs {
    /// Closing the main window hides it to the tray instead of quitting.
    pub close_to_tray: bool,
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

#[cfg(test)]
mod tests {
    use super::*;

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
