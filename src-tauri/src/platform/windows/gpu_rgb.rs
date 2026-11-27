//! Graphics card lighting over the card's own I2C bus: Gigabyte / AORUS cards (RGB Fusion 2, GeForce RTX 20–40
//! and Radeon RX 5000–7000) and ASRock Radeon cards (Phantom Gaming, Taichi, Steel Legend). The bus is reached
//! through the graphics driver: NvAPI on NVIDIA, ADL on AMD. Protocols as documented by the OpenRGB project;
//! own implementation.
//!
//! The same bus carries the card's voltage controller, so the rules are strict:
//! 1. Only cards whose exact PCI vendor/device/subsystem ids are in `CARDS` (generated from OpenRGB's tested list).
//! 2. Only that card's listed RGB address; every write is checked against it again in `Bus::write`.
//! 3. The controller must answer its identification query before a color is sent.
//! 4. Only the static-color commands; never the controllers' "save" commands.

use std::ffi::c_void;
use std::sync::OnceLock;
use std::{thread::sleep, time::Duration};

use windows::core::{s, PCSTR};
use windows::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryA};

use super::lights::Found;

#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) enum Kind {
    Fusion2,
    Asrock,
}

pub(super) struct Card {
    vendor: u16,
    device: u16,
    sub_vendor: u16,
    sub_device: u16,
    addr: u8,
    kind: Kind,
    name: &'static str,
}

include!("gpu_cards.rs");

fn card(vendor: u16, device: u16, sub_vendor: u16, sub_device: u16) -> Option<&'static Card> {
    CARDS.iter().find(|c| (c.vendor, c.device, c.sub_vendor, c.sub_device) == (vendor, device, sub_vendor, sub_device))
}

// ---- protocols ----

const FUSION2_ZONES: u8 = 5;
const FUSION2_STATIC: u8 = 0x01;
const FUSION2_SPEED: u8 = 0x02;
const FUSION2_BRIGHTNESS: u8 = 0x63;

/// Gigabyte: an 8-byte "who are you" query; real controllers answer 0xAB followed by version bytes.
fn fusion2_answered(r: &[u8]) -> bool {
    r.len() >= 4 && r[0] == 0xAB && !(r[1] == 0xAB && r[2] == 0xAB && r[3] == 0xAB)
}

/// Gigabyte: for each of the 5 zones a static-mode packet, then its color packet.
fn fusion2_static([r, g, b]: [u8; 3]) -> Vec<[u8; 8]> {
    (0..FUSION2_ZONES)
        .flat_map(|zone| {
            let mode = [0x88, FUSION2_STATIC, FUSION2_SPEED, FUSION2_BRIGHTNESS, 0x00, zone + 1, 0x00, 0x00];
            let color = match zone {
                0 | 1 => [0xB0, FUSION2_STATIC, r, g, b, r, g, b],
                2 => [0xB1, FUSION2_STATIC, r, g, b, 0, 0, 0],
                _ => [0x40, r, g, b, zone + 1, 0, 0, 0],
            };
            [mode, color]
        })
        .collect()
}

/// ASRock: 12-byte packets: command, 0, sub-command, up to 9 data bytes.
fn asrock_packet(cmd: u8, sub: u8, data: &[u8]) -> [u8; 12] {
    let mut p = [0u8; 12];
    (p[0], p[2]) = (cmd, sub);
    p[3..3 + data.len().min(9)].copy_from_slice(&data[..data.len().min(9)]);
    p
}

/// ASRock: channels from the bit mask at bytes 4–5 of the answer to query 0x14/0x01.
fn asrock_channels(answer: &[u8]) -> Vec<u8> {
    let bits = answer.get(4).copied().unwrap_or(0) as u16 | (answer.get(5).copied().unwrap_or(0) as u16) << 8;
    (0..16u8).filter(|i| bits & (1 << i) != 0).collect()
}

/// ASRock: static mode with full brightness on each channel.
fn asrock_static(channels: &[u8], [r, g, b]: [u8; 3]) -> Vec<[u8; 12]> {
    channels.iter().map(|&ch| asrock_packet(0x10, ch, &[0x01, r, g, b, 0x80, 0xFF, 0x00, 0x1A])).collect()
}

