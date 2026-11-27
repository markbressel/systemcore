//! ENE SMBus RGB controllers on DDR4 RAM (T-Force Delta RGB, G.Skill Trident Z RGB, Geil Super Luce, ...)
//! and the T-Force Xtreem ARGB variant. Register protocol as documented by the OpenRGB project; own implementation.
//!
//! Safety rules (RAM sits on the same bus as its SPD EEPROM):
//! - Detection is read-only: a controller must return its signature bytes before anything is written to it.
//! - Writes go only to a whitelist of color/mode/apply registers. No address remapping (all modules keep the
//!   shared default address and take the same color together), and never the 0xAA "save to flash" command.
//! - Protected SPD addresses are refused again in the SMBus layer (pawnio::protected).

use super::pawnio::{protected, with_smbus, Smbus};

/// Where ENE DRAM controllers answer: 0x77 out of the box, the others after a tool remapped them.
const CANDIDATES: [u8; 16] = [0x77, 0x70, 0x71, 0x72, 0x73, 0x74, 0x75, 0x76, 0x4F, 0x66, 0x67, 0x39, 0x3A, 0x3B, 0x3C, 0x3D];

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Kind {
    /// ENE "DIMM_LED-0102/0103": 5 LEDs, effect colors at 0x8010.
    EneV1,
    /// ENE "AUDA0-E6K5-0101": up to 10 LEDs, effect colors at 0x8160.
    EneV2,
    /// T-Force Xtreem ARGB: 15 LEDs, own register page 0xE0xx.
    Xtreem,
}

struct Map {
    colors: u16,
    max_leds: u8,
    direct: u16,
    mode: u16,
    speed: u16,
    direction: u16,
    apply: u16,
}

const ENE_V1: Map = Map { colors: 0x8010, max_leds: 5, direct: 0x8020, mode: 0x8021, speed: 0x8022, direction: 0x8023, apply: 0x80A0 };
const ENE_V2: Map = Map { colors: 0x8160, max_leds: 10, ..ENE_V1 };
const XTREEM: Map = Map { colors: 0xE300, max_leds: 15, direct: 0xE020, mode: 0xE021, speed: 0xE022, direction: 0xE023, apply: 0xE02F };
const APPLY: u8 = 0x01;

impl Kind {
    fn map(self) -> &'static Map {
        match self {
            Kind::EneV1 => &ENE_V1,
            Kind::EneV2 => &ENE_V2,
            Kind::Xtreem => &XTREEM,
        }
    }
}

#[derive(Clone, Debug)]
pub struct Controller {
    pub port: u8,
    pub addr: u8,
    pub kind: Kind,
    pub name: String,
    leds: u8,
}

// ENE registers are 16-bit, reached through a pointer: word write to command 0x00 (byte-swapped), then
// a byte read from 0x81 or a byte write to 0x01.
fn reg_read(bus: &Smbus, addr: u8, reg: u16) -> Result<u8, String> {
    bus.write_word_data(addr, 0x00, reg.swap_bytes())?;
    bus.read_byte_data(addr, 0x81)
}

/// Write whitelist: color table, mode/speed/direction/direct, and "apply" with value 0x01 only.
fn allowed(addr: u8, kind: Kind, reg: u16, val: u8) -> bool {
    let m = kind.map();
    let color = reg >= m.colors && reg < m.colors + m.max_leds as u16 * 3;
    let control = [m.direct, m.mode, m.speed, m.direction].contains(&reg);
    let apply = reg == m.apply && val == APPLY;
    (color || control || apply) && !protected(addr)
}

/// The only way SystemCore writes to a RAM controller.
fn reg_write(bus: &Smbus, addr: u8, kind: Kind, reg: u16, val: u8) -> Result<(), String> {
    if !allowed(addr, kind, reg, val) {
        return Err(format!("refused: RAM register 0x{reg:04x} = 0x{val:02x}"));
    }
    bus.write_word_data(addr, 0x00, reg.swap_bytes())?;
    bus.write_byte_data(addr, 0x01, val)
}

/// Read-only signature test on plain SMBus registers.
fn signature(bus: &Smbus, addr: u8) -> Option<Kind> {
    if bus.read_byte(addr).is_err() && bus.read_byte_data(addr, 0x00).is_err() {
        return None;
    }
    // ENE: registers 0xA0..0xAF read back 0..15. Xtreem: 0x90..0xA0 read back 0x10..0x20 (so 0xA0 differs).
    if (0xA0u8..=0xAF).all(|i| bus.read_byte_data(addr, i) == Ok(i - 0xA0)) {
        return Some(Kind::EneV1);
    }
    if (0x90u8..=0xA0).all(|i| bus.read_byte_data(addr, i) == Ok(i - 0x80)) {
        return Some(Kind::Xtreem);
    }
    None
}

