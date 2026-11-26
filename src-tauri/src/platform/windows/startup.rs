//! Programs that start with Windows: Run keys and Startup folders. Enabling/disabling uses the same
//! `StartupApproved` flags as Task Manager, so the entry itself is never deleted or edited.

use serde::Serialize;
use std::path::PathBuf;
use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_SET_VALUE, REG_BINARY};
use winreg::{RegKey, RegValue, HKEY};

const RUN: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const RUN32: &str = r"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run";
const APPROVED: &str = r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved";

enum Source {
    Key(&'static str),
    Folder(PathBuf),
}

struct Location {
    label: &'static str,
    root: HKEY,
    source: Source,
    /// Subkey of `APPROVED` (under the same root) that holds the enabled flags.
    approved: &'static str,
}

fn locations() -> Vec<Location> {
    let env = |k: &str| std::env::var_os(k).map(PathBuf::from);
    let mut l = vec![
        Location { label: "Registry (current user)", root: HKEY_CURRENT_USER, source: Source::Key(RUN), approved: "Run" },
        Location { label: "Registry (all users)", root: HKEY_LOCAL_MACHINE, source: Source::Key(RUN), approved: "Run" },
        Location { label: "Registry (all users, 32-bit)", root: HKEY_LOCAL_MACHINE, source: Source::Key(RUN32), approved: "Run32" },
    ];
    if let Some(p) = env("APPDATA") {
        l.push(Location { label: "Startup folder (current user)", root: HKEY_CURRENT_USER, source: Source::Folder(p.join(r"Microsoft\Windows\Start Menu\Programs\Startup")), approved: "StartupFolder" });
    }
    if let Some(p) = env("ProgramData") {
        l.push(Location { label: "Startup folder (all users)", root: HKEY_LOCAL_MACHINE, source: Source::Folder(p.join(r"Microsoft\Windows\Start Menu\Programs\StartUp")), approved: "StartupFolder" });
    }
    l
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StartupApp {
    /// "<location index>:<entry name>"; only used to find the entry again.
    pub id: String,
    pub name: String,
    pub command: String,
    pub location: &'static str,
    pub enabled: bool,
    /// All-users entries can only be changed with administrator rights.
    pub needs_admin: bool,
}

/// Task Manager writes 0x02 (enabled) or 0x03 (disabled) as the first byte; odd means disabled.
pub fn approved_enabled(flags: Option<&[u8]>) -> bool {
    flags.and_then(|b| b.first()).is_none_or(|b| b & 1 == 0)
}

fn flags(enabled: bool) -> Vec<u8> {
    let mut b = vec![if enabled { 2 } else { 3 }, 0, 0, 0];
    // Disabled entries also carry the time they were disabled (FILETIME), as Task Manager shows it.
    let ft = if enabled { 0 } else { (crate::domain::now_ms() / 1000 + 11_644_473_600) * 10_000_000 };
    b.extend_from_slice(&ft.to_le_bytes());
    b
}

fn entries(loc: &Location) -> Vec<(String, String)> {
    match &loc.source {
        Source::Key(path) => {
            let Ok(key) = RegKey::predef(loc.root).open_subkey(path) else { return vec![] };
            key.enum_values()
                .filter_map(Result::ok)
                .filter(|(name, _)| !name.is_empty())
                .map(|(name, _)| {
                    let cmd = key.get_value::<String, _>(&name).unwrap_or_default();
                    (name, cmd)
                })
                .collect()
        }
        Source::Folder(dir) => std::fs::read_dir(dir)
            .map(|rd| {
                rd.filter_map(Result::ok)
                    .filter(|e| e.file_type().is_ok_and(|t| t.is_file()))
                    .map(|e| (e.file_name().to_string_lossy().into_owned(), e.path().to_string_lossy().into_owned()))
                    .filter(|(n, _)| !n.eq_ignore_ascii_case("desktop.ini"))
                    .collect()
            })
            .unwrap_or_default(),
    }
}

fn approved_flags(loc: &Location, name: &str) -> Option<Vec<u8>> {
    let key = RegKey::predef(loc.root).open_subkey(format!(r"{APPROVED}\{}", loc.approved)).ok()?;
    key.get_raw_value(name).ok().map(|v| v.bytes.to_vec())
}

pub fn list() -> Vec<StartupApp> {
    let mut out = vec![];
    for (i, loc) in locations().iter().enumerate() {
        for (name, command) in entries(loc) {
            let flags = approved_flags(loc, &name);
            out.push(StartupApp {
                id: format!("{i}:{name}"),
                name: name.trim_end_matches(".lnk").to_owned(),
                command,
                location: loc.label,
                enabled: approved_enabled(flags.as_deref()),
                needs_admin: loc.root == HKEY_LOCAL_MACHINE,
            });
        }
    }
    out.sort_by_key(|a| a.name.to_lowercase());
    out
}

/// Only entries that exist right now can be toggled; the id is checked against a fresh listing.
pub fn set_enabled(id: &str, enabled: bool) -> Result<(), String> {
    let (i, name) = id.split_once(':').ok_or("Invalid entry.")?;
    let locs = locations();
    let loc = i.parse::<usize>().ok().and_then(|i| locs.get(i)).ok_or("Invalid entry.")?;
    if !entries(loc).iter().any(|(n, _)| n == name) {
        return Err("This startup entry no longer exists.".into());
    }
    let denied = |_| if loc.root == HKEY_LOCAL_MACHINE { "Needs administrator rights (entry is for all users).".to_string() } else { "Windows refused the change.".to_string() };
    let (key, _) = RegKey::predef(loc.root)
        .create_subkey_with_flags(format!(r"{APPROVED}\{}", loc.approved), KEY_SET_VALUE)
        .map_err(denied)?;
    key.set_raw_value(name, &RegValue { bytes: flags(enabled).into(), vtype: REG_BINARY }).map_err(denied)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn approved_flags_follow_task_manager() {
        assert!(approved_enabled(None));
        assert!(approved_enabled(Some(&[2, 0, 0, 0])));
        assert!(approved_enabled(Some(&[6, 0])));
        assert!(!approved_enabled(Some(&[3, 0, 0, 0])));
        assert!(approved_enabled(Some(&flags(true))));
        assert!(!approved_enabled(Some(&flags(false))));
        assert_eq!(flags(false).len(), 12);
    }
}
