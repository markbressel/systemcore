//! RGB lighting control without vendor software:
//! - Windows Dynamic Lighting (HID LampArray standard, Windows 11): any device that implements it.
//! - Logitech HID++ 2.0 "Color LED effects" (0x8070) over USB: G-series mice and keyboards.
//! - VIA raw HID (QMK keyboards: Keychron, GMMK, ...): RGB matrix / RGB light channels.
//! - RAM on the motherboard SMBus (ENE controllers: T-Force, Trident Z, ...) through PawnIO; needs an elevated app.
//! Every device is probed with read-only queries first; colors are only written to devices that answered.

use hidapi::{HidApi, HidDevice};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use windows::Devices::Enumeration::DeviceInformation;
use windows::Devices::Lights::{LampArray, LampArrayKind};
use windows::UI::Color;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RgbDevice {
    /// "dl:<device id>" or "logi:<hid path>".
    pub id: String,
    pub name: String,
    /// keyboard, mouse, motherboard, case, gpu, ram, fan, strip, other
    pub kind: &'static str,
    /// "Dynamic Lighting" or "Logitech HID++"
    pub backend: &'static str,
    pub zones: u32,
    /// false: Windows gives control to another app right now (Dynamic Lighting only lets the foreground app drive lights).
    pub available: bool,
}

/// Writes one static color to every LED of a found device. Built by a vendor module's `detect`.
pub type Apply = Box<dyn Fn([u8; 3]) -> Result<(), String> + Send>;

/// A lighting device found by a vendor module (razer.rs; one file per vendor family).
pub struct Found {
    /// Unique and stable for this device, prefixed with the module, e.g. "razer:<hid path>".
    pub id: String,
    pub name: String,
    /// keyboard, mouse, mousepad, headset, keypad, speaker, motherboard, ram, gpu, fan, strip, cooler, case, other
    pub kind: &'static str,
    /// Shown to the user, e.g. "Razer Chroma (USB)".
    pub backend: &'static str,
    pub zones: u32,
    pub apply: Apply,
}

struct Logi {
    path: std::ffi::CString,
    /// HID++ device index: 0xFF wired, 1–6 behind a Lightspeed/Unifying receiver.
    index: u8,
    feature: u8,
    /// (zone index, index of the zone's "fixed color" effect)
    zones: Vec<(u8, u8)>,
}

#[derive(Default)]
struct State {
    // Dynamic Lighting only holds the color while the LampArray object is alive.
    lamps: HashMap<String, LampArray>,
    logi: HashMap<String, Logi>,
    /// VIA keyboards: hid path + lighting channel (3 = RGB matrix, 2 = RGB light).
    via: HashMap<String, (std::ffi::CString, u8)>,
    /// All RAM controllers found on the SMBus; they act as one device (every module gets the same color).
    ram: Vec<super::ene::Controller>,
    /// Devices from the vendor modules, by id.
    vendor: HashMap<String, Apply>,
}

const RAM_ID: &str = "ram:smbus";

fn state() -> &'static Mutex<State> {
    static S: OnceLock<Mutex<State>> = OnceLock::new();
    S.get_or_init(Default::default)
}

pub fn list() -> Vec<RgbDevice> {
    let mut out = Vec::new();
    let mut st = state().lock().unwrap_or_else(|e| e.into_inner());
    if let Err(e) = list_dynamic_lighting(&mut st, &mut out) {
        eprintln!("dynamic lighting: {e}");
    }
    list_logitech(&mut st, &mut out);
    list_via(&mut st, &mut out);
    list_vendor_modules(&mut st, &mut out);
    st.ram = super::ene::detect();
    if let Some(first) = st.ram.first() {
        out.push(RgbDevice {
            id: RAM_ID.into(),
            name: first.name.clone(),
            kind: "ram",
            backend: "SMBus (PawnIO)",
            zones: st.ram.len() as u32,
            available: true,
        });
    }
    // G HUB also exposes its devices to Dynamic Lighting (a virtual HID device): keep only the direct HID++ entry.
    let direct: Vec<String> = out.iter().filter(|d| d.backend != "Dynamic Lighting").map(|d| d.name.to_lowercase()).collect();
    out.retain(|d| d.backend != "Dynamic Lighting" || !direct.iter().any(|n| n.starts_with(&d.name.to_lowercase())));
    out
}

