//! Narrow IPC commands. No command accepts paths or shell input. Commands that change the system:
//! `kill_process`, `set_process_priority`, `set_startup_enabled` (only for entries that exist) and
//! `set_rgb_color` (only for lighting devices found by `list_rgb_devices`), `set_display_color` and
//! `set_display_hardware` (only for displays Windows lists).

use crate::collector::Shared;
use crate::domain::Latest;
use crate::hardware::{self, HardwareInfo};
use crate::speedtest;
use crate::platform::windows as win;
use tauri::{Emitter, Manager};
use tauri_plugin_opener::OpenerExt;

#[tauri::command]
pub fn get_latest(state: tauri::State<'_, Shared>) -> Result<Latest, String> {
    state.lock().map(|l| l.clone()).map_err(|_| "telemetry state poisoned".into())
}

/// User-initiated internet speed test; progress arrives as `speedtest:progress` events.
#[tauri::command]
pub async fn start_speed_test(app: tauri::AppHandle) -> Result<speedtest::Progress, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<speedtest::SpeedTestState>();
        speedtest::run(&state, &mut |p| {
            let _ = app.emit("speedtest:progress", p);
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn cancel_speed_test(state: tauri::State<'_, speedtest::SpeedTestState>) {
    speedtest::cancel(&state);
}

/// Hardware inventory hits WMI/registry, so keep it off the UI thread.
#[tauri::command]
pub async fn get_hardware() -> Result<HardwareInfo, String> {
    tauri::async_runtime::spawn_blocking(hardware::collect).await.map_err(|e| e.to_string())
}

/// Looks up a live process by PID + start time, so a PID Windows reused for a new process is never hit.
fn live_process(pid: u32, start_time: u64) -> Result<sysinfo::System, String> {
    let id = sysinfo::Pid::from_u32(pid);
    let mut sys = sysinfo::System::new().map_err(|e| e.to_string())?;
    sys.refresh_processes_specifics(
        sysinfo::ProcessesToUpdate::Some(&[id]),
        true,
        sysinfo::ProcessRefreshKind::nothing().with_exe(sysinfo::UpdateKind::Always),
    );
    match sys.process(id) {
        Some(p) if p.start_time() == start_time => Ok(sys),
        _ => Err("The process has already exited.".into()),
    }
}

/// Ends one process after the user confirmed it.
#[tauri::command]
pub fn kill_process(pid: u32, start_time: u64) -> Result<(), String> {
    if pid == std::process::id() {
        return Err("SystemCore cannot end itself.".into());
    }
    let sys = live_process(pid, start_time)?;
    let p = sys.process(sysinfo::Pid::from_u32(pid)).ok_or("The process has already exited.")?;
    if p.kill() {
        Ok(())
    } else {
        Err(format!("Windows refused to end {} (access denied or protected process).", p.name().to_string_lossy()))
    }
}

/// Opens (`Some(true)`), closes (`Some(false)`) or toggles (`None`) the always-on-top overlay.
/// Every path (UI, tray, hotkey) goes through here, so the UI hears one `overlay:changed` event.
/// Must not run on the main thread: creating a window there deadlocks on Windows.
pub fn overlay(app: &tauri::AppHandle, open: Option<bool>) -> Result<bool, String> {
    let existing = app.get_webview_window("overlay");
    let want = open.unwrap_or(existing.is_none());
    match (existing, want) {
        (Some(w), false) => w.close().map_err(|e| e.to_string())?,
        (None, true) => {
            tauri::WebviewWindowBuilder::new(app, "overlay", tauri::WebviewUrl::default())
                .title("SystemCore overlay")
                .inner_size(270.0, 218.0)
                .position(16.0, 16.0)
                .transparent(true)
                .shadow(false)
                .always_on_top(true)
                .decorations(false)
                .resizable(false)
                .skip_taskbar(true)
                .focused(false)
                .build()
                .map_err(|e| e.to_string())?;
        }
        _ => {}
    }
    let _ = app.emit("overlay:changed", want);
    Ok(want)
}

#[tauri::command]
pub async fn set_overlay(app: tauri::AppHandle, open: Option<bool>) -> Result<bool, String> {
    overlay(&app, open)
}

/// Brings the main window back (it is hidden, not closed, while running in the tray).
pub fn show_main_window(app: &tauri::AppHandle) -> Result<(), String> {
    let main = app.get_webview_window("main").ok_or("Main window is missing.")?;
    let _ = main.unminimize();
    main.show().map_err(|e| e.to_string())?;
    main.set_focus().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn show_main(app: tauri::AppHandle) -> Result<(), String> {
    show_main_window(&app)
}

/// Launched by Windows autostart (the UI then decides whether to stay in the tray).
#[tauri::command]
pub fn launched_at_login() -> bool {
    std::env::args().any(|a| a == crate::AUTOSTART_ARG)
}

#[tauri::command]
pub fn set_prefs(app: tauri::AppHandle, prefs: crate::prefs::Prefs, state: tauri::State<'_, crate::prefs::SharedPrefs>) {
    crate::set_tray_language(&app, prefs.language == "hu");
    if let Ok(mut p) = state.lock() {
        *p = prefs;
    }
}

/// Shows the process's executable selected in File Explorer.
#[tauri::command]
pub fn open_process_location(app: tauri::AppHandle, pid: u32, start_time: u64) -> Result<(), String> {
    let sys = live_process(pid, start_time)?;
    let exe = sys.process(sysinfo::Pid::from_u32(pid)).and_then(|p| p.exe()).ok_or("Windows does not reveal this process's location.")?;
    app.opener().reveal_item_in_dir(exe).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_process_priority(pid: u32, start_time: u64) -> Result<Option<&'static str>, String> {
    live_process(pid, start_time)?;
    Ok(win::system::priority(pid))
}

#[tauri::command]
pub fn set_process_priority(pid: u32, start_time: u64, priority: String) -> Result<(), String> {
    live_process(pid, start_time)?;
    win::system::set_priority(pid, &priority)
}

/// Percent-encodes a query for a URL (RFC 3986 unreserved characters pass through).
pub fn url_encode(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

/// Opens a web search for the process name in the default browser.
#[tauri::command]
pub fn search_process(app: tauri::AppHandle, pid: u32, start_time: u64) -> Result<(), String> {
    let sys = live_process(pid, start_time)?;
    let name = sys.process(sysinfo::Pid::from_u32(pid)).map(|p| p.name().to_string_lossy().into_owned()).unwrap_or_default();
    let url = format!("https://www.bing.com/search?q={}", url_encode(&format!("{name} process")));
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_startup_apps() -> Vec<win::startup::StartupApp> {
    win::startup::list()
}

#[tauri::command]
pub fn set_startup_enabled(id: String, enabled: bool) -> Result<(), String> {
    win::startup::set_enabled(&id, enabled)
}

/// The last `minutes` (max 24 h) as 360 equal time buckets, oldest first.
#[tauri::command]
pub fn get_history(minutes: u64, state: tauri::State<'_, crate::history::SharedHistory>) -> Vec<crate::history::Point> {
    let now = crate::domain::now_ms();
    let since = now.saturating_sub(minutes.clamp(1, 24 * 60) * 60_000);
    state.lock().map(|q| crate::history::query(&q, since, now, 360)).unwrap_or_default()
}

#[tauri::command]
pub fn is_elevated() -> bool {
    win::system::is_elevated()
}

/// Relaunches through UAC (needed for FPS). The new instance starts before this one exits.
#[tauri::command]
pub fn restart_as_admin(app: tauri::AppHandle) -> Result<(), String> {
    win::system::relaunch_elevated()?;
    app.exit(0);
    Ok(())
}

/// Saves the system report text to Downloads and shows it in Explorer. The UI supplies only the text;
/// the location and file name are fixed here.
#[tauri::command]
pub fn save_report(app: tauri::AppHandle, text: String) -> Result<String, String> {
    if text.len() > 1_000_000 {
        return Err("Report too large.".into());
    }
    let dir = app.path().download_dir().map_err(|e| e.to_string())?;
    let path = dir.join(format!("SystemCore-report-{}.txt", crate::domain::now_ms() / 1000));
    std::fs::write(&path, text).map_err(|e| e.to_string())?;
    let _ = app.opener().reveal_item_in_dir(&path);
    Ok(path.to_string_lossy().into_owned())
}

/// Loads every CPU core for `seconds` (5–120) off the UI thread; resolves to the score.
#[tauri::command]
pub async fn run_cpu_benchmark(seconds: u64, state: tauri::State<'_, crate::benchmark::BenchmarkState>) -> Result<f64, String> {
    let cancel = state.cancel.clone();
    cancel.store(false, std::sync::atomic::Ordering::Relaxed);
    let duration = std::time::Duration::from_secs(seconds.clamp(5, 120));
    tauri::async_runtime::spawn_blocking(move || crate::benchmark::run_cpu(duration, &cancel))
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Cancelled.".to_string())
}

#[tauri::command]
pub fn cancel_benchmark(state: tauri::State<'_, crate::benchmark::BenchmarkState>) {
    state.cancel.store(true, std::sync::atomic::Ordering::Relaxed);
}

/// Sizes of everything directly inside `path` (default: the user's home folder), largest first.
#[tauri::command]
pub async fn scan_folder(app: tauri::AppHandle, path: Option<String>) -> Result<crate::cleanup::FolderScan, String> {
    let dir = match path {
        Some(p) => std::path::PathBuf::from(p),
        None => app.path().home_dir().map_err(|e| e.to_string())?,
    };
    if !dir.is_absolute() || !dir.is_dir() {
        return Err("Not a folder.".into());
    }
    tauri::async_runtime::spawn_blocking(move || crate::cleanup::scan(&dir)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn cleanup_targets() -> Result<Vec<crate::cleanup::CleanupTarget>, String> {
    tauri::async_runtime::spawn_blocking(crate::cleanup::targets).await.map_err(|e| e.to_string())
}

/// Deletes one fixed cleanup target's contents; resolves to the bytes freed.
#[tauri::command]
pub async fn clean_target(id: String) -> Result<u64, String> {
    tauri::async_runtime::spawn_blocking(move || crate::cleanup::clean(&id)).await.map_err(|e| e.to_string())?
}

/// Shows a file or folder in Explorer.
#[tauri::command]
pub fn reveal_path(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let p = std::path::PathBuf::from(path);
    if !p.is_absolute() || !p.exists() {
        return Err("Path not found.".into());
    }
    app.opener().reveal_item_in_dir(&p).map_err(|e| e.to_string())
}

/// Whether fullscreen optimizations are switched off (then the overlay cannot show over fullscreen games).
#[tauri::command]
pub fn fso_status() -> crate::platform::windows::fso::FsoStatus {
    crate::platform::windows::fso::status()
}

#[tauri::command]
pub fn enable_fso() -> Result<(), String> {
    crate::platform::windows::fso::enable()
}

#[cfg(test)]
mod tests {
    #[test]
    fn url_encode_escapes_everything_but_unreserved() {
        assert_eq!(super::url_encode("svchost.exe process"), "svchost.exe%20process");
        assert_eq!(super::url_encode("a&b=c/é"), "a%26b%3Dc%2F%C3%A9");
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriverStatus {
    installed: bool,
    elevated: bool,
}

/// PawnIO driver (RAM/motherboard RGB, CPU temperature): installed, and usable by this process.
#[tauri::command]
pub fn hardware_driver_status() -> DriverStatus {
    DriverStatus { installed: win::pawnio::installed(), elevated: win::system::is_elevated() }
}

#[tauri::command]
pub async fn list_rgb_devices() -> Result<Vec<win::lights::RgbDevice>, String> {
    tauri::async_runtime::spawn_blocking(win::lights::list).await.map_err(|e| e.to_string())
}

/// `color` is "#rrggbb".
#[tauri::command]
pub async fn set_rgb_color(id: String, color: String) -> Result<(), String> {
    let hex = color.strip_prefix('#').filter(|h| h.len() == 6).ok_or("color must be #rrggbb")?;
    let c = u32::from_str_radix(hex, 16).map_err(|_| "color must be #rrggbb")?.to_be_bytes();
    tauri::async_runtime::spawn_blocking(move || win::lights::set_color(&id, [c[1], c[2], c[3]])).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn list_displays() -> Result<Vec<win::display::Display>, String> {
    tauri::async_runtime::spawn_blocking(win::display::list).await.map_err(|e| e.to_string())
}

/// Picture adjustment through the gamma ramp (+ NVIDIA vibrance); values are clamped in `display::ramp`.
#[tauri::command]
pub async fn set_display_color(id: String, adjust: win::display::ColorAdjust) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || win::display::apply(&id, &adjust)).await.map_err(|e| e.to_string())?
}

/// The monitor's own brightness/contrast over DDC/CI.
#[tauri::command]
pub async fn set_display_hardware(id: String, brightness: Option<u32>, contrast: Option<u32>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || win::display::set_hardware(&id, brightness, contrast)).await.map_err(|e| e.to_string())?
}
