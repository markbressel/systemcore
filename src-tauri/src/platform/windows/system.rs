//! Foreground window, elevation and process priority (Win32).

use windows::core::{HSTRING, PCWSTR};
use windows::Win32::Foundation::{CloseHandle, RECT};
use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST};
use windows::Win32::System::Threading::{
    GetPriorityClass, OpenProcess, SetPriorityClass, ABOVE_NORMAL_PRIORITY_CLASS, BELOW_NORMAL_PRIORITY_CLASS, HIGH_PRIORITY_CLASS,
    IDLE_PRIORITY_CLASS, NORMAL_PRIORITY_CLASS, PROCESS_CREATION_FLAGS, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SET_INFORMATION,
    PROCESS_SYNCHRONIZE, WaitForSingleObject,
};
use windows::Win32::UI::Shell::{IsUserAnAdmin, ShellExecuteW};
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::{
    GetClassNameW, GetForegroundWindow, GetWindowRect, GetWindowThreadProcessId, SetWindowPos, HWND_TOPMOST, SWP_ASYNCWINDOWPOS, SWP_NOACTIVATE,
    SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW, SW_SHOWNORMAL,
};

pub struct Foreground {
    pub pid: u32,
    /// The window covers its whole monitor (fullscreen or borderless fullscreen).
    pub fullscreen: bool,
}

pub fn foreground() -> Option<Foreground> {
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.is_invalid() {
            return None;
        }
        let mut pid = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == 0 {
            return None;
        }
        // The desktop and taskbar also cover the screen but are never a game.
        let mut class = [0u16; 64];
        let n = GetClassNameW(hwnd, &mut class) as usize;
        if matches!(String::from_utf16_lossy(&class[..n]).as_str(), "Progman" | "WorkerW" | "Shell_TrayWnd") {
            return Some(Foreground { pid, fullscreen: false });
        }
        let mut r = RECT::default();
        GetWindowRect(hwnd, &mut r).ok()?;
        let mut mi = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
        if !GetMonitorInfoW(MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST), &mut mi).as_bool() {
            return None;
        }
        let m = mi.rcMonitor;
        Some(Foreground { pid, fullscreen: r.left <= m.left && r.top <= m.top && r.right >= m.right && r.bottom >= m.bottom })
    }
}

pub fn is_elevated() -> bool {
    unsafe { IsUserAnAdmin().as_bool() }
}

/// Starts this exe again through the UAC prompt. The caller exits on success.
const WAIT_PID_ARG: &str = "--wait-pid";

/// Elevated restart: wait (max 10 s) for the old instance to exit, or the single-instance guard
/// would see it still running and close this one.
pub fn wait_for_previous_instance() {
    let mut args = std::env::args();
    let Some(pid) = args.position(|a| a == WAIT_PID_ARG).and_then(|_| args.next()).and_then(|p| p.parse::<u32>().ok()) else { return };
    unsafe {
        if let Ok(h) = OpenProcess(PROCESS_SYNCHRONIZE, false, pid) {
            WaitForSingleObject(h, 10_000);
            let _ = CloseHandle(h);
        }
    }
}

pub fn relaunch_elevated() -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    // Keep the login flag, so an elevated autostart still opens in the tray.
    let login = if std::env::args().any(|a| a == crate::AUTOSTART_ARG) { format!(" {}", crate::AUTOSTART_ARG) } else { String::new() };
    let args = HSTRING::from(format!("{WAIT_PID_ARG} {}{login}", std::process::id()));
    let r = unsafe { ShellExecuteW(None, &HSTRING::from("runas"), &HSTRING::from(exe.as_os_str()), &args, PCWSTR::null(), SW_SHOWNORMAL) };
    // ShellExecute reports success as a value above 32; the user declining UAC is the usual failure.
    if r.0 as usize > 32 { Ok(()) } else { Err("Administrator rights were not granted.".into()) }
}

/// SystemCore runs as administrator by default (FPS, CPU temperature, RAM lighting need it): a normal launch
/// restarts itself through UAC once. Returns true when the elevated copy is starting and this one should exit.
/// A declined prompt keeps this copy running without those features. Not in dev builds: `tauri dev` would lose
/// its window to the elevated copy.
pub fn elevate_at_start() -> bool {
    if cfg!(debug_assertions) || !run_as_admin() || is_elevated() || std::env::args().any(|a| a == WAIT_PID_ARG) {
        return false;
    }
    relaunch_elevated().is_ok()
}

// The "always run as administrator" switch lives in the registry: it is needed before any window or setting loads.
const PREFS_KEY: &str = r"Software\SystemCore";
const RUN_AS_ADMIN: &str = "RunAsAdmin";

/// On unless the user turned it off.
pub fn run_as_admin() -> bool {
    winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER)
        .open_subkey(PREFS_KEY)
        .and_then(|k| k.get_value::<u32, _>(RUN_AS_ADMIN))
        .map_or(true, |v| v != 0)
}

pub fn set_run_as_admin(on: bool) -> Result<(), String> {
    let (key, _) = winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER).create_subkey(PREFS_KEY).map_err(|e| e.to_string())?;
    key.set_value(RUN_AS_ADMIN, &(on as u32)).map_err(|e| e.to_string())
}

// ---- start with Windows: a Task Scheduler task, because Windows never starts elevated apps from the Run key ----