pub fn set_color(id: &str, [r, g, b]: [u8; 3]) -> Result<(), String> {
    let st = state().lock().unwrap_or_else(|e| e.into_inner());
    if let Some(arr) = st.lamps.get(id) {
        return arr.SetColor(Color { A: 255, R: r, G: g, B: b }).map_err(|e| e.message().to_string());
    }
    if let Some(l) = st.logi.get(id) {
        let api = HidApi::new().map_err(|e| e.to_string())?;
        let dev = api.open_path(&l.path).map_err(|e| e.to_string())?;
        for &(zone, effect) in &l.zones {
            // setZoneEffect: zone, effect index, R, G, B, 7 unused effect bytes, then 0x01 = apply now (not saved to onboard memory).
            let mut p = [0u8; 13];
            p[..5].copy_from_slice(&[zone, effect, r, g, b]);
            p[12] = 0x01;
            hidpp(&dev, l.index, l.feature, 3, &p)?;
        }
        return Ok(());
    }
    if let Some(apply) = st.vendor.get(id) {
        return apply([r, g, b]);
    }
    if id == RAM_ID && !st.ram.is_empty() {
        return st.ram.iter().try_for_each(|c| super::ene::set_color(c, [r, g, b]));
    }
    if let Some((path, channel)) = st.via.get(id) {
        let api = HidApi::new().map_err(|e| e.to_string())?;
        let dev = api.open_path(path).map_err(|e| e.to_string())?;
        let (h, s, v) = hsv(r, g, b);
        // Solid color effect, then hue/saturation and brightness. Not saved to the keyboard's EEPROM.
        via(&dev, &[VIA_SET, *channel, VIA_EFFECT, 1])?;
        via(&dev, &[VIA_SET, *channel, VIA_COLOR, h, s])?;
        via(&dev, &[VIA_SET, *channel, VIA_BRIGHTNESS, v])?;
        return Ok(());
    }
    Err("Unknown device; refresh the list".into())
}

// ---- vendor modules ----

fn list_vendor_modules(st: &mut State, out: &mut Vec<RgbDevice>) {
    let mut found = Vec::new();
    if let Ok(api) = HidApi::new() {
        found.extend(super::razer::detect(&api));
    }
    st.vendor.clear();
    for f in found {
        if st.vendor.contains_key(&f.id) {
            continue;
        }
        out.push(RgbDevice { id: f.id.clone(), name: f.name, kind: f.kind, backend: f.backend, zones: f.zones, available: true });
        st.vendor.insert(f.id, f.apply);
    }
}

// ---- Dynamic Lighting ----

fn list_dynamic_lighting(st: &mut State, out: &mut Vec<RgbDevice>) -> windows::core::Result<()> {
    let infos = DeviceInformation::FindAllAsyncAqsFilter(&LampArray::GetDeviceSelector()?)?.join()?;
    for info in &infos {
        let key = format!("dl:{}", info.Id()?);
        let arr = match st.lamps.get(&key) {
            Some(a) => a.clone(),
            None => {
                let a = LampArray::FromIdAsync(&info.Id()?)?.join()?;
                st.lamps.insert(key.clone(), a.clone());
                a
            }
        };
        let kind = arr.LampArrayKind()?;
        out.push(RgbDevice {
            id: key,
            name: info.Name()?.to_string(),
            kind: match kind {
                k if k == LampArrayKind::Keyboard => "keyboard",
                k if k == LampArrayKind::Mouse => "mouse",
                k if k == LampArrayKind::Chassis => "case",
                _ => "other",
            },
            backend: "Dynamic Lighting",
            zones: arr.LampCount()? as u32,
            available: arr.IsAvailable()?,
        });
    }
    Ok(())
}

// ---- Logitech HID++ 2.0 ----

const LOGITECH: u16 = 0x046D;
const LONG_REPORT: u8 = 0x11;
const WIRED: u8 = 0xFF;
const SW_ID: u8 = 0x0A;

/// One HID++ 2.0 request to device `index`; returns the 16 parameter bytes of the matching response.
/// Bounded to ~600 ms so a sleeping wireless device cannot stall the scan.
fn hidpp(dev: &HidDevice, index: u8, feature: u8, function: u8, params: &[u8]) -> Result<[u8; 16], String> {
    let mut msg = [0u8; 20];
    msg[..4].copy_from_slice(&[LONG_REPORT, index, feature, (function << 4) | SW_ID]);
    msg[4..4 + params.len()].copy_from_slice(params);
    dev.write(&msg).map_err(|e| e.to_string())?;
    let mut buf = [0u8; 20];
    let deadline = std::time::Instant::now() + std::time::Duration::from_millis(600);
    while let Some(left) = deadline.checked_duration_since(std::time::Instant::now()) {
        let n = dev.read_timeout(&mut buf, left.as_millis().max(1) as i32).map_err(|e| e.to_string())?;
        // Other devices behind the same receiver report too: only our index counts.
        if n < 4 || buf[1] != index {
            continue;
        }
        // HID++ 2.0 error: [0x11, dev, 0xFF, feature, fn|sw, code]; HID++ 1.0 error: [0x10, dev, 0x8F, ...].
        if (buf[2] == 0xFF && buf[3] == feature) || buf[2] == 0x8F {
            return Err(format!("device error 0x{:02x}", buf[5]));
        }
        if buf[0] == LONG_REPORT && buf[2] == feature && buf[3] == msg[3] {
            let mut p = [0u8; 16];
            p.copy_from_slice(&buf[4..20]);
            return Ok(p);
        }
    }
    Err("no answer".into())
}