fn identify(bus: &Smbus, port: u8, addr: u8) -> Option<Controller> {
    if protected(addr) {
        return None;
    }
    match signature(bus, addr)? {
        Kind::Xtreem => Some(Controller { port, addr, kind: Kind::Xtreem, name: "T-Force Xtreem ARGB".into(), leds: 15 }),
        _ => {
            // Signature passed: now the device name through the register pointer.
            let name: String = (0..16u16).map_while(|i| reg_read(bus, addr, 0x1000 + i).ok().filter(|&b| b != 0)).map(char::from).collect();
            let kind = match name.as_str() {
                "DIMM_LED-0102" | "DIMM_LED-0103" => Kind::EneV1,
                "AUDA0-E6K5-0101" => Kind::EneV2,
                _ => return None, // unknown firmware: leave it alone
            };
            let leds = reg_read(bus, addr, 0x1C02).ok().filter(|&n| n > 0).unwrap_or(kind.map().max_leds).min(kind.map().max_leds);
            let label = if name == "DIMM_LED-0103" { "T-Force Delta RGB".to_string() } else { format!("RGB memory ({name})") };
            Some(Controller { port, addr, kind, name: label, leds })
        }
    }
}

/// Finds RAM RGB controllers (read-only). Needs PawnIO and an elevated SystemCore; empty otherwise.
pub fn detect() -> Vec<Controller> {
    let mut found = Vec::new();
    for port in [0u8, 1] {
        let _ = with_smbus(port, |bus| {
            found.extend(CANDIDATES.iter().filter_map(|&a| identify(bus, port, a)));
            Ok(())
        });
    }
    found
}

/// Static color on one controller, effect-mode path (volatile: gone after a power cycle, never saved).
pub fn set_color(c: &Controller, [r, g, b]: [u8; 3]) -> Result<(), String> {
    with_smbus(c.port, |bus| {
        let m = c.kind.map();
        let w = |reg: u16, val: u8| reg_write(bus, c.addr, c.kind, reg, val);
        for led in 0..c.leds as u16 {
            // ENE byte order is R, B, G.
            for (i, v) in [r, b, g].into_iter().enumerate() {
                w(m.colors + led * 3 + i as u16, v)?;
            }
        }
        w(m.apply, APPLY)?;
        w(m.mode, 0x01)?; // static
        w(m.speed, 0x00)?;
        w(m.direction, 0x00)?;
        w(m.apply, APPLY)?;
        w(m.direct, 0x00)?;
        w(m.apply, APPLY)
    })
}

/// Manual probes on real hardware; both need an elevated shell with PawnIO installed.
/// `cargo test ram_probe -- --ignored --nocapture` (read-only) and `RGB=ff7a1a cargo test ram_set -- --ignored --nocapture`.
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn whitelist_blocks_dangerous_writes() {
        // Remap registers, save-to-flash and SPD addresses must be refused before any I/O.
        let refused = |addr, kind, reg, val| !allowed(addr, kind, reg, val);
        assert!(refused(0x77, Kind::EneV1, 0x80A0, 0xAA), "save to flash");
        assert!(refused(0x77, Kind::EneV1, 0x80F8, 0x00), "remap slot");
        assert!(refused(0x77, Kind::EneV1, 0x80F9, 0xE0), "remap address");
        assert!(refused(0x77, Kind::Xtreem, 0xE0F9, 0xE0), "xtreem remap");
        assert!(refused(0x77, Kind::EneV1, 0x801F, 0x00), "past the color table");
        assert!(refused(0x50, Kind::EneV1, 0x8010, 0x00), "SPD address");
        assert!(!refused(0x77, Kind::EneV1, 0x8010, 0xFF));
        assert!(!refused(0x77, Kind::EneV1, 0x80A0, 0x01));
        assert!(!refused(0x77, Kind::Xtreem, 0xE02F, 0x01));
    }

    #[test]
    #[ignore]
    fn ram_probe() {
        println!("pawnio installed: {}", super::super::pawnio::installed());
        for port in [0u8, 1] {
            let r = with_smbus(port, |bus| {
                for a in CANDIDATES {
                    println!("port {port} addr 0x{a:02x}: present {:?} signature {:?}", bus.read_byte(a).is_ok(), signature(bus, a));
                }
                Ok(())
            });
            println!("port {port}: {r:?}");
        }
        println!("controllers: {:#?}", detect());
        println!("cpu temp: {:?}", super::super::pawnio::amd_cpu_temperature());
    }

    #[test]
    #[ignore]
    fn ram_set() {
        let hex = std::env::var("RGB").unwrap_or("ff7a1a".into());
        let c = u32::from_str_radix(&hex, 16).unwrap().to_be_bytes();
        for ctl in detect() {
            println!("{} @0x{:02x} -> {:?}", ctl.name, ctl.addr, set_color(&ctl, [c[1], c[2], c[3]]));
        }
    }
}