// ---- driver I2C access ----

trait Transport: Send {
    fn write(&self, addr: u8, data: &[u8]) -> Result<(), String>;
    fn read(&self, addr: u8, len: usize) -> Result<Vec<u8>, String>;
}

/// The bus of one allow-listed card, locked to that card's RGB address.
struct Bus {
    t: Box<dyn Transport>,
    addr: u8,
}

impl Bus {
    fn write(&self, data: &[u8]) -> Result<(), String> {
        self.t.write(self.addr, data)
    }
    fn read(&self, len: usize) -> Result<Vec<u8>, String> {
        self.t.read(self.addr, len)
    }
}

// NVIDIA: NvAPI's I2C functions, reached through nvapi_QueryInterface.
#[repr(C)]
struct NvI2cInfoV3 {
    version: u32,
    display_mask: u32,
    is_ddc_port: u8,
    i2c_dev_address: u8,
    i2c_reg_address: *mut u8,
    reg_addr_size: u32,
    data: *mut u8,
    size: u32,
    i2c_speed: u32,
    i2c_speed_khz: u32,
    port_id: u8,
    is_port_id_set: u32,
}

type NvQuery = unsafe extern "C" fn(u32) -> *mut c_void;
type NvVoid = unsafe extern "C" fn() -> i32;
type NvEnumGpus = unsafe extern "C" fn(*mut [*mut c_void; 64], *mut i32) -> i32;
type NvPciIds = unsafe extern "C" fn(*mut c_void, *mut u32, *mut u32, *mut u32, *mut u32) -> i32;
type NvI2c = unsafe extern "C" fn(*mut c_void, *mut NvI2cInfoV3, *mut u32) -> i32;

struct NvApi {
    enum_gpus: NvEnumGpus,
    pci_ids: NvPciIds,
    write: NvI2c,
    read: NvI2c,
}

fn nvapi() -> Option<&'static NvApi> {
    static API: OnceLock<Option<NvApi>> = OnceLock::new();
    API.get_or_init(|| unsafe {
        let dll = LoadLibraryA(s!("nvapi64.dll")).ok()?;
        let query: NvQuery = std::mem::transmute(GetProcAddress(dll, s!("nvapi_QueryInterface"))?);
        let get = |id: u32| Some(query(id)).filter(|p| !p.is_null());
        let init: NvVoid = std::mem::transmute(get(0x0150_E828)?);
        if init() != 0 {
            return None;
        }
        Some(NvApi {
            enum_gpus: std::mem::transmute::<*mut c_void, NvEnumGpus>(get(0xE5AC_921F)?),
            pci_ids: std::mem::transmute::<*mut c_void, NvPciIds>(get(0x2DDF_B66E)?),
            write: std::mem::transmute::<*mut c_void, NvI2c>(get(0x283A_C65A)?),
            read: std::mem::transmute::<*mut c_void, NvI2c>(get(0x4D7B_0709)?),
        })
    })
    .as_ref()
}

/// One NVIDIA GPU; RGB controllers sit on I2C port 1 (not the display's DDC port).
struct NvBus(*mut c_void);
// The GPU handle is an opaque driver token, valid for the process lifetime once NvAPI is initialized.
unsafe impl Send for NvBus {}

impl NvBus {
    fn xfer(&self, addr: u8, data: &mut [u8], write: bool) -> Result<(), String> {
        let api = nvapi().ok_or("NvAPI not available")?;
        let mut info = NvI2cInfoV3 {
            version: (3 << 16) | std::mem::size_of::<NvI2cInfoV3>() as u32,
            display_mask: 0,
            is_ddc_port: 0,
            i2c_dev_address: addr << 1,
            i2c_reg_address: std::ptr::null_mut(),
            reg_addr_size: 0,
            data: data.as_mut_ptr(),
            size: data.len() as u32,
            i2c_speed: 0xFFFF,
            i2c_speed_khz: 0,
            port_id: 1,
            is_port_id_set: 1,
        };
        let mut unknown = 0u32;
        let status = unsafe { (if write { api.write } else { api.read })(self.0, &mut info, &mut unknown) };
        if status == 0 { Ok(()) } else { Err(format!("NvAPI I2C error {status}")) }
    }
}

