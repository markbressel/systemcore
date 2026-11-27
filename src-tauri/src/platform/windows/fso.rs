//! Fullscreen optimizations (FSO). With them on (the Windows default), "exclusive fullscreen" games run
//! through the desktop compositor, so topmost windows such as the overlay stay visible. "Gaming tweak"
//! tools often switch them off, globally or per game; then nothing can be drawn over the game.

use serde::Serialize;
use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_SET_VALUE};
use winreg::RegKey;

const LAYERS: &str = r"Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers";
/// Compatibility flag behind "Disable fullscreen optimizations" in an exe's Properties.
const FLAG: &str = "DISABLEDXMAXIMIZEDWINDOWEDMODE";
const GAME_CONFIG: &str = r"System\GameConfigStore";
/// With this set to 1, GameDVR_FSEBehaviorMode = 2 turns FSO off for every game.
const HONOR: &str = "GameDVR_HonorUserFSEBehaviorMode";
const MODE: &str = "GameDVR_FSEBehaviorMode";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FsoStatus {
    pub disabled_globally: bool,
    /// Programs with "Disable fullscreen optimizations" ticked.
    pub disabled_for: Vec<String>,
}

/// The Layers value without the FSO flag; `None` when nothing but the "~" marker is left.
pub fn without_flag(value: &str) -> Option<String> {
    let rest: Vec<&str> = value.split_whitespace().filter(|t| !t.eq_ignore_ascii_case(FLAG)).collect();
    (rest.iter().any(|t| *t != "~")).then(|| rest.join(" "))
}

fn has_flag(value: &str) -> bool {
    value.split_whitespace().any(|t| t.eq_ignore_ascii_case(FLAG))
}

fn global_off(key: &RegKey) -> bool {
    key.get_value::<u32, _>(HONOR).unwrap_or(0) == 1 && key.get_value::<u32, _>(MODE).unwrap_or(0) == 2
}

pub fn status() -> FsoStatus {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let disabled_globally = hkcu.open_subkey(GAME_CONFIG).is_ok_and(|k| global_off(&k));
    let disabled_for = hkcu
        .open_subkey(LAYERS)
        .map(|k| k.enum_values().flatten().filter(|(_, v)| has_flag(&v.to_string())).map(|(name, _)| name).collect())
        .unwrap_or_default();
    FsoStatus { disabled_globally, disabled_for }
}

/// Turns FSO back on: clears the per-program flag and the global switch. Games must be restarted.
pub fn enable() -> Result<(), String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(k) = hkcu.open_subkey_with_flags(GAME_CONFIG, KEY_READ | KEY_SET_VALUE) {
        if global_off(&k) {
            k.set_value(HONOR, &0u32).map_err(|e| e.to_string())?;
        }
    }
    if let Ok(k) = hkcu.open_subkey_with_flags(LAYERS, KEY_READ | KEY_SET_VALUE) {
        let flagged: Vec<(String, String)> = k.enum_values().flatten().map(|(n, v)| (n, v.to_string())).filter(|(_, v)| has_flag(v)).collect();
        for (name, value) in flagged {
            match without_flag(&value) {
                Some(rest) => k.set_value(&name, &rest),
                None => k.delete_value(&name),
            }
            .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn removes_only_the_fso_flag() {
        assert_eq!(without_flag("~ DISABLEDXMAXIMIZEDWINDOWEDMODE"), None);
        assert_eq!(without_flag("~ RUNASADMIN DISABLEDXMAXIMIZEDWINDOWEDMODE").as_deref(), Some("~ RUNASADMIN"));
        assert_eq!(without_flag("~ HIGHDPIAWARE").as_deref(), Some("~ HIGHDPIAWARE"));
        assert!(has_flag("~ disabledxmaximizedwindowedmode"));
        assert!(!has_flag("~ RUNASADMIN"));
    }
}
