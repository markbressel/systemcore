//! Display color without vendor software:
//! - Gamma ramps (GDI): brightness, contrast, gamma and color temperature on any GPU. Windows keeps them until
//!   reset or reboot; some exclusive-fullscreen games load their own.
//! - DDC/CI (Monitor Configuration API): the monitor's own brightness and contrast, like its buttons.
//! - NVIDIA digital vibrance (saturation) through the installed driver's nvapi64.dll.

use serde::{Deserialize, Serialize};
use std::ffi::c_void;
use std::sync::OnceLock;
use windows::core::{s, w, BOOL, PCWSTR};
use windows::Win32::Devices::Display::{
    DestroyPhysicalMonitors, GetMonitorBrightness, GetMonitorContrast, GetNumberOfPhysicalMonitorsFromHMONITOR, GetPhysicalMonitorsFromHMONITOR,
    SetMonitorBrightness, SetMonitorContrast, PHYSICAL_MONITOR,
};
use windows::Win32::Foundation::{LPARAM, RECT};
use windows::Win32::Graphics::Gdi::{
    CreateDCW, DeleteDC, EnumDisplayDevicesW, EnumDisplayMonitors, GetMonitorInfoW, DISPLAY_DEVICEW, HDC, HMONITOR, MONITORINFO, MONITORINFOEXW,
};
use windows::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryW};
use windows::Win32::UI::ColorSystem::SetDeviceGammaRamp;

#[derive(Serialize, Clone, Copy, Debug)]
pub struct Range {
    pub min: i32,
    pub current: i32,
    pub max: i32,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Display {
    /// GDI device name, e.g. "\\.\DISPLAY1".
    pub id: String,
    pub name: String,
    pub primary: bool,
    pub width: i32,
    pub height: i32,
    /// The monitor's own settings over DDC/CI; None when it does not answer (laptops, some TVs, some docks).
    pub hw_brightness: Option<Range>,
    pub hw_contrast: Option<Range>,
    /// NVIDIA digital vibrance; None on other GPUs.
    pub vibrance: Option<Range>,
}

/// Software adjustment applied through the gamma ramp (+ vibrance). Neutral: 0, 0, 1.0, 6500, unchanged.
#[derive(Deserialize, Clone, Copy, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ColorAdjust {
    /// -50..50
    pub brightness: f32,
    /// -50..50
    pub contrast: f32,
    /// 0.5..2.0, 1 = unchanged
    pub gamma: f32,
    /// Kelvin 3000..9000, 6500 = unchanged
    pub temperature: f32,
    /// NVIDIA vibrance level; None leaves it as it is.
    pub vibrance: Option<i32>,
}

fn monitors() -> Vec<(HMONITOR, MONITORINFOEXW)> {
    unsafe extern "system" fn each(h: HMONITOR, _: HDC, _: *mut RECT, data: LPARAM) -> BOOL {
        let out = unsafe { &mut *(data.0 as *mut Vec<(HMONITOR, MONITORINFOEXW)>) };
        let mut info = MONITORINFOEXW::default();
        info.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
        if unsafe { GetMonitorInfoW(h, &mut info.monitorInfo as *mut MONITORINFO) }.as_bool() {
            out.push((h, info));
        }
        BOOL(1)
    }
    let mut out: Vec<(HMONITOR, MONITORINFOEXW)> = Vec::new();
    unsafe {
        let _ = EnumDisplayMonitors(None, None, Some(each), LPARAM(&mut out as *mut _ as isize));
    }
    out
}

fn device_name(info: &MONITORINFOEXW) -> String {
    let n = info.szDevice.iter().position(|&c| c == 0).unwrap_or(info.szDevice.len());
    String::from_utf16_lossy(&info.szDevice[..n])
}

