//! Older Gigabyte motherboards (about 2016–2018, first-generation RGB Fusion: 100/200-series Intel, 300-series AMD)
//! whose LED controller sits on the motherboard SMBus at 0x28. Two channels (board LEDs + RGB header), so strips,
//! fans and coolers on that header (Deepcool and others) follow. Protocol as documented by the OpenRGB project;
//! own implementation. Goes through PawnIO (elevated app); never on DDR5 systems (pawnio.rs).
//!
//! Safety rules:
//! - Only on boards Windows reports as Gigabyte, only at 0x28, and only after register 0xF2 returns the controller's
//!   signature 0xC4.
//! - Writes go to a whitelist (bank switch, control enable, channel colors, channel modes); nothing is saved.

use super::lights::Found;
use super::pawnio::{with_smbus, Smbus};

const ADDR: u8 = 0x28;
const REG_SIGNATURE: u8 = 0xF2;
const SIGNATURE: u8 = 0xC4;
const REG_BANK: u8 = 0xF0;
/// Bank 0: 0x02 = 0x09 hands control to software; 0x03 / 0x13 = channel 0 / 1 mode (static = 0x10).
/// Bank 1: 0x00–0x02 / 0x08–0x0A = channel 0 / 1 red, green, blue; 0x03 / 0x0B = 1 latches the color.
const WRITABLE: [u8; 12] = [REG_BANK, 0x02, 0x03, 0x13, 0x00, 0x01, 0x08, 0x09, 0x0A, 0x0B, 0x03, 0x0B];
const MODE_STATIC: u8 = 0x10;

/// Byte writes for one static color on both channels, in order.
fn commands([r, g, b]: [u8; 3]) -> [(u8, u8); 14] {
    [
        (REG_BANK, 0),
        (0x02, 0x09),
        (REG_BANK, 1),
        (0x00, r),
        (0x01, g),
        (0x02, b),
        (0x03, 0x01),
        (0x08, r),
        (0x09, g),
        (0x0A, b),
        (0x0B, 0x01),
        (REG_BANK, 0),
        (0x03, MODE_STATIC),
        (0x13, MODE_STATIC),
    ]
}

fn write(bus: &Smbus, reg: u8, val: u8) -> Result<(), String> {
    if !WRITABLE.contains(&reg) {
        return Err(format!("refused: Gigabyte register 0x{reg:02x} is not on the write list"));
    }
    bus.write_byte_data(ADDR, reg, val)
}

/// Read-only detection on Gigabyte boards; `board_vendor` comes from SMBIOS.
pub fn detect(board_vendor: &str, board: &str) -> Vec<Found> {
    let v = board_vendor.to_ascii_lowercase();
    if !v.contains("gigabyte") && !v.contains("aorus") {
        return vec![];
    }
    let found = with_smbus(0, |bus| Ok(bus.read_byte(ADDR).is_ok() && bus.read_byte_data(ADDR, REG_SIGNATURE) == Ok(SIGNATURE)));
    if found != Ok(true) {
        return vec![];
    }
    vec![Found {
        id: "gigabyte-smbus:0x28".into(),
        name: format!("{board} (RGB Fusion)"),
        kind: "motherboard",
        backend: "Gigabyte RGB Fusion (SMBus)",
        zones: 2,
        apply: Box::new(|rgb| with_smbus(0, |bus| commands(rgb).iter().try_for_each(|&(reg, val)| write(bus, reg, val)))),
    }]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn static_sequence() {
        let c = commands([0x11, 0x22, 0x33]);
        assert_eq!(&c[..3], &[(0xF0, 0), (0x02, 0x09), (0xF0, 1)]);
        assert_eq!(&c[3..7], &[(0x00, 0x11), (0x01, 0x22), (0x02, 0x33), (0x03, 0x01)]);
        assert_eq!(&c[11..], &[(0xF0, 0), (0x03, 0x10), (0x13, 0x10)]);
        assert!(c.iter().all(|(reg, _)| WRITABLE.contains(reg)));
    }
}
