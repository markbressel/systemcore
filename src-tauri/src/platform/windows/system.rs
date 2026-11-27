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
    let args = HSTRING::from(format!("{WAIT_PID_ARG} {}", std::process::id()));
    let r = unsafe { ShellExecuteW(None, &HSTRING::from("runas"), &HSTRING::from(exe.as_os_str()), &args, PCWSTR::null(), SW_SHOWNORMAL) };
    // ShellExecute reports success as a value above 32; the user declining UAC is the usual failure.
    if r.0 as usize > 32 { Ok(()) } else { Err("Administrator rights were not granted.".into()) }
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
