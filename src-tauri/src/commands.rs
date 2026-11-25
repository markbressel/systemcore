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

/// Opens or closes the always-on-top mini overlay. Async: creating a window from a sync command deadlocks on Windows.
#[tauri::command]
pub async fn toggle_overlay(app: tauri::AppHandle) -> Result<bool, String> {
    if let Some(w) = app.get_webview_window("overlay") {
        w.close().map_err(|e| e.to_string())?;
        return Ok(false);
    }
    tauri::WebviewWindowBuilder::new(&app, "overlay", tauri::WebviewUrl::default())
        .title("SystemCore overlay")
        .inner_size(270.0, 200.0)
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
    Ok(true)
}