impl Transport for NvBus {
    fn write(&self, addr: u8, data: &[u8]) -> Result<(), String> {
        self.xfer(addr, &mut data.to_vec(), true)
    }
    fn read(&self, addr: u8, len: usize) -> Result<Vec<u8>, String> {
        let mut buf = vec![0u8; len];
        self.xfer(addr, &mut buf, false).map(|_| buf)
    }
}

fn nvidia_cards() -> Vec<(Bus, &'static Card)> {
    let Some(api) = nvapi() else { return vec![] };
    let mut handles = [std::ptr::null_mut(); 64];
    let mut count = 0i32;
    if unsafe { (api.enum_gpus)(&mut handles, &mut count) } != 0 {
        return vec![];
    }
    handles[..count.clamp(0, 64) as usize]
        .iter()
        .filter_map(|&h| {
            let (mut dev, mut sub, mut rev, mut ext) = (0u32, 0u32, 0u32, 0u32);
            if unsafe { (api.pci_ids)(h, &mut dev, &mut sub, &mut rev, &mut ext) } != 0 {
                return None;
            }
            // device id: vendor in the low half, device in the high half; subsystem likewise.
            let c = card(dev as u16, (dev >> 16) as u16, sub as u16, (sub >> 16) as u16)?;
            Some((Bus { t: Box::new(NvBus(h)), addr: c.addr }, c))
        })
        .collect()
}

// AMD: ADL's Display_WriteAndReadI2C (the AMD SDK's ADLI2C / AdapterInfoX2 layouts).
#[repr(C)]
struct AdlI2c {
    size: i32,
    line: i32,
    address: i32,
    offset: i32,
    action: i32,
    speed: i32,
    data_size: i32,
    data: *mut u8,
}

#[repr(C)]
struct AdapterInfoX2 {
    size: i32,
    adapter_index: i32,
    udid: [u8; 256],
    bus_number: i32,
    device_number: i32,
    function_number: i32,
    vendor_id: i32,
    adapter_name: [u8; 256],
    display_name: [u8; 256],
    present: i32,
    exist: i32,
    driver_path: [u8; 256],
    driver_path_ext: [u8; 256],
    pnp_string: [u8; 256],
    os_display_index: i32,
    info_mask: i32,
    info_value: i32,
}

const ADL_I2C_READ: i32 = 1;
const ADL_I2C_WRITE: i32 = 2;

type AdlAlloc = extern "system" fn(i32) -> *mut c_void;
type AdlCreate = unsafe extern "C" fn(AdlAlloc, i32, *mut *mut c_void) -> i32;
type AdlInfoX4 = unsafe extern "C" fn(*mut c_void, i32, *mut i32, *mut *mut AdapterInfoX2) -> i32;
type AdlI2cXfer = unsafe extern "C" fn(*mut c_void, i32, *mut AdlI2c) -> i32;

// shortcut: ADL's adapter list is allocated through this callback and never freed (a few KB per scan).
extern "system" fn adl_alloc(size: i32) -> *mut c_void {
    Box::leak(vec![0u8; size.max(0) as usize].into_boxed_slice()).as_mut_ptr().cast()
}

struct Adl {
    ctx: *mut c_void,
    info: AdlInfoX4,
    i2c: AdlI2cXfer,
}
// The ADL context is created once and only used behind the lighting state's lock.
unsafe impl Send for Adl {}
unsafe impl Sync for Adl {}

fn adl() -> Option<&'static Adl> {
    static API: OnceLock<Option<Adl>> = OnceLock::new();
    API.get_or_init(|| unsafe {
        let dll = LoadLibraryA(s!("atiadlxx.dll")).ok()?;
        let proc = |name: PCSTR| GetProcAddress(dll, name);
        let create: AdlCreate = std::mem::transmute(proc(s!("ADL2_Main_Control_Create"))?);
        let info: AdlInfoX4 = std::mem::transmute(proc(s!("ADL2_Adapter_AdapterInfoX4_Get"))?);
        let i2c: AdlI2cXfer = std::mem::transmute(proc(s!("ADL2_Display_WriteAndReadI2C"))?);
        let mut ctx = std::ptr::null_mut();
        (create(adl_alloc, 1, &mut ctx) == 0).then_some(Adl { ctx, info, i2c })
    })
    .as_ref()
}