fn feature_index(dev: &HidDevice, index: u8, id: u16) -> Option<u8> {
    hidpp(dev, index, 0, 0, &id.to_be_bytes()).ok().map(|p| p[0]).filter(|&i| i != 0)
}

fn device_kind(dev: &HidDevice, index: u8) -> &'static str {
    // 0x0005 Device name & type, getDeviceType.
    let t = feature_index(dev, index, 0x0005).and_then(|f| hidpp(dev, index, f, 2, &[]).ok()).map(|p| p[0]);
    match t {
        Some(0) | Some(2) => "keyboard",
        Some(3..=5) => "mouse",
        Some(8) => "headset",
        _ => "other",
    }
}

/// Device name through 0x0005 (getDeviceNameCount, then getDeviceName in chunks). Wireless devices only show
/// the receiver's name in USB, so this is how "G502 LIGHTSPEED" gets its own name.
fn device_name(dev: &HidDevice, index: u8) -> Option<String> {
    let f = feature_index(dev, index, 0x0005)?;
    let len = hidpp(dev, index, f, 0, &[]).ok()?[0] as usize;
    let mut name = Vec::new();
    while name.len() < len {
        let chunk = hidpp(dev, index, f, 1, &[name.len() as u8]).ok()?;
        let take = chunk.iter().take(len - name.len()).take_while(|&&b| b != 0).copied().collect::<Vec<_>>();
        if take.is_empty() {
            break;
        }
        name.extend(take);
    }
    String::from_utf8(name).ok().filter(|n| !n.is_empty())
}

fn probe_logitech(dev: &HidDevice, index: u8) -> Option<(u8, Vec<(u8, u8)>)> {
    let f = feature_index(dev, index, 0x8070)?;
    let zone_count = hidpp(dev, index, f, 0, &[]).ok()?[0];
    let mut zones = Vec::new();
    for zone in 0..zone_count {
        // getZoneInfo → [zone, location(2), effect count, ...]
        let effects = hidpp(dev, index, f, 1, &[zone]).ok()?[3];
        // getZoneEffectInfo → [zone, effect index, effect id(2), ...]; id 0x0001 is a fixed color.
        let fixed = (0..effects).find(|&e| hidpp(dev, index, f, 2, &[zone, e]).is_ok_and(|p| p[2] == 0x00 && p[3] == 0x01));
        if let Some(e) = fixed {
            zones.push((zone, e));
        }
    }
    (!zones.is_empty()).then_some((f, zones))
}

fn list_logitech(st: &mut State, out: &mut Vec<RgbDevice>) {
    let Ok(api) = HidApi::new() else { return };
    // HID++ long reports live on the vendor collection (usage page 0xFF00, usage 0x0002).
    for info in api.device_list().filter(|d| d.vendor_id() == LOGITECH && d.usage_page() == 0xFF00 && d.usage() == 0x0002) {
        let Ok(dev) = info.open_device(&api) else { continue };
        // A wired device answers as 0xFF; a Lightspeed/Unifying receiver forwards to paired devices 1–6.
        let receiver = info.product_string().is_some_and(|p| p.to_lowercase().contains("receiver"));
        let indexes: &[u8] = if receiver { &[1, 2, 3, 4, 5, 6] } else { &[WIRED] };
        for &index in indexes {
            let key = format!("logi:{}#{index}", info.path().to_string_lossy());
            if !st.logi.contains_key(&key) {
                let Some((feature, zones)) = probe_logitech(&dev, index) else { continue };
                st.logi.insert(key.clone(), Logi { path: info.path().to_owned(), index, feature, zones });
            }
            let l = &st.logi[&key];
            let usb_name = info.product_string().unwrap_or("Logitech device").to_string();
            out.push(RgbDevice {
                id: key.clone(),
                name: if receiver { device_name(&dev, index).unwrap_or(usb_name) } else { usb_name },
                kind: device_kind(&dev, index),
                backend: if receiver { "Logitech HID++ (wireless)" } else { "Logitech HID++" },
                zones: l.zones.len() as u32,
                available: true,
            });
        }
    }
}

