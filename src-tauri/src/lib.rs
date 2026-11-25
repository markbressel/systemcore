mod collector;
mod commands;
mod domain;
mod hardware;
mod platform;
mod speedtest;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(collector::Shared::default())
        .manage(speedtest::SpeedTestState::default())
        .setup(|app| {
            let shared = app.state::<collector::Shared>().inner().clone();
            collector::spawn(app.handle().clone(), shared);
            Ok(())
        })
        // The overlay must not keep the app alive once the main window is gone.
        .on_window_event(|w, e| {
            if w.label() == "main" && matches!(e, tauri::WindowEvent::Destroyed) {
                w.app_handle().exit(0);
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_latest,
            commands::get_hardware,
            commands::start_speed_test,
            commands::cancel_speed_test,
            commands::kill_process,
            commands::toggle_overlay
        ])
        .run(tauri::generate_context!())
        .expect("error while running SystemCore");
}