/// "PCI_VEN_1002&DEV_744C&SUBSYS_53041849&REV_C8" -> (vendor, device, sub vendor, sub device).
fn parse_pnp(pnp: &str) -> Option<(u16, u16, u16, u16)> {
    let hex = |key: &str, skip: usize| u16::from_str_radix(pnp.get(pnp.find(key)? + key.len() + skip..)?.get(..4)?, 16).ok();
    Some((hex("VEN_", 0)?, hex("DEV_", 0)?, hex("SUBSYS_", 4)?, hex("SUBSYS_", 0)?))
}

/// One AMD adapter; RGB controllers sit on I2C line 1.
struct AdlBus(i32);

impl AdlBus {
    fn xfer(&self, addr: u8, data: &mut [u8], action: i32) -> Result<(), String> {
        let api = adl().ok_or("ADL not available")?;
        let mut req = AdlI2c {
            size: std::mem::size_of::<AdlI2c>() as i32,
            line: 1,
            address: (addr as i32) << 1,
            offset: 0,
            action,
            speed: 100,
            data_size: data.len() as i32,
            data: data.as_mut_ptr(),
        };
        let status = unsafe { (api.i2c)(api.ctx, self.0, &mut req) };
        if status == 0 { Ok(()) } else { Err(format!("ADL I2C error {status}")) }
    }
}

impl Transport for AdlBus {
    fn write(&self, addr: u8, data: &[u8]) -> Result<(), String> {
        self.xfer(addr, &mut data.to_vec(), ADL_I2C_WRITE)
    }
    fn read(&self, addr: u8, len: usize) -> Result<Vec<u8>, String> {
        let mut buf = vec![0u8; len];
        self.xfer(addr, &mut buf, ADL_I2C_READ).map(|_| buf)
    }
}

fn amd_cards() -> Vec<(Bus, &'static Card)> {
    let Some(api) = adl() else { return vec![] };
    let (mut n, mut list) = (0i32, std::ptr::null_mut());
    if unsafe { (api.info)(api.ctx, -1, &mut n, &mut list) } != 0 || list.is_null() {
        return vec![];
    }
    let adapters = unsafe { std::slice::from_raw_parts(list, n.clamp(0, 256) as usize) };
    let mut seen_bus = std::collections::HashSet::new();
    adapters
        .iter()
        .filter(|a| seen_bus.insert(a.bus_number)) // one entry per physical card
        .filter_map(|a| {
            let pnp = String::from_utf8_lossy(&a.pnp_string[..a.pnp_string.iter().position(|&b| b == 0).unwrap_or(256)]).into_owned();
            let (v, d, sv, sd) = parse_pnp(&pnp)?;
            let c = card(v, d, sv, sd)?;
            Some((Bus { t: Box::new(AdlBus(a.adapter_index)), addr: c.addr }, c))
        })
        .collect()
}

// ---- detection ----

/// The identification query of each controller type; Some(channels) when it answered like a real controller.
fn identify(bus: &Bus, kind: Kind) -> Option<Vec<u8>> {
    match kind {
        Kind::Fusion2 => {
            bus.write(&[0xAB, 0, 0, 0, 0, 0, 0, 0]).ok()?;
            fusion2_answered(&bus.read(4).ok()?).then(Vec::new)
        }
        Kind::Asrock => {
            bus.write(&asrock_packet(0x14, 0x01, &[])).ok()?;
            sleep(Duration::from_millis(20));
            let channels = asrock_channels(&bus.read(32).ok()?);
            Some(channels).filter(|c| !c.is_empty())
        }
    }
}

