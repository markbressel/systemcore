// No console window on Windows, dev builds included (`tauri dev` still pipes the logs).
#![windows_subsystem = "windows"]

fn main() {
    systemcore_lib::run()
}
