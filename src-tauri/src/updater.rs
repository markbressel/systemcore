//! Program updates through winget (Windows Package Manager): list what can be updated, the installer's download
//! size, and update one program at a time so the UI can show progress per row.

use std::os::windows::process::CommandExt;
use std::process::Command;
use std::time::Duration;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(serde::Serialize, Debug, PartialEq)]
pub struct Upgrade {
    name: String,
    id: String,
    version: String,
    available: String,
    source: String,
}

fn winget(args: &[&str]) -> Result<(bool, String), String> {
    let out = Command::new("winget")
        .args(args)
        .args(["--accept-source-agreements", "--disable-interactivity"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|_| "winget (Windows Package Manager) is not installed. Install \"App Installer\" from the Microsoft Store.".to_string())?;
    Ok((out.status.success(), String::from_utf8_lossy(&out.stdout).into_owned()))
}

/// Output lines without the progress spinner winget draws with carriage returns.
fn lines(out: &str) -> Vec<&str> {
    out.lines().map(|l| l.rsplit('\r').next().unwrap_or(l).trim_end()).collect()
}

/// Rows of a winget table, split by the header's column positions (the header text is translated).
/// The table ends at the first blank line; a second table after it (packages that need explicit targeting) is left out.
fn parse_table(out: &str) -> Vec<Vec<String>> {
    let lines = lines(out);
    let Some(dash) = lines.iter().position(|l| l.len() > 20 && l.chars().all(|c| c == '-')) else { return vec![] };
    let Some(header) = dash.checked_sub(1).map(|i| lines[i].chars().collect::<Vec<_>>()) else { return vec![] };
    let starts: Vec<usize> = (0..header.len()).filter(|&i| header[i] != ' ' && (i == 0 || header[i - 1] == ' ')).collect();
    if starts.len() < 3 {
        return vec![];
    }
    lines[dash + 1..]
        .iter()
        .take_while(|l| !l.trim().is_empty())
        .map(|line| {
            let chars: Vec<char> = line.chars().collect();
            (0..starts.len())
                .map(|i| {
                    let from = starts[i].min(chars.len());
                    let to = starts.get(i + 1).copied().unwrap_or(chars.len()).min(chars.len());
                    chars[from..to].iter().collect::<String>().trim().to_string()
                })
                .collect()
        })
        .collect()
}

/// The `winget upgrade` table: Name, Id, Version, Available, Source. The "25 upgrades available." footer has no id.
pub fn parse_upgrades(out: &str) -> Vec<Upgrade> {
    parse_table(out)
        .into_iter()
        .filter(|c| c.len() == 5 && !c[1].is_empty() && !c[3].is_empty())
        .map(|c| Upgrade { name: c[0].clone(), id: c[1].clone(), version: c[2].clone(), available: c[3].clone(), source: c[4].clone() })
        .collect()
}

#[derive(serde::Serialize, Debug, PartialEq)]
pub struct Installed {
    name: String,
    /// A package id ("Valve.Steam") or winget's own handle for programs it does not manage ("ARP\User\X64\Discord").
    id: String,
}

/// The `winget list` table: name and id of everything installed.
fn parse_installed(out: &str) -> Vec<Installed> {
    parse_table(out).into_iter().filter(|c| c.len() >= 2 && !c[1].is_empty()).map(|c| Installed { name: c[0].clone(), id: c[1].clone() }).collect()
}

/// Package ids are plain names ("VideoLAN.VLC", "XP9CS6FHQ00B8J"); anything else is refused before reaching winget.
fn valid_id(id: &str) -> Result<(), String> {
    let ok = !id.is_empty() && id.len() < 200 && !id.starts_with('-') && id.chars().all(|c| c.is_ascii_alphanumeric() || "._+-".contains(c));
    if ok { Ok(()) } else { Err("Invalid package id.".into()) }
}

/// The installer URL in `winget show`: the URL line directly followed by its SHA256 line (labels are translated).
fn installer_url(out: &str) -> Option<String> {
    let lines = lines(out);
    lines.windows(2).find_map(|w| {
        let url = w[0].split_whitespace().last()?;
        let hash = w[1].split_whitespace().last()?;
        (url.starts_with("http") && hash.len() == 64 && hash.chars().all(|c| c.is_ascii_hexdigit())).then(|| url.to_string())
    })
}

fn download_size(url: &str) -> Option<u64> {
    let agent: ureq::Agent = ureq::Agent::config_builder().timeout_global(Some(Duration::from_secs(15))).build().into();
    let len = |r: &ureq::http::Response<ureq::Body>, h: &str| r.headers().get(h)?.to_str().ok().map(str::to_string);
    if let Ok(r) = agent.head(url).call() {
        if let Some(n) = len(&r, "content-length").and_then(|v| v.parse::<u64>().ok()).filter(|&n| n > 0) {
            return Some(n);
        }
    }
    // Some download servers refuse HEAD: ask for one byte and read the total from Content-Range ("bytes 0-0/12345").
    let r = agent.get(url).header("Range", "bytes=0-0").call().ok()?;
    len(&r, "content-range")?.rsplit('/').next()?.parse().ok()
}

#[tauri::command]
pub async fn list_upgrades() -> Result<Vec<Upgrade>, String> {
    tauri::async_runtime::spawn_blocking(|| Ok(parse_upgrades(&winget(&["upgrade"])?.1))).await.map_err(|e| e.to_string())?
}

/// Download size of the new version's installer in bytes; None when the source does not say (e.g. Microsoft Store).
#[tauri::command]
pub async fn upgrade_size(id: String) -> Result<Option<u64>, String> {
    valid_id(&id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let (_, out) = winget(&["show", "--id", &id, "--exact"])?;
        Ok(installer_url(&out).and_then(|u| download_size(&u)))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Updates one program silently. Installers that need admin rights show the Windows permission prompt.
#[tauri::command]
pub async fn upgrade_package(id: String) -> Result<(), String> {
    valid_id(&id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let (ok, out) = winget(&["upgrade", "--id", &id, "--exact", "--silent", "--accept-package-agreements"])?;
        if ok {
            return Ok(());
        }
        // winget's last line says what went wrong ("Installer failed with exit code: 1603", ...).
        let reason = lines(&out).into_iter().rev().find(|l| l.chars().any(char::is_alphabetic)).unwrap_or("Update failed.").trim().to_string();
        Err(reason)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn list_installed() -> Result<Vec<Installed>, String> {
    tauri::async_runtime::spawn_blocking(|| Ok(parse_installed(&winget(&["list"])?.1))).await.map_err(|e| e.to_string())?
}

/// Installs one program silently from winget's own repository or the Microsoft Store.
#[tauri::command]
pub async fn install_package(id: String, source: String) -> Result<(), String> {
    valid_id(&id)?;
    if source != "winget" && source != "msstore" {
        return Err("Unknown package source.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let (ok, out) = winget(&["install", "--id", &id, "--exact", "--source", &source, "--silent", "--accept-package-agreements"])?;
        if ok {
            return Ok(());
        }
        let reason = lines(&out).into_iter().rev().find(|l| l.chars().any(char::is_alphabetic)).unwrap_or("Install failed.").trim().to_string();
        Err(reason)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Programs without a winget package whose publisher has one fixed download link: key, URL, Referer the server
/// expects. Only these can be downloaded, so the UI cannot make the app fetch and run anything else.
const DIRECT: [(&str, &str, &str); 1] = [("amd-ryzen-master", "https://download.amd.com/Desktop/amd-ryzen-master.exe", "https://www.amd.com/")];

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadProgress {
    key: String,
    done: u64,
    total: Option<u64>,
}

/// Downloads a publisher's installer to the temp folder (progress as "installer:progress" events) and starts it.
#[tauri::command]
pub async fn download_installer(app: tauri::AppHandle, key: String) -> Result<(), String> {
    use std::io::{Read, Write};
    use tauri::Emitter;
    use tauri_plugin_opener::OpenerExt;
    let &(key, url, referer) = DIRECT.iter().find(|(k, ..)| *k == key).ok_or("Unknown download.")?;
    tauri::async_runtime::spawn_blocking(move || {
        let dir = std::env::temp_dir().join("SystemCore");
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let path = dir.join(url.rsplit('/').next().unwrap_or("installer.exe"));
        let partial = path.with_extension("part");
        let agent: ureq::Agent = ureq::Agent::config_builder().timeout_connect(Some(Duration::from_secs(20))).build().into();
        let mut resp = agent
            .get(url)
            .header("Referer", referer)
            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) SystemCore")
            .call()
            .map_err(|e| format!("Download failed: {e}"))?;
        let total = resp.headers().get("content-length").and_then(|v| v.to_str().ok()?.parse().ok());
        let mut reader = resp.body_mut().with_config().limit(4 * 1024 * 1024 * 1024).reader();
        let mut file = std::fs::File::create(&partial).map_err(|e| e.to_string())?;
        let (mut buf, mut done, mut reported) = (vec![0u8; 256 * 1024], 0u64, 0u64);
        loop {
            let n = reader.read(&mut buf).map_err(|e| format!("Download failed: {e}"))?;
            if n == 0 {
                break;
            }
            file.write_all(&buf[..n]).map_err(|e| e.to_string())?;
            done += n as u64;
            if done - reported >= 2 * 1024 * 1024 {
                reported = done;
                let _ = app.emit("installer:progress", DownloadProgress { key: key.into(), done, total });
            }
        }
        drop(file);
        if total.is_some_and(|t| t != done) {
            let _ = std::fs::remove_file(&partial);
            return Err("Download failed: the file arrived incomplete.".into());
        }
        std::fs::rename(&partial, &path).map_err(|e| e.to_string())?;
        // The installer opens with its own window (and the Windows permission prompt).
        app.opener().open_path(path.to_string_lossy(), None::<&str>).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_upgrade_table() {
        let out = "\r-\r\\\r \rName                       Id                    Version    Available  Source\n\
            --------------------------------------------------------------------------------\n\
            HWiNFO® 64                 XP9CS6FHQ00B8J        8.52       8.60       msstore\n\
            AnyDesk                    AnyDesk.AnyDesk       ad 9.6.11  9.8.4      winget\n\
            Python Launcher            Python.Launcher       < 3.14.7   3.15.2     winget\n\
            3 upgrades available.\n\
            \n\
            The following packages have an upgrade available, but require explicit targeting for upgrade:\n";
        let rows = parse_upgrades(out);
        assert_eq!(rows.len(), 3);
        assert_eq!(rows[0], Upgrade { name: "HWiNFO® 64".into(), id: "XP9CS6FHQ00B8J".into(), version: "8.52".into(), available: "8.60".into(), source: "msstore".into() });
        assert_eq!(rows[1].version, "ad 9.6.11");
        assert_eq!(rows[2].version, "< 3.14.7");
        assert!(parse_upgrades("No installed package found matching input criteria.").is_empty());
    }

    #[test]
    fn parses_installed_list() {
        let out = "Name          Id                     Version   Available Source\n\
            ----------------------------------------------------------------\n\
            Discord       ARP\\User\\X64\\Discord   1.0.9270\n\
            CPUID CPU-Z   CPUID.CPU-Z.MSI        2.15      2.20.2    winget\n";
        assert_eq!(
            parse_installed(out),
            vec![Installed { name: "Discord".into(), id: r"ARP\User\X64\Discord".into() }, Installed { name: "CPUID CPU-Z".into(), id: "CPUID.CPU-Z.MSI".into() }]
        );
    }

    /// Real winget on this PC: `cargo test real_winget -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn real_winget() {
        let rows = parse_upgrades(&winget(&["upgrade"]).unwrap().1);
        println!("{} upgrades", rows.len());
        for r in rows.iter().take(4) {
            let out = winget(&["show", "--id", &r.id, "--exact"]).unwrap().1;
            println!("{} {} -> {} | {:?} bytes", r.id, r.version, r.available, installer_url(&out).and_then(|u| download_size(&u)));
        }
        assert!(!rows.is_empty());
        let installed = parse_installed(&winget(&["list"]).unwrap().1);
        println!("{} installed; e.g. {:?}", installed.len(), installed.iter().filter(|i| i.name.contains("Discord") || i.id.contains("Steam") || i.name.contains("CPU-Z")).collect::<Vec<_>>());
    }

    #[test]
    fn finds_installer_url_and_checks_ids() {
        let out = "Installer:\n  Installer Type: wix\n  Installer Url: https://download.videolan.org/vlc-3.0.24-win64.msi\n  Installer SHA256: 22172095ce4c2d5f5b600bb4c142d78105db29a77fa59a931941876f3b20f6d0\n";
        assert_eq!(installer_url(out).as_deref(), Some("https://download.videolan.org/vlc-3.0.24-win64.msi"));
        assert!(installer_url("Publisher Url: https://www.videolan.org/\nLicense: GPL\n").is_none());
        assert!(valid_id("Microsoft.VCRedist.2015+.x64").is_ok());
        assert!(valid_id("--all").is_err());
        assert!(valid_id("a b").is_err());
    }
}
