//! Razer Chroma USB devices (keyboards, mice, mouse pads, keypads, docks).
//! Protocol as documented by the openrazer/OpenRGB projects; own implementation.

use std::{collections::BTreeMap, ffi::CString, thread::sleep, time::Duration};

use hidapi::{HidApi, HidDevice};
use super::lights::Found;

const RAZER: u16 = 0x1532;

/// Extended matrix devices take effect command 0x0F/0x02 per LED id; older "standard" ones take 0x03/0x0A for the whole matrix.
#[derive(Clone, Copy, PartialEq, Debug)]
enum Proto {
    Ext,
    Std,
}
use Proto::{Ext, Std};

/// PID, model, kind, protocol. Unknown PIDs are never touched. Kraken headsets/Nommo speakers use other protocols and are left out.
const DEVICES: &[(u16, &str, &str, Proto)] = &[
    // keyboards
    (0x0221, "Razer BlackWidow Chroma V2", "keyboard", Std),
    (0x0228, "Razer BlackWidow Elite", "keyboard", Ext),
    (0x0241, "Razer BlackWidow 2019", "keyboard", Ext),
    (0x024E, "Razer BlackWidow V3", "keyboard", Ext),
    (0x025A, "Razer BlackWidow V3 Pro", "keyboard", Ext),
    (0x025C, "Razer BlackWidow V3 Pro (wireless)", "keyboard", Ext),
    (0x0A24, "Razer BlackWidow V3 TKL", "keyboard", Ext),
    (0x0258, "Razer BlackWidow V3 Mini HyperSpeed", "keyboard", Ext),
    (0x0271, "Razer BlackWidow V3 Mini HyperSpeed (wireless)", "keyboard", Ext),
    (0x0287, "Razer BlackWidow V4", "keyboard", Ext),
    (0x028D, "Razer BlackWidow V4 Pro", "keyboard", Ext),
    (0x0293, "Razer BlackWidow V4 X", "keyboard", Ext),
    (0x02A5, "Razer BlackWidow V4 75%", "keyboard", Ext),
    (0x0226, "Razer Huntsman Elite", "keyboard", Ext),
    (0x0227, "Razer Huntsman", "keyboard", Ext),
    (0x0243, "Razer Huntsman Tournament Edition", "keyboard", Ext),
    (0x0257, "Razer Huntsman Mini", "keyboard", Ext),
    (0x0282, "Razer Huntsman Mini Analog", "keyboard", Ext),
    (0x0266, "Razer Huntsman V2 Analog", "keyboard", Ext),
    (0x026B, "Razer Huntsman V2 TKL", "keyboard", Ext),
    (0x026C, "Razer Huntsman V2", "keyboard", Ext),
    (0x02A6, "Razer Huntsman V3 Pro", "keyboard", Ext),
    (0x02A7, "Razer Huntsman V3 Pro TKL", "keyboard", Ext),
    (0x02B0, "Razer Huntsman V3 Pro Mini", "keyboard", Ext),
    (0x025D, "Razer Ornata V2", "keyboard", Ext),
    (0x028F, "Razer Ornata V3", "keyboard", Ext),
    (0x02A1, "Razer Ornata V3", "keyboard", Ext),
    (0x0294, "Razer Ornata V3 X", "keyboard", Ext),
    (0x02A2, "Razer Ornata V3 X", "keyboard", Ext),
    (0x02A3, "Razer Ornata V3 TKL", "keyboard", Ext),
    (0x022A, "Razer Cynosa Chroma", "keyboard", Std),
    (0x025E, "Razer Cynosa V2", "keyboard", Ext),
    // keypads
    (0x0208, "Razer Tartarus Chroma", "keypad", Std),
    (0x022B, "Razer Tartarus V2", "keypad", Ext),
    (0x0244, "Razer Tartarus Pro", "keypad", Ext),
    // mice
    (0x0084, "Razer DeathAdder V2", "mouse", Ext),
    (0x007C, "Razer DeathAdder V2 Pro", "mouse", Ext),
    (0x007D, "Razer DeathAdder V2 Pro (wireless)", "mouse", Ext),
    (0x008C, "Razer DeathAdder V2 Mini", "mouse", Ext),
    (0x0064, "Razer Basilisk", "mouse", Ext),
    (0x0085, "Razer Basilisk V2", "mouse", Ext),
    (0x0099, "Razer Basilisk V3", "mouse", Ext),
    (0x00CB, "Razer Basilisk V3 35K", "mouse", Ext),
    (0x00AA, "Razer Basilisk V3 Pro", "mouse", Ext),
    (0x00AB, "Razer Basilisk V3 Pro (wireless)", "mouse", Ext),
    (0x00B9, "Razer Basilisk V3 X HyperSpeed", "mouse", Ext),
    (0x0086, "Razer Basilisk Ultimate", "mouse", Ext),
    (0x0088, "Razer Basilisk Ultimate (wireless)", "mouse", Ext),
    (0x0078, "Razer Viper", "mouse", Ext),
    (0x008A, "Razer Viper Mini", "mouse", Ext),
    (0x007A, "Razer Viper Ultimate", "mouse", Ext),
    (0x007B, "Razer Viper Ultimate (wireless)", "mouse", Ext),
    (0x0091, "Razer Viper 8KHz", "mouse", Ext),
    (0x0067, "Razer Naga Trinity", "mouse", Ext),
    (0x008D, "Razer Naga Left-Handed Edition", "mouse", Ext),
    (0x008F, "Razer Naga Pro", "mouse", Ext),
    (0x0090, "Razer Naga Pro (wireless)", "mouse", Ext),
    (0x0096, "Razer Naga X", "mouse", Ext),
    (0x00A7, "Razer Naga V2 Pro", "mouse", Ext),
    (0x00A8, "Razer Naga V2 Pro (wireless)", "mouse", Ext),
    (0x00A3, "Razer Cobra", "mouse", Ext),
    (0x00AF, "Razer Cobra Pro", "mouse", Ext),
    (0x00B0, "Razer Cobra Pro (wireless)", "mouse", Ext),
    (0x006C, "Razer Mamba Elite", "mouse", Ext),
    // mouse pads
    (0x0C01, "Razer Goliathus Chroma", "mousepad", Ext),
    (0x0C02, "Razer Goliathus Extended Chroma", "mousepad", Ext),
    (0x0C06, "Razer Goliathus Chroma 3XL", "mousepad", Ext),
    (0x0C04, "Razer Firefly V2", "mousepad", Ext),
    (0x0C08, "Razer Firefly V2 Pro", "mousepad", Ext),
    (0x0C05, "Razer Strider Chroma", "mousepad", Ext),
    // docks / stands
    (0x0F20, "Razer Base Station V2 Chroma", "other", Ext),
    (0x007E, "Razer Mouse Dock Chroma", "other", Ext),
    (0x00A4, "Razer Mouse Dock Pro", "other", Ext),
];

