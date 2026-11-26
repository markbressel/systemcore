//! Narrow IPC commands. No command accepts paths or shell input; `kill_process` is the only one that changes the system.

use crate::collector::Shared;
use crate::domain::Latest;
use crate::hardware::{self, HardwareInfo};
use crate::speedtest;
use tauri::{Emitter, Manager};

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

/// Ends one process after the user confirmed it. PID + start time must match a live process,
/// so a PID Windows reused for a new process is never hit.
#[tauri::command]
pub fn kill_process(pid: u32, start_time: u64) -> Result<(), String> {
    if pid == std::process::id() {
        return Err("SystemCore cannot end itself.".into());
    }
    let id = sysinfo::Pid::from_u32(pid);
    let mut sys = sysinfo::System::new().map_err(|e| e.to_string())?;
    sys.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[id]), true);
    let p = sys.process(id).filter(|p| p.start_time() == start_time).ok_or("The process has already exited.")?;
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
pub fn set_prefs(prefs: crate::prefs::Prefs, state: tauri::State<'_, crate::prefs::SharedPrefs>) {
    if let Ok(mut p) = state.lock() {
        *p = prefs;
    }
}
