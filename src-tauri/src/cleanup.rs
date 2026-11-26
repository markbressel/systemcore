//! Disk space: folder sizes for a "what takes up space" view, and cleaning a fixed set of
//! known-safe locations (temp files, shader caches, Recycle Bin). Never follows junctions/symlinks.

use serde::Serialize;
use std::os::windows::fs::MetadataExt;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};
use windows::core::PCWSTR;
use windows::Win32::UI::Shell::{SHEmptyRecycleBinW, SHQueryRecycleBinW, SHERB_NOCONFIRMATION, SHERB_NOPROGRESSUI, SHERB_NOSOUND, SHQUERYRBINFO};

const REPARSE_POINT: u32 = 0x400;
/// Temp files younger than this may belong to a running installer or app, so they stay.
const TEMP_MIN_AGE: Duration = Duration::from_secs(24 * 3600);

fn is_link(m: &std::fs::Metadata) -> bool {
    m.file_attributes() & REPARSE_POINT != 0
}

/// Total size of a file or folder; unreadable entries count as 0.
pub fn size_of(path: &Path) -> u64 {
    let Ok(m) = std::fs::symlink_metadata(path) else { return 0 };
    if is_link(&m) {
        return 0;
    }
    if !m.is_dir() {
        return m.len();
    }
    std::fs::read_dir(path).map_or(0, |rd| rd.flatten().map(|e| size_of(&e.path())).sum())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderEntry {
    pub name: String,
    pub path: String,
    pub bytes: u64,
    pub is_dir: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderScan {
    pub path: String,
    pub parent: Option<String>,
    pub total_bytes: u64,
    /// Largest first.
    pub entries: Vec<FolderEntry>,
}

pub fn scan(path: &Path) -> Result<FolderScan, String> {
    let rd = std::fs::read_dir(path).map_err(|e| format!("Cannot open {}: {e}", path.display()))?;
    let mut entries: Vec<FolderEntry> = rd
        .flatten()
        .filter_map(|e| {
            let m = std::fs::symlink_metadata(e.path()).ok()?;
            (!is_link(&m)).then(|| FolderEntry {
                name: e.file_name().to_string_lossy().into_owned(),
                path: e.path().to_string_lossy().into_owned(),
                bytes: size_of(&e.path()),
                is_dir: m.is_dir(),
            })
        })
        .collect();
    entries.sort_by(|a, b| b.bytes.cmp(&a.bytes));
    Ok(FolderScan {
        path: path.to_string_lossy().into_owned(),
        parent: path.parent().map(|p| p.to_string_lossy().into_owned()),
        total_bytes: entries.iter().map(|e| e.bytes).sum(),
        entries,
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupTarget {
    pub id: &'static str,
    pub label: &'static str,
    pub hint: &'static str,
    pub bytes: u64,
}

const TARGETS: [(&str, &str, &str); 4] = [
    ("temp", "Temporary files", "Your temp folder; files from the last 24 hours are kept."),
    ("windows-temp", "Windows temporary files", "System temp folder; needs administrator rights for most files."),
    ("shader", "Shader caches", "DirectX, NVIDIA and AMD shader caches. Games rebuild them, so the first start may stutter briefly."),
    ("recycle", "Recycle Bin", "Permanently deletes everything in the Recycle Bin."),
];

fn env_path(var: &str, rest: &[&str]) -> Option<PathBuf> {
    let mut p = PathBuf::from(std::env::var_os(var)?);
    p.extend(rest);
    Some(p)
}

/// Folders whose contents a target deletes, and whether young files are kept.
fn folders(id: &str) -> (Vec<PathBuf>, bool) {
    match id {
        "temp" => (env_path("TEMP", &[]).into_iter().collect(), true),
        "windows-temp" => (env_path("SystemRoot", &["Temp"]).into_iter().collect(), true),
        "shader" => (
            [&["D3DSCache"][..], &["NVIDIA", "DXCache"], &["NVIDIA", "GLCache"], &["AMD", "DxCache"], &["AMD", "GLCache"]]
                .iter()
                .filter_map(|rest| env_path("LOCALAPPDATA", rest))
                .collect(),
            false,
        ),
        _ => (vec![], false),
    }
}

fn recycle_bin_bytes() -> u64 {
    let mut info = SHQUERYRBINFO { cbSize: std::mem::size_of::<SHQUERYRBINFO>() as u32, ..Default::default() };
    unsafe { SHQueryRecycleBinW(PCWSTR::null(), &mut info) }.map_or(0, |_| info.i64Size.max(0) as u64)
}

fn old_enough(m: &std::fs::Metadata) -> bool {
    m.modified().ok().and_then(|t| SystemTime::now().duration_since(t).ok()).is_some_and(|age| age >= TEMP_MIN_AGE)
}

/// Deletes the contents of `dir` (not `dir` itself); locked or protected entries are skipped.
fn clear_contents(dir: &Path, keep_young: bool) -> u64 {
    let Ok(rd) = std::fs::read_dir(dir) else { return 0 };
    let mut freed = 0;
    for e in rd.flatten() {
        let path = e.path();
        let Ok(m) = std::fs::symlink_metadata(&path) else { continue };
        if keep_young && !old_enough(&m) {
            continue;
        }
        if is_link(&m) {
            // Remove the link itself, never what it points to.
            let _ = if m.is_dir() { std::fs::remove_dir(&path) } else { std::fs::remove_file(&path) };
            continue;
        }
        let size = size_of(&path);
        let ok = if m.is_dir() { std::fs::remove_dir_all(&path).is_ok() } else { std::fs::remove_file(&path).is_ok() };
        if ok {
            freed += size;
        } else if m.is_dir() {
            // Something inside is locked: clean what we can.
            freed += clear_contents(&path, keep_young);
        }
    }
    freed
}

pub fn targets() -> Vec<CleanupTarget> {
    TARGETS
        .iter()
        .map(|&(id, label, hint)| CleanupTarget {
            id,
            label,
            hint,
            bytes: if id == "recycle" { recycle_bin_bytes() } else { folders(id).0.iter().map(|p| size_of(p)).sum() },
        })
        .collect()
}

/// Cleans one target; returns the bytes freed.
pub fn clean(id: &str) -> Result<u64, String> {
    if id == "recycle" {
        let before = recycle_bin_bytes();
        // Emptying an already empty bin reports an error; that is fine.
        let _ = unsafe { SHEmptyRecycleBinW(None, PCWSTR::null(), SHERB_NOCONFIRMATION | SHERB_NOPROGRESSUI | SHERB_NOSOUND) };
        return Ok(before.saturating_sub(recycle_bin_bytes()));
    }
    if !TARGETS.iter().any(|t| t.0 == id) {
        return Err("Unknown cleanup target.".into());
    }
    let (dirs, keep_young) = folders(id);
    Ok(dirs.iter().map(|d| clear_contents(d, keep_young)).sum())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clears_only_old_contents_and_keeps_the_folder() {
        let root = std::env::temp_dir().join(format!("systemcore-cleanup-test-{}", std::process::id()));
        std::fs::create_dir_all(root.join("sub")).unwrap();
        std::fs::write(root.join("new.txt"), b"12345").unwrap();
        std::fs::write(root.join("sub").join("a.bin"), [0u8; 100]).unwrap();
        assert_eq!(size_of(&root), 105);
        assert_eq!(scan(&root).unwrap().entries[0].name, "sub", "largest first");
        assert_eq!(clear_contents(&root, true), 0, "fresh files are kept");
        assert_eq!(clear_contents(&root, false), 105);
        assert!(root.exists() && std::fs::read_dir(&root).unwrap().next().is_none());
        std::fs::remove_dir(&root).unwrap();
    }
}