/// LED ids: zero (whole device on most extended devices), scroll wheel, logo, backlight. Ids a device lacks are answered "not supported".
const LEDS: [u8; 4] = [0x00, 0x01, 0x04, 0x05];

/// Razer 90-byte report: status, transaction id, remaining packets (2), protocol, data size, class, id, 80 args, CRC, reserved.
fn build_report(tid: u8, class: u8, id: u8, args: &[u8]) -> [u8; 90] {
    let mut r = [0u8; 90];
    r[1] = tid;
    r[5] = args.len() as u8;
    r[6] = class;
    r[7] = id;
    r[8..8 + args.len()].copy_from_slice(args);
    r[88] = r[2..88].iter().fold(0, |a, b| a ^ b);
    r
}

/// Static color effect. Storage byte 0x00 = not saved to onboard memory.
fn static_report(tid: u8, proto: Proto, led: u8, [r, g, b]: [u8; 3]) -> [u8; 90] {
    match proto {
        Ext => build_report(tid, 0x0F, 0x02, &[0x00, led, 0x01, 0x00, 0x00, 0x01, r, g, b]),
        Std => build_report(tid, 0x03, 0x0A, &[0x06, r, g, b]),
    }
}

/// Sends one report as feature report 0 and waits (bounded) for the device's status.
fn send(dev: &HidDevice, report: &[u8; 90]) -> Result<(), String> {
    let mut buf = [0u8; 91];
    buf[1..].copy_from_slice(report);
    dev.send_feature_report(&buf).map_err(|e| e.to_string())?;
    for _ in 0..10 {
        sleep(Duration::from_millis(2));
        let mut resp = [0u8; 91];
        let n = dev.get_feature_report(&mut resp).map_err(|e| e.to_string())?;
        let r = &resp[1..];
        if n < 90 || r[1] != report[1] || r[6] != report[6] || r[7] != report[7] {
            continue;
        }
        // 0x01 busy, 0x02 ok, 0x03 failed, 0x04 timeout, 0x05 not supported
        match r[0] {
            0x01 => continue,
            0x02 => return Ok(()),
            s => return Err(format!("device status 0x{s:02x}")),
        }
    }
    Err("no answer".into())
}

/// One key per physical interface: Windows gives each collection its own path ("...&colNN#<instance>&<collection index>#...").
fn device_key(path: &str) -> String {
    let p = path.to_lowercase();
    let mut parts: Vec<String> = p.split('#').map(String::from).collect();
    if parts.len() >= 3 && parts[1].contains("&col") {
        parts[1] = parts[1].split("&col").next().unwrap_or_default().to_string();
        parts[2] = parts[2].rsplit_once('&').map_or(parts[2].clone(), |(a, _)| a.to_string());
    }
    parts.join("#")
}

