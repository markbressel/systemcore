mod collector;
mod commands;
mod domain;
mod hardware;
mod platform;
mod prefs;
mod speedtest;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

/// Command-line flag Windows autostart launches us with.
pub const AUTOSTART_ARG: &str = "--autostart";

/// Window creation deadlocks on the main thread, where tray and hotkey handlers run.
fn toggle_overlay_async(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let _ = commands::overlay(&app, None);
    });
}

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let menu = Menu::with_items(
        app,
        &[
            &MenuItem::with_id(app, "show", "Open SystemCore", true, None::<&str>)?,
            &MenuItem::with_id(app, "overlay", "Show / hide overlay\tCtrl+Shift+O", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "quit", "Quit SystemCore", true, None::<&str>)?,
        ],
    )?;
    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("SystemCore")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, e| match e.id.as_ref() {
            "show" => {
                let _ = commands::show_main_window(app);
            }
            "overlay" => toggle_overlay_async(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, e| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                let _ = commands::show_main_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

pub fn run() {
    let overlay_hotkey = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyO);
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec![AUTOSTART_ARG])))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, sc, e| {
                    if *sc == overlay_hotkey && e.state() == ShortcutState::Pressed {
                        toggle_overlay_async(app);
                    }
                })
                .build(),
        )
        .manage(collector::Shared::default())
        .manage(prefs::SharedPrefs::default())
        .manage(speedtest::SpeedTestState::default())
        .setup(move |app| {
            let shared = app.state::<collector::Shared>().inner().clone();
            let prefs = app.state::<prefs::SharedPrefs>().inner().clone();
            collector::spawn(app.handle().clone(), shared, prefs);
            build_tray(app)?;
            // Another app may own the hotkey; the overlay stays reachable from the tray and the UI.
            if let Err(e) = app.global_shortcut().register(overlay_hotkey) {
                eprintln!("overlay hotkey unavailable: {e}");
            }
            // The main window starts hidden; a login launch leaves it to the UI (start in tray or not).
            if !commands::launched_at_login() {
                let _ = commands::show_main_window(app.handle());
            }
            Ok(())
        })
        // Closing the main window hides it (tray / overlay keep running) when the user wants that
        // or while the overlay is open; otherwise the app quits with its last window.
        .on_window_event(|w, e| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = e {
                let app = w.app_handle();
                let to_tray = app.state::<prefs::SharedPrefs>().lock().is_ok_and(|p| p.close_to_tray);
                if w.label() == "main" && (to_tray || app.get_webview_window("overlay").is_some()) {
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
            commands::set_overlay,
            commands::show_main,
            commands::launched_at_login,
            commands::set_prefs
        ])
        .run(tauri::generate_context!())
        .expect("error while running SystemCore");
}