const TASK_NAME: &str = "SystemCore";

fn schtasks(args: &[&str]) -> bool {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    std::process::Command::new("schtasks").args(args).creation_flags(CREATE_NO_WINDOW).output().is_ok_and(|o| o.status.success())
}

pub fn startup_task_enabled() -> bool {
    schtasks(&["/Query", "/TN", TASK_NAME])
}

/// Creates (at sign-in, highest privileges, no battery or run-time limits) or removes the task. Needs administrator.
pub fn set_startup_task(on: bool) -> Result<(), String> {
    if !on {
        return if !startup_task_enabled() || schtasks(&["/Delete", "/TN", TASK_NAME, "/F"]) { Ok(()) } else { Err("Could not remove the startup task.".into()) };
    }
    if !is_elevated() {
        return Err("Run SystemCore as administrator to change this.".into());
    }
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let user = format!("{}\\{}", std::env::var("USERDOMAIN").unwrap_or_default(), std::env::var("USERNAME").unwrap_or_default());
    let xml = startup_task_xml(&user, &exe.to_string_lossy());
    let path = std::env::temp_dir().join("systemcore-startup-task.xml");
    // schtasks reads task XML as UTF-16.
    let bytes: Vec<u8> = std::iter::once(0xFEFFu16).chain(xml.encode_utf16()).flat_map(u16::to_le_bytes).collect();
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    let ok = schtasks(&["/Create", "/TN", TASK_NAME, "/XML", &path.to_string_lossy(), "/F"]);
    let _ = std::fs::remove_file(&path);
    if ok { Ok(()) } else { Err("Could not create the startup task.".into()) }
}

fn startup_task_xml(user: &str, exe: &str) -> String {
    let esc = |s: &str| s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;");
    format!(
        r#"<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>Starts SystemCore when you sign in.</Description></RegistrationInfo>
  <Triggers><LogonTrigger><Enabled>true</Enabled><UserId>{user}</UserId></LogonTrigger></Triggers>
  <Principals><Principal id="Author"><UserId>{user}</UserId><LogonType>InteractiveToken</LogonType><RunLevel>HighestAvailable</RunLevel></Principal></Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author"><Exec><Command>{exe}</Command><Arguments>{arg}</Arguments></Exec></Actions>
</Task>"#,
        user = esc(user),
        exe = esc(exe),
        arg = crate::AUTOSTART_ARG
    )
}

/// Puts a window back on top of the topmost band without focusing it. Fullscreen games can push
/// themselves above other topmost windows; async so a busy UI thread never blocks the caller.
pub fn keep_on_top(hwnd: isize) {
    let flags = SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_ASYNCWINDOWPOS;
    let _ = unsafe { SetWindowPos(HWND(hwnd as *mut core::ffi::c_void), Some(HWND_TOPMOST), 0, 0, 0, 0, flags) };
}

pub const PRIORITIES: [(&str, PROCESS_CREATION_FLAGS); 5] = [
    ("idle", IDLE_PRIORITY_CLASS),
    ("below_normal", BELOW_NORMAL_PRIORITY_CLASS),
    ("normal", NORMAL_PRIORITY_CLASS),
    ("above_normal", ABOVE_NORMAL_PRIORITY_CLASS),
    ("high", HIGH_PRIORITY_CLASS),
];

pub fn priority(pid: u32) -> Option<&'static str> {
    unsafe {
        let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let class = GetPriorityClass(h);
        let _ = CloseHandle(h);
        PRIORITIES.iter().find(|(_, f)| f.0 == class).map(|(n, _)| *n)
    }
}

/// Realtime is deliberately not offered: it can starve input and the OS.
pub fn set_priority(pid: u32, name: &str) -> Result<(), String> {
    let (_, flag) = PRIORITIES.iter().find(|(n, _)| *n == name).ok_or("Unknown priority.")?;
    unsafe {
        let h = OpenProcess(PROCESS_SET_INFORMATION, false, pid).map_err(|_| "Access denied: the process belongs to another user or is protected.")?;
        let r = SetPriorityClass(h, *flag);
        let _ = CloseHandle(h);
        r.map_err(|e| e.message())
    }
}

#[cfg(test)]
mod startup_task_tests {
    /// Elevated shell only; creates the real task, checks it, removes it: `cargo test startup_task_roundtrip -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn startup_task_roundtrip() {
        let had = super::startup_task_enabled();
        println!("create: {:?}", super::set_startup_task(true));
        println!("exists: {}", super::startup_task_enabled());
        if !had {
            println!("remove: {:?}", super::set_startup_task(false));
        }
        println!("exists after: {}", super::startup_task_enabled());
    }

    #[test]
    fn task_xml_escapes_and_runs_elevated_without_limits() {
        let x = super::startup_task_xml(r"PC\Tom & Co", r"C:\Apps\SystemCore\systemcore.exe");
        assert!(x.contains(r"<UserId>PC\Tom &amp; Co</UserId>"));
        assert!(x.contains("<RunLevel>HighestAvailable</RunLevel>"));
        assert!(x.contains("<ExecutionTimeLimit>PT0S</ExecutionTimeLimit>"));
        assert!(x.contains("<DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>"));
        assert!(x.contains("<Arguments>--autostart</Arguments>"));
    }
}
