//! Older ASRock motherboards (about 2017–2020: AMD 300/400, Intel 100–400 series) whose LED controller sits on the
//! motherboard SMBus at 0x6A: ASR LED (firmware 1.x), Polychrome v1 (2.x) and Polychrome v2 (3.x). Covers the
//! board's LEDs and RGB/ARGB headers (fans, coolers, strips such as Deepcool follow). Protocol as documented by the
//! OpenRGB project; own implementation. Goes through PawnIO (elevated app); never on DDR5 systems (pawnio.rs).
//!
//! Safety rules:
//! - Only on boards Windows reports as ASRock, only at 0x6A, and only after the firmware-version register answers
//!   with a known major version. LED counts are read, never written.
//! - Writes go to a whitelist of mode/select/color registers; nothing is saved by the controller.

use std::{thread::sleep, time::Duration};

use super::lights::Found;
use super::pawnio::{with_smbus, Smbus};

const ADDR: u8 = 0x6A;
const REG_FIRMWARE: u8 = 0x00;
const REG_MODE: u8 = 0x30;
const REG_SELECT: u8 = 0x31;
const REG_SET_ALL: u8 = 0x32;
const REG_ZONE_SIZE: u8 = 0x33;
const REG_V2_COLOR: u8 = 0x34;
/// Static mode on all three generations; on ASR LED and v1 it is also the register that takes the color.
const MODE_STATIC: u8 = 0x11;
/// Polychrome v2 addresses the ARGB header as LED 0x19.
const V2_ARGB_LED: u8 = 0x19;

#[derive(Clone, Debug, PartialEq)]
enum Gen {
    /// One LED.
    Asr,
    /// Zones 0–5 that have LEDs (RGB 1/2, PCH, I/O cover, audio, ARGB).
    V1(Vec<u8>),
    /// LED indexes: the fixed LEDs in order, then 0x19 when the ARGB header is present.
    V2(Vec<u8>),
}

/// v1: zones with at least one LED. v2: one index per fixed LED, then the ARGB header.
fn layout(major: u8, counts: &[u8]) -> Option<Gen> {
    match major {
        1 => Some(Gen::Asr),
        2 => Some(Gen::V1((0..6u8).filter(|&z| counts.get(z as usize).is_some_and(|&c| c > 0)).collect())),
        3 => {
            let fixed: u8 = counts.iter().take(5).fold(0u8, |a, &c| a.saturating_add(c));
            let mut leds: Vec<u8> = (0..fixed.min(V2_ARGB_LED)).collect();
            if counts.get(5).is_some_and(|&c| c > 0) {
                leds.push(V2_ARGB_LED);
            }
            Some(Gen::V2(leds))
        }
        _ => None,
    }
}

/// The block writes for one static color, in order.
fn commands(gen: &Gen, [r, g, b]: [u8; 3]) -> Vec<(u8, Vec<u8>)> {
    let rgb = vec![r, g, b];
    match gen {
        Gen::Asr => vec![(REG_MODE, vec![MODE_STATIC]), (REG_SELECT, vec![0]), (MODE_STATIC, rgb)],
        Gen::V1(zones) => zones
            .iter()
            .flat_map(|&z| {
                [(REG_SET_ALL, vec![0]), (REG_SELECT, vec![z]), (REG_MODE, vec![MODE_STATIC]), (REG_SELECT, vec![z]), (MODE_STATIC, rgb.clone())]
            })
            .collect(),
        Gen::V2(leds) => std::iter::once((REG_MODE, vec![MODE_STATIC]))
            .chain(leds.iter().flat_map(|&l| [(REG_SELECT, vec![l]), (REG_V2_COLOR, rgb.clone())]))
            .collect(),
    }
}

fn write(bus: &Smbus, reg: u8, data: &[u8]) -> Result<(), String> {
    if ![REG_MODE, REG_SELECT, REG_SET_ALL, REG_V2_COLOR, MODE_STATIC].contains(&reg) {
        return Err(format!("refused: ASRock register 0x{reg:02x} is not on the write list"));
    }
    bus.write_block_data(ADDR, reg, data)?;
    sleep(Duration::from_millis(1)); // the controller needs a moment between commands
    Ok(())
}

fn probe(bus: &Smbus) -> Option<Gen> {
    bus.read_byte(ADDR).ok()?;
    let version = bus.read_block_data(ADDR, REG_FIRMWARE).ok().filter(|v| v.len() == 2)?;
    let counts = if version[0] == 1 { Vec::new() } else { bus.read_block_data(ADDR, REG_ZONE_SIZE).ok().filter(|c| c.len() == 6)? };
    layout(version[0], &counts).filter(|g| !matches!(g, Gen::V1(z) | Gen::V2(z) if z.is_empty()))
}

/// Read-only detection on ASRock boards; `board_vendor` comes from SMBIOS.
pub fn detect(board_vendor: &str, board: &str) -> Vec<Found> {
    if !board_vendor.to_ascii_lowercase().contains("asrock") {
        return vec![];
    }
    let Ok(Some(gen)) = with_smbus(0, |bus| Ok(probe(bus))) else { return vec![] };
    let zones = match &gen {
        Gen::Asr => 1,
        Gen::V1(z) | Gen::V2(z) => z.len() as u32,
    };
    vec![Found {
        id: "asrock-smbus:0x6a".into(),
        name: format!("{board} (Polychrome RGB)"),
        kind: "motherboard",
        backend: "ASRock Polychrome (SMBus)",
        zones,
        apply: Box::new(move |rgb| with_smbus(0, |bus| commands(&gen, rgb).iter().try_for_each(|(reg, data)| write(bus, *reg, data)))),
    }]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn layouts() {
        assert_eq!(layout(1, &[]), Some(Gen::Asr));
        assert_eq!(layout(2, &[1, 0, 1, 0, 0, 30]), Some(Gen::V1(vec![0, 2, 5])));
        assert_eq!(layout(3, &[1, 1, 2, 0, 0, 30]), Some(Gen::V2(vec![0, 1, 2, 3, 0x19])));
        assert_eq!(layout(3, &[0, 0, 0, 0, 0, 0]), Some(Gen::V2(vec![])));
        assert_eq!(layout(4, &[1; 6]), None);
    }

    #[test]
    fn static_commands() {
        let c = commands(&Gen::V2(vec![0, 0x19]), [1, 2, 3]);
        assert_eq!(c, vec![(0x30, vec![0x11]), (0x31, vec![0]), (0x34, vec![1, 2, 3]), (0x31, vec![0x19]), (0x34, vec![1, 2, 3])]);
        let v1 = commands(&Gen::V1(vec![5]), [1, 2, 3]);
        assert_eq!(v1, vec![(0x32, vec![0]), (0x31, vec![5]), (0x30, vec![0x11]), (0x31, vec![5]), (0x11, vec![1, 2, 3])]);
        assert_eq!(commands(&Gen::Asr, [9, 8, 7]).last(), Some(&(0x11, vec![9, 8, 7])));
    }
}