fn friendly_name(device: &[u16]) -> Option<String> {
    let mut dd = DISPLAY_DEVICEW { cb: std::mem::size_of::<DISPLAY_DEVICEW>() as u32, ..Default::default() };
    unsafe { EnumDisplayDevicesW(PCWSTR(device.as_ptr()), 0, &mut dd, 0) }.as_bool().then(|| {
        let n = dd.DeviceString.iter().position(|&c| c == 0).unwrap_or(0);
        String::from_utf16_lossy(&dd.DeviceString[..n])
    })
}

/// Runs `f` on the monitor's first physical monitor handle (DDC/CI).
fn with_physical<T>(h: HMONITOR, f: impl FnOnce(&PHYSICAL_MONITOR) -> Option<T>) -> Option<T> {
    let mut n = 0u32;
    unsafe { GetNumberOfPhysicalMonitorsFromHMONITOR(h, &mut n) }.ok()?;
    let mut list = vec![PHYSICAL_MONITOR::default(); n.max(1) as usize];
    unsafe { GetPhysicalMonitorsFromHMONITOR(h, &mut list) }.ok()?;
    let r = list.first().and_then(f);
    unsafe {
        let _ = DestroyPhysicalMonitors(&list);
    }
    r
}

fn ddc_range(read: impl Fn(&mut u32, &mut u32, &mut u32) -> i32) -> Option<Range> {
    let (mut min, mut cur, mut max) = (0u32, 0u32, 0u32);
    (read(&mut min, &mut cur, &mut max) != 0 && max > min).then_some(Range { min: min as i32, current: cur as i32, max: max as i32 })
}