fn make_apply(paths: Vec<CString>, proto: Proto) -> super::lights::Apply {
    // The transaction id differs per model (0xFF older, 0x1F/0x3F newer); a wrong one is just rejected, so try them in turn.
    let tids: [u8; 3] = if proto == Std { [0xFF, 0x1F, 0x3F] } else { [0x1F, 0x3F, 0xFF] };
    let leds: &'static [u8] = if proto == Std { &LEDS[..1] } else { &LEDS };
    Box::new(move |rgb| {
        let api = HidApi::new().map_err(|e| e.to_string())?;
        let mut last = "control interface not found".to_string();
        for path in &paths {
            let Ok(dev) = api.open_path(path) else { continue };
            for &tid in &tids {
                let ok = leds.iter().filter(|&&led| send(&dev, &static_report(tid, proto, led, rgb)).map_err(|e| last = e).is_ok()).count();
                if ok > 0 {
                    return Ok(());
                }
            }
        }
        Err(last)
    })
}

/// Read-only detection; returns one `Found` per controllable device.
pub fn detect(api: &HidApi) -> Vec<Found> {
    // key -> (table entry, (priority, path) of each collection on the control interface)
    let mut groups: BTreeMap<String, (usize, Vec<(u8, CString)>)> = BTreeMap::new();
    for d in api.device_list().filter(|d| d.vendor_id() == RAZER && matches!(d.interface_number(), 0 | -1)) {
        let Some(idx) = DEVICES.iter().position(|e| e.0 == d.product_id()) else { continue };
        // The control report usually sits on the generic-desktop mouse collection; try that one first.
        let prio = if (d.usage_page(), d.usage()) == (0x01, 0x02) { 0 } else { 1 };
        let key = device_key(&d.path().to_string_lossy());
        groups.entry(key).or_insert((idx, Vec::new())).1.push((prio, d.path().to_owned()));
    }
    groups
        .into_iter()
        .map(|(key, (idx, mut paths))| {
            let (_, name, kind, proto) = DEVICES[idx];
            paths.sort();
            Found {
                id: format!("razer:{key}"),
                name: name.into(),
                kind,
                backend: "Razer Chroma (USB)",
                zones: 1,
                apply: make_apply(paths.into_iter().map(|p| p.1).collect(), proto),
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extended_static_layout_and_crc() {
        let r = static_report(0x1F, Ext, 0x05, [0x12, 0x34, 0x56]);
        assert_eq!(&r[..17], &[0x00, 0x1F, 0, 0, 0, 0x09, 0x0F, 0x02, 0x00, 0x05, 0x01, 0, 0, 0x01, 0x12, 0x34, 0x56]);
        assert!(r[17..88].iter().all(|&b| b == 0));
        // XOR of bytes 2..88: 09^0F^02^05^01^01^12^34^56
        assert_eq!(r[88], 0x71);
        assert_eq!(r[89], 0);
    }

    #[test]
    fn standard_static_layout_and_crc() {
        let r = static_report(0xFF, Std, 0, [0xFF, 0x00, 0x80]);
        assert_eq!(&r[..12], &[0x00, 0xFF, 0, 0, 0, 0x04, 0x03, 0x0A, 0x06, 0xFF, 0x00, 0x80]);
        assert_eq!(r[88], 0x04 ^ 0x03 ^ 0x0A ^ 0x06 ^ 0xFF ^ 0x80);
    }

    #[test]
    fn collections_of_one_device_share_a_key() {
        let a = r"\\?\HID#VID_1532&PID_0084&MI_00&Col01#7&1a&0&0000#{4d1e55b2}";
        let b = r"\\?\HID#VID_1532&PID_0084&MI_00&Col03#7&1a&0&0002#{4d1e55b2}";
        assert_eq!(device_key(a), r"\\?\hid#vid_1532&pid_0084&mi_00#7&1a&0#{4d1e55b2}");
        assert_eq!(device_key(a), device_key(b));
        let other = r"\\?\HID#VID_1532&PID_0084&MI_00&Col01#7&2b&0&0000#{4d1e55b2}";
        assert_ne!(device_key(a), device_key(other));
        let single = r"\\?\HID#VID_1532&PID_0C04#6&9&0&0000#{4d1e55b2}";
        assert_eq!(device_key(single), single.to_lowercase());
    }

    #[test]
    fn table_has_unique_pids() {
        let mut p: Vec<u16> = DEVICES.iter().map(|d| d.0).collect();
        p.sort();
        p.dedup();
        assert_eq!(p.len(), DEVICES.len());
    }
}