/// Allow-listed graphics cards whose RGB controller answered. Each found card gets its own `Found`.
pub fn detect() -> Vec<Found> {
    nvidia_cards()
        .into_iter()
        .chain(amd_cards())
        .filter_map(|(bus, c)| {
            let channels = identify(&bus, c.kind)?;
            let zones = if c.kind == Kind::Fusion2 { FUSION2_ZONES as u32 } else { channels.len() as u32 };
            Some(Found {
                id: format!("gpu-rgb:{:04x}:{:04x}:{:04x}:{:04x}", c.vendor, c.device, c.sub_vendor, c.sub_device),
                name: c.name.into(),
                kind: "gpu",
                backend: if c.kind == Kind::Fusion2 { "Gigabyte RGB Fusion 2 (GPU I2C)" } else { "ASRock Polychrome (GPU I2C)" },
                zones,
                apply: Box::new(move |rgb| match c.kind {
                    Kind::Fusion2 => fusion2_static(rgb).iter().try_for_each(|p| bus.write(p)),
                    Kind::Asrock => asrock_static(&channels, rgb).iter().try_for_each(|p| bus.write(p)),
                }),
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn struct_layouts_match_the_driver_headers() {
        assert_eq!(std::mem::size_of::<NvI2cInfoV3>(), 64, "NV_I2C_INFO_V3 on x64");
        assert_eq!(std::mem::size_of::<AdlI2c>(), 40, "ADLI2C on x64");
        assert_eq!(std::mem::size_of::<AdapterInfoX2>(), 4 * 2 + 256 + 4 * 4 + 256 * 2 + 4 * 2 + 256 * 3 + 4 * 3);
        assert_eq!(std::mem::offset_of!(AdapterInfoX2, pnp_string), 4 * 2 + 256 + 16 + 512 + 8 + 512);
    }

    #[test]
    fn allow_list() {
        assert!(CARDS.len() > 100);
        assert!(CARDS.iter().all(|c| matches!(c.vendor, 0x10DE | 0x1002) && c.addr >= 0x08 && c.addr < 0x78));
        let asrock = card(0x1002, 0x744C, 0x1849, 0x5304).unwrap();
        assert_eq!((asrock.kind, asrock.addr), (Kind::Asrock, 0x36));
        // Same chip, other board partner: not on the list, so its bus is never touched.
        assert!(card(0x1002, 0x744C, 0x1043, 0x5304).is_none());
    }

    /// This PC's real graphics cards: `cargo test real_gpu_scan -- --ignored --nocapture`. Reads PCI ids only;
    /// an I2C query is sent only to allow-listed cards.
    #[test]
    #[ignore]
    fn real_gpu_scan() {
        println!("NvAPI loaded: {}, ADL loaded: {}", nvapi().is_some(), adl().is_some());
        println!("allow-listed cards here: {:?}", nvidia_cards().iter().chain(amd_cards().iter()).map(|(_, c)| c.name).collect::<Vec<_>>());
    }

    #[test]
    fn pnp_ids() {
        assert_eq!(parse_pnp("PCI_VEN_1002&DEV_744C&SUBSYS_53041849&REV_C8"), Some((0x1002, 0x744C, 0x1849, 0x5304)));
        assert_eq!(parse_pnp("garbage"), None);
    }

    #[test]
    fn fusion2_packets() {
        assert!(fusion2_answered(&[0xAB, 0x11, 0x52, 0x03]));
        assert!(!fusion2_answered(&[0xAB, 0xAB, 0xAB, 0xAB]), "an echoing bus is not a controller");
        assert!(!fusion2_answered(&[0, 0, 0, 0]));
        let p = fusion2_static([1, 2, 3]);
        assert_eq!(p.len(), 10);
        assert_eq!(p[0], [0x88, 0x01, 0x02, 0x63, 0x00, 0x01, 0x00, 0x00]);
        assert_eq!(p[1], [0xB0, 0x01, 1, 2, 3, 1, 2, 3]);
        assert_eq!(p[5], [0xB1, 0x01, 1, 2, 3, 0, 0, 0]);
        assert_eq!(p[9], [0x40, 1, 2, 3, 5, 0, 0, 0]);
    }

    #[test]
    fn asrock_packets() {
        assert_eq!(asrock_packet(0x14, 0x01, &[]), [0x14, 0, 0x01, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        assert_eq!(asrock_channels(&[0, 0, 0, 0, 0b1100_1000, 0x00]), vec![3, 6, 7]);
        assert_eq!(asrock_static(&[3], [1, 2, 3]), vec![[0x10, 0, 3, 0x01, 1, 2, 3, 0x80, 0xFF, 0x00, 0x1A, 0]]);
    }
}