pub fn list() -> Vec<Display> {
    monitors()
        .into_iter()
        .map(|(h, info)| {
            let id = device_name(&info);
            let r = info.monitorInfo.rcMonitor;
            let (hw_brightness, hw_contrast) = with_physical(h, |p| {
                let b = ddc_range(|a, c, d| unsafe { GetMonitorBrightness(p.hPhysicalMonitor, a, c, d) });
                let c = ddc_range(|a, c, d| unsafe { GetMonitorContrast(p.hPhysicalMonitor, a, c, d) });
                Some((b, c))
            })
            .unwrap_or((None, None));
            Display {
                name: friendly_name(&info.szDevice).filter(|n| !n.is_empty()).unwrap_or_else(|| id.trim_start_matches(r"\\.\").to_string()),
                primary: info.monitorInfo.dwFlags & 1 != 0, // MONITORINFOF_PRIMARY
                width: r.right - r.left,
                height: r.bottom - r.top,
                hw_brightness,
                hw_contrast,
                vibrance: nv_vibrance(&id),
                id,
            }
        })
        .collect()
}

// ---- gamma ramp ----

/// White point of a black body at `kelvin`, scaled so 6500 K is (1, 1, 1) and no channel exceeds 1.
fn temperature_gains(kelvin: f32) -> [f32; 3] {
    fn rgb(k: f32) -> [f32; 3] {
        let t = k / 100.0;
        let r = if t <= 66.0 { 255.0 } else { 329.699 * (t - 60.0).powf(-0.133_204_76) };
        let g = if t <= 66.0 { 99.470_8 * t.ln() - 161.119_57 } else { 288.122_17 * (t - 60.0).powf(-0.075_514_85) };
        let b = if t >= 66.0 { 255.0 } else if t <= 19.0 { 0.0 } else { 138.517_73 * (t - 10.0).ln() - 305.044_8 };
        [r, g, b].map(|c| (c / 255.0).clamp(0.0, 1.0))
    }
    let (c, white) = (rgb(kelvin.clamp(1000.0, 15000.0)), rgb(6500.0));
    let g = [c[0] / white[0], c[1] / white[1], c[2] / white[2]];
    let top = g.iter().cloned().fold(0.0f32, f32::max).max(1.0);
    g.map(|v| v / top)
}

/// 3 × 256 gamma ramp (R, G, B) for an adjustment.
pub fn ramp(a: &ColorAdjust) -> [[u16; 256]; 3] {
    let gains = temperature_gains(a.temperature);
    let gamma = a.gamma.clamp(0.3, 3.0);
    let contrast = 1.0 + a.contrast.clamp(-50.0, 50.0) / 100.0;
    let brightness = a.brightness.clamp(-50.0, 50.0) / 100.0;
    let mut out = [[0u16; 256]; 3];
    for i in 0..256 {
        let v = (i as f32 / 255.0).powf(1.0 / gamma);
        let v = (v - 0.5) * contrast + 0.5 + brightness;
        for c in 0..3 {
            out[c][i] = ((v * gains[c]).clamp(0.0, 1.0) * 65535.0).round() as u16;
        }
    }
    out
}

fn device_wide(id: &str) -> Vec<u16> {
    id.encode_utf16().chain(Some(0)).collect()
}

pub fn apply(id: &str, a: &ColorAdjust) -> Result<(), String> {
    if !monitors().iter().any(|(_, info)| device_name(info) == id) {
        return Err("Unknown display; refresh the list".into());
    }
    let name = device_wide(id);
    let dc = unsafe { CreateDCW(w!("DISPLAY"), PCWSTR(name.as_ptr()), PCWSTR::null(), None) };
    if dc.is_invalid() {
        return Err("Cannot open the display".into());
    }
    let table = ramp(a);
    let ok = unsafe { SetDeviceGammaRamp(dc, table.as_ptr() as *const c_void) }.as_bool();
    unsafe {
        let _ = DeleteDC(dc);
    }
    if let Some(level) = a.vibrance {
        nv_set_vibrance(id, level)?;
    }
    // Windows refuses ramps it considers too extreme (protection against unreadable screens).
    ok.then_some(()).ok_or_else(|| "Windows rejected this setting as too extreme; try a smaller change".into())
}

pub fn set_hardware(id: &str, brightness: Option<u32>, contrast: Option<u32>) -> Result<(), String> {
    let (h, _) = monitors().into_iter().find(|(_, info)| device_name(info) == id).ok_or("Unknown display; refresh the list")?;
    with_physical(h, |p| unsafe {
        let b = brightness.map_or(true, |v| SetMonitorBrightness(p.hPhysicalMonitor, v) != 0);
        let c = contrast.map_or(true, |v| SetMonitorContrast(p.hPhysicalMonitor, v) != 0);
        Some(b && c)
    })
    .filter(|&ok| ok)
    .map(|_| ())
    .ok_or_else(|| "The monitor did not accept the setting (DDC/CI may be off in its menu)".into())
}

// ---- NVIDIA digital vibrance (NVAPI, loaded from the driver) ----

type NvHandle = *mut c_void;
struct NvApi {
    enum_display: unsafe extern "C" fn(u32, *mut NvHandle) -> i32,
    display_name: unsafe extern "C" fn(NvHandle, *mut [u8; 64]) -> i32,
    get_dvc: unsafe extern "C" fn(NvHandle, u32, *mut DvcInfo) -> i32,
    set_dvc: unsafe extern "C" fn(NvHandle, u32, i32) -> i32,
}

#[repr(C)]
struct DvcInfo {
    version: u32,
    current: i32,
    min: i32,
    max: i32,
}

fn nvapi() -> Option<&'static NvApi> {
    static API: OnceLock<Option<NvApi>> = OnceLock::new();
    API.get_or_init(|| unsafe {
        let lib = LoadLibraryW(w!("nvapi64.dll")).ok()?;
        let qi: unsafe extern "C" fn(u32) -> *const c_void = std::mem::transmute(GetProcAddress(lib, s!("nvapi_QueryInterface"))?);
        let f = |id: u32| Some(qi(id)).filter(|p| !p.is_null());
        let init: unsafe extern "C" fn() -> i32 = std::mem::transmute(f(0x0150_E828)?);
        if init() != 0 {
            return None;
        }
        Some(NvApi {
            enum_display: std::mem::transmute(f(0x9ABD_D40D)?),
            display_name: std::mem::transmute(f(0x22A7_8B05)?),
            get_dvc: std::mem::transmute(f(0x4085_DE45)?),
            set_dvc: std::mem::transmute(f(0x1724_09B4)?),
        })
    })
    .as_ref()
}

/// NVIDIA display handle driving the GDI device `id`.
fn nv_handle(api: &NvApi, id: &str) -> Option<NvHandle> {
    (0..16).map_while(|i| {
        let mut h: NvHandle = std::ptr::null_mut();
        (unsafe { (api.enum_display)(i, &mut h) } == 0).then_some(h)
    })
    .find(|&h| {
        let mut name = [0u8; 64];
        let ok = unsafe { (api.display_name)(h, &mut name) } == 0;
        ok && name.split(|&b| b == 0).next() == Some(id.as_bytes())
    })
}

fn nv_vibrance(id: &str) -> Option<Range> {
    let api = nvapi()?;
    let h = nv_handle(api, id)?;
    let mut info = DvcInfo { version: std::mem::size_of::<DvcInfo>() as u32 | (1 << 16), current: 0, min: 0, max: 0 };
    (unsafe { (api.get_dvc)(h, 0, &mut info) } == 0 && info.max > info.min).then_some(Range { min: info.min, current: info.current, max: info.max })
}

fn nv_set_vibrance(id: &str, level: i32) -> Result<(), String> {
    let api = nvapi().ok_or("Saturation needs an NVIDIA graphics card")?;
    let h = nv_handle(api, id).ok_or("This display is not on the NVIDIA card")?;
    let r = nv_vibrance(id).ok_or("Saturation not available on this display")?;
    let status = unsafe { (api.set_dvc)(h, 0, level.clamp(r.min, r.max)) };
    (status == 0).then_some(()).ok_or_else(|| format!("NVIDIA driver error {status}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    const NEUTRAL: ColorAdjust = ColorAdjust { brightness: 0.0, contrast: 0.0, gamma: 1.0, temperature: 6500.0, vibrance: None };

    #[test]
    fn neutral_ramp_is_identity() {
        let r = ramp(&NEUTRAL);
        for c in 0..3 {
            for i in 0..256 {
                assert!((r[c][i] as i32 - (i as i32 * 257)).abs() <= 1, "channel {c} step {i}: {}", r[c][i]);
            }
        }
    }

    #[test]
    fn warm_lowers_blue_and_keeps_red() {
        let g = temperature_gains(3500.0);
        assert!((g[0] - 1.0).abs() < 1e-3 && g[2] < 0.75, "{g:?}");
        let c = temperature_gains(9000.0);
        assert!((c[2] - 1.0).abs() < 1e-3 && c[0] < 0.95, "{c:?}");
    }

    #[test]
    fn ramps_stay_monotonic() {
        let a = ColorAdjust { brightness: 20.0, contrast: 30.0, gamma: 1.4, temperature: 4500.0, vibrance: None };
        for ch in ramp(&a) {
            assert!(ch.windows(2).all(|w| w[0] <= w[1]));
        }
    }

    /// Visible on real screens for 1.5 s, then back to neutral: `cargo test display_roundtrip -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn display_roundtrip() {
        for d in list() {
            let warm = ColorAdjust { temperature: 4500.0, vibrance: d.vibrance.map(|v| v.current + 20), ..NEUTRAL };
            println!("{} warm: {:?}", d.id, apply(&d.id, &warm));
            std::thread::sleep(std::time::Duration::from_millis(1500));
            let back = ColorAdjust { vibrance: d.vibrance.map(|v| v.current), ..NEUTRAL };
            println!("{} back: {:?}", d.id, apply(&d.id, &back));
        }
    }

    /// Read-only: `cargo test display_probe -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn display_probe() {
        for d in list() {
            println!("{d:?}");
        }
    }
}
