//! Gigabyte / AORUS RGB Fusion 2 over USB (the ITE IT5702 / IT8297 / IT5711 LED controller on Gigabyte
//! motherboards since about 2018). Covers the board's LEDs and its RGB/ARGB headers, so fans, coolers and strips
//! plugged into them (Deepcool and others) follow too. Protocol as documented by the OpenRGB project;
//! own implementation.
//!
//! Safety rules:
//! - Detection only asks for the controller's info report (feature report 0x60).
//! - A color write is one "static effect on all zones" packet plus "apply". Nothing is saved to flash (no 0x5E),
//!   and calibration, LED counts and the strip layout are never written.

use std::ffi::CString;

use hidapi::{HidApi, HidDevice};
use super::lights::Found;

const VID: u16 = 0x048D;
const PIDS: [u16; 3] = [0x5702, 0x8297, 0x5711];
/// The lighting interface: vendor usage page 0xFF89, usage 0xCC.
const USAGE_PAGE: u16 = 0xFF89;
const USAGE: u16 = 0xCC;
const REPORT: u8 = 0xCC;

const CMD_INFO: u8 = 0x60;
const CMD_APPLY: u8 = 0x28;
/// Music ("beat") sync: off, so the static color is not overridden by it.
const CMD_BEAT: u8 = 0x31;
/// Windows Dynamic Lighting (LampArray) mode, on newer firmware: off while SystemCore drives the board.
const CMD_LAMP_ARRAY: u8 = 0x48;
const EFFECT_STATIC: u8 = 1;

/// Every zone at once: 8 on IT5702/IT8297, 11 on IT5711.
fn all_zones(pid: u16) -> u32 {
    if pid == 0x5711 { 0x07FF } else { 0xFF }
}

fn cc(a: u8, b: u8) -> [u8; 64] {
    let mut buf = [0u8; 64];
    (buf[0], buf[1], buf[2]) = (REPORT, a, b);
    buf
}

/// Static effect on the zones in `mask`, full brightness. Colors are stored blue, green, red.
fn static_effect(mask: u32, [r, g, b]: [u8; 3]) -> [u8; 64] {
    let mut buf = cc(0x20, 0);
    buf[2..6].copy_from_slice(&mask.to_le_bytes());
    buf[11] = EFFECT_STATIC;
    buf[12] = 0xFF; // max brightness
    buf[13] = 0x00; // min brightness
    buf[14..18].copy_from_slice(&[b, g, r, 0]);
    buf
}

fn apply_effect(mask: u32) -> [u8; 64] {
    let mut buf = cc(CMD_APPLY, 0);
    buf[2..6].copy_from_slice(&mask.to_le_bytes());
    buf
}

/// Asks for the info report; Some(whether the firmware has a LampArray mode) when the controller answered.
/// Supported-command flags sit at byte 11 (bit 1 = LampArray).
fn probe(dev: &HidDevice) -> Option<bool> {
    dev.send_feature_report(&cc(CMD_INFO, 0)).ok()?;
    let mut buf = [0u8; 64];
    buf[0] = REPORT;
    let n = dev.get_feature_report(&mut buf).ok()?;
    if n < 64 || buf[0] != REPORT {
        return None;
    }
    Some(buf[11] & 0x02 != 0)
}

fn make_apply(path: CString, pid: u16, lamp_array: bool) -> super::lights::Apply {
    Box::new(move |rgb| {
        let api = HidApi::new().map_err(|e| e.to_string())?;
        let dev = api.open_path(&path).map_err(|e| e.to_string())?;
        let send = |buf: &[u8; 64]| dev.send_feature_report(buf).map_err(|e| e.to_string());
        if lamp_array {
            send(&cc(CMD_LAMP_ARRAY, 0))?;
        }
        send(&cc(CMD_BEAT, 0))?;
        send(&static_effect(all_zones(pid), rgb))?;
        send(&apply_effect(all_zones(pid)))
    })
}

/// Read-only detection; one `Found` per RGB Fusion 2 controller that returned its info report.
pub fn detect(api: &HidApi, board: &str) -> Vec<Found> {
    api.device_list()
        .filter(|d| d.vendor_id() == VID && PIDS.contains(&d.product_id()) && d.usage_page() == USAGE_PAGE && d.usage() == USAGE)
        .filter_map(|d| {
            let lamp_array = probe(&d.open_device(api).ok()?)?;
            Some(Found {
                id: format!("gigabyte:{}", d.path().to_string_lossy()),
                name: format!("{board} (RGB Fusion 2)"),
                kind: "motherboard",
                backend: "Gigabyte RGB Fusion 2 (USB)",
                zones: all_zones(d.product_id()).count_ones(),
                apply: make_apply(d.path().to_owned(), d.product_id(), lamp_array),
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn static_effect_layout() {
        let p = static_effect(0xFF, [0x11, 0x22, 0x33]);
        assert_eq!(&p[..18], &[0xCC, 0x20, 0xFF, 0, 0, 0, 0, 0, 0, 0, 0, 0x01, 0xFF, 0x00, 0x33, 0x22, 0x11, 0x00]);
        assert!(p[18..].iter().all(|&b| b == 0));
        assert_eq!(&static_effect(all_zones(0x5711), [0; 3])[2..6], &[0xFF, 0x07, 0, 0]);
    }

    #[test]
    fn apply_and_commands() {
        assert_eq!(&apply_effect(0xFF)[..6], &[0xCC, 0x28, 0xFF, 0, 0, 0]);
        assert_eq!(&cc(CMD_BEAT, 0)[..3], &[0xCC, 0x31, 0x00]);
        assert_eq!(all_zones(0x5702).count_ones(), 8);
        assert_eq!(all_zones(0x5711).count_ones(), 11);
    }
}
