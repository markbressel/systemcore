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
        // Closing the main window while the overlay is open only hides it, so the overlay keeps running.
        // Without an overlay the close goes through and the app exits with its last window.
        .on_window_event(|w, e| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = e {
                if w.label() == "main" && w.app_handle().get_webview_window("overlay").is_some() {
                    api.prevent_close();
                    let _ = w.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_latest,
            commands::get_hardware,
            commands::start_speed_test,
            commands::cancel_speed_test,
            commands::kill_process,
            commands::toggle_overlay,
            commands::close_overlay,
            commands::show_main
        ])
        .run(tauri::generate_context!())
        .expect("error while running SystemCore");
}
