//! ASRock Polychrome RGB over USB (the LED controller on ASRock motherboards since about 2020: B550, X570,
//! 600/700/800 series, DeskMini). Covers the board's own LEDs and its RGB/ARGB headers, so fans, coolers and
//! strips plugged into them (Deepcool and others) follow too. Protocol as documented by the OpenRGB project;
//! own implementation.
//!
//! Safety rules:
//! - Detection only sends the controller's read queries (LED counts, R/G swap, present zones).
//! - A color write sets each present zone to the static mode. Nothing is saved to the controller (no commit),
//!   and its configuration (LED counts, R/G swap, zone layout) is never written.

use std::ffi::CString;

use hidapi::{HidApi, HidDevice};
use super::lights::Found;

const VID: u16 = 0x26CE;
/// Motherboard LED controller, DeskMini addressable LED strip.
const PIDS: [u16; 2] = [0x01A2, 0x01A6];

const SET_ZONE: u8 = 0x10;
const READ_HEADER: u8 = 0x14;
const CFG_PRESENT: u8 = 0x01;
const CFG_LED_COUNT: u8 = 0x02;
const CFG_RG_SWAP: u8 = 0x03;
/// LED count value of a zone the board does not have.
const ZONE_ABSENT: u8 = 0x1E;
const MODE_STATIC: u8 = 0x01;
const SPEED_DEFAULT: u8 = 0xE0;

/// A zone of the board: index 0–7 (RGB headers, ARGB headers, PCH, I/O cover, PCB, ARGB 3/audio).
#[derive(Clone, Copy, Debug, PartialEq)]
struct Zone {
    index: u8,
    /// The zone takes red and green swapped.
    rg_swap: bool,
}

/// Output report (report id 0 + 64 bytes) that sets one zone to a static color.
fn static_report(zone: Zone, [r, g, b]: [u8; 3]) -> [u8; 65] {
    let mut buf = [0u8; 65];
    buf[0x01] = SET_ZONE;
    buf[0x03] = zone.index;
    buf[0x04] = MODE_STATIC;
    // The controller expects G, R, B unless the zone is marked as swapped.
    (buf[0x05], buf[0x06]) = if zone.rg_swap { (r, g) } else { (g, r) };
    buf[0x07] = b;
    buf[0x08] = SPEED_DEFAULT;
    buf[0x09] = 0xFF; // brightness
    buf
}

/// Zones present on this board, from the three config tables.
fn zones(led_counts: &[u8], rg_swap: u8, present: u8) -> Vec<Zone> {
    (0..8u8)
        .filter(|&z| led_counts[z as usize] != ZONE_ABSENT && (present >> z) & 1 == 1)
        .map(|index| Zone { index, rg_swap: (rg_swap >> index) & 1 == 1 })
        .collect()
}

/// One read query; the answer's payload starts at byte 4.
fn query(dev: &HidDevice, cfg: u8) -> Option<[u8; 64]> {
    let mut buf = [0u8; 65];
    buf[0x01] = READ_HEADER;
    buf[0x03] = cfg;
    dev.write(&buf).ok()?;
    let mut answer = [0u8; 64];
    let n = dev.read_timeout(&mut answer, 500).ok()?;
    (n >= 12).then_some(answer)
}

fn probe(dev: &HidDevice) -> Option<Vec<Zone>> {
    let counts = query(dev, CFG_LED_COUNT)?;
    let swap = query(dev, CFG_RG_SWAP)?[4];
    let present = query(dev, CFG_PRESENT)?[4];
    Some(zones(&counts[4..12], swap, present)).filter(|z| !z.is_empty())
}

fn make_apply(path: CString, zones: Vec<Zone>) -> super::lights::Apply {
    Box::new(move |rgb| {
        let api = HidApi::new().map_err(|e| e.to_string())?;
        let dev = api.open_path(&path).map_err(|e| e.to_string())?;
        for &zone in &zones {
            dev.write(&static_report(zone, rgb)).map_err(|e| e.to_string())?;
            // Each command is acknowledged; read it so the next one is not dropped.
            let _ = dev.read_timeout(&mut [0u8; 64], 200);
        }
        Ok(())
    })
}

/// Read-only detection; one `Found` per ASRock LED controller that answered its config queries.
pub fn detect(api: &HidApi, board: &str) -> Vec<Found> {
    let mut seen = std::collections::HashSet::new();
    api.device_list()
        .filter(|d| d.vendor_id() == VID && PIDS.contains(&d.product_id()))
        .filter(|d| seen.insert((d.product_id(), d.serial_number().map(str::to_string))))
        .filter_map(|d| {
            let zones = probe(&d.open_device(api).ok()?)?;
            let name = if d.product_id() == 0x01A6 { "ASRock DeskMini LED strip".to_string() } else { format!("{board} (Polychrome RGB)") };
            Some(Found {
                id: format!("asrock:{}", d.path().to_string_lossy()),
                name,
                kind: if d.product_id() == 0x01A6 { "strip" } else { "motherboard" },
                backend: "ASRock Polychrome (USB)",
                zones: zones.len() as u32,
                apply: make_apply(d.path().to_owned(), zones),
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn static_layout() {
        let r = static_report(Zone { index: 3, rg_swap: false }, [0x11, 0x22, 0x33]);
        assert_eq!(&r[..10], &[0x00, 0x10, 0x00, 0x03, 0x01, 0x22, 0x11, 0x33, 0xE0, 0xFF]);
        assert!(r[10..].iter().all(|&b| b == 0));
        let swapped = static_report(Zone { index: 4, rg_swap: true }, [0x11, 0x22, 0x33]);
        assert_eq!(&swapped[5..8], &[0x11, 0x22, 0x33]);
    }

    #[test]
    fn present_zones_only() {
        // RGB1, ARGB1 and PCH present; ARGB2 reports a count but is not flagged present; the rest absent.
        let counts = [1, ZONE_ABSENT, 80, 80, 1, ZONE_ABSENT, ZONE_ABSENT, ZONE_ABSENT];
        let z = zones(&counts, 0b0001_0000, 0b0001_0101);
        assert_eq!(z, vec![Zone { index: 0, rg_swap: false }, Zone { index: 2, rg_swap: false }, Zone { index: 4, rg_swap: true }]);
        assert!(zones(&[ZONE_ABSENT; 8], 0, 0xFF).is_empty());
    }
}