// ---- VIA (QMK raw HID) ----

const VIA_SET: u8 = 0x07;
const VIA_GET: u8 = 0x08;
const VIA_BRIGHTNESS: u8 = 1;
const VIA_EFFECT: u8 = 2;
const VIA_COLOR: u8 = 4;

/// One 32-byte VIA command; returns the echoed reply. 0xFF in the first byte means "not handled by this firmware".
fn via(dev: &HidDevice, cmd: &[u8]) -> Result<[u8; 32], String> {
    let mut msg = [0u8; 33]; // report id 0 + 32 bytes
    msg[1..1 + cmd.len()].copy_from_slice(cmd);
    dev.write(&msg).map_err(|e| e.to_string())?;
    let mut buf = [0u8; 32];
    let n = dev.read_timeout(&mut buf, 300).map_err(|e| e.to_string())?;
    if n == 0 {
        return Err("no answer".into());
    }
    if buf[0] == 0xFF {
        return Err("not supported by the keyboard firmware".into());
    }
    Ok(buf)
}

/// QMK HSV: all three channels 0–255.
fn hsv(r: u8, g: u8, b: u8) -> (u8, u8, u8) {
    let (rf, gf, bf) = (r as f32 / 255.0, g as f32 / 255.0, b as f32 / 255.0);
    let max = rf.max(gf).max(bf);
    let d = max - rf.min(gf).min(bf);
    let h = if d == 0.0 {
        0.0
    } else if max == rf {
        ((gf - bf) / d).rem_euclid(6.0)
    } else if max == gf {
        (bf - rf) / d + 2.0
    } else {
        (rf - gf) / d + 4.0
    } / 6.0;
    let s = if max == 0.0 { 0.0 } else { d / max };
    ((h * 255.0).round() as u8, (s * 255.0).round() as u8, (max * 255.0).round() as u8)
}

fn list_via(st: &mut State, out: &mut Vec<RgbDevice>) {
    let Ok(api) = HidApi::new() else { return };
    for info in api.device_list().filter(|d| d.usage_page() == 0xFF60 && d.usage() == 0x61) {
        let key = format!("via:{}", info.path().to_string_lossy());
        if !st.via.contains_key(&key) {
            let Ok(dev) = info.open_device(&api) else { continue };
            // Read-only probe: which lighting channel answers an effect query.
            let Some(channel) = [3u8, 2].into_iter().find(|&c| via(&dev, &[VIA_GET, c, VIA_EFFECT]).is_ok()) else { continue };
            st.via.insert(key.clone(), (info.path().to_owned(), channel));
        }
        out.push(RgbDevice {
            id: key,
            name: info.product_string().filter(|s| !s.is_empty()).unwrap_or("Keyboard").to_string(),
            kind: "keyboard",
            backend: "VIA (QMK)",
            zones: 1,
            available: true,
        });
    }
}

/// Manual probe on real hardware: `cargo test lights_probe -- --ignored --nocapture`.
#[cfg(test)]
mod tests {
    #[test]
    #[ignore]
    fn lights_probe() {
        for d in super::list() {
            println!("{d:?}");
        }
    }

    #[test]
    fn hsv_matches_qmk_scale() {
        assert_eq!(super::hsv(255, 0, 0), (0, 255, 255));
        assert_eq!(super::hsv(0, 255, 0), (85, 255, 255));
        assert_eq!(super::hsv(0, 0, 255), (170, 255, 255));
        assert_eq!(super::hsv(255, 255, 255), (0, 0, 255));
        assert_eq!(super::hsv(0, 0, 0), (0, 0, 0));
    }

    #[test]
    #[ignore]
    fn hid_dump() {
        let api = hidapi::HidApi::new().unwrap();
        for d in api.device_list() {
            println!("{:04x}:{:04x} page {:04x} usage {:04x} if {} {:?} {:?}", d.vendor_id(), d.product_id(), d.usage_page(), d.usage(), d.interface_number(), d.manufacturer_string(), d.product_string());
        }
    }

    /// `RGB=00ff00 cargo test lights_set -- --ignored --nocapture`: paints every found device.
    #[test]
    #[ignore]
    fn lights_set() {
        let hex = std::env::var("RGB").unwrap_or("00ff00".into());
        let c = u32::from_str_radix(&hex, 16).unwrap().to_be_bytes();
        for d in super::list() {
            println!("{} -> {:?}", d.name, super::set_color(&d.id, [c[1], c[2], c[3]]));
        }
    }
}
