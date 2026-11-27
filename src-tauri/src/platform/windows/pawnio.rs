//! PawnIO (https://pawnio.eu, signed kernel driver by namazso) runs small signed modules for hardware access
//! Windows does not give user mode: the motherboard SMBus (RAM RGB) and AMD SMN registers (Ryzen temperature).
//! The modules (LGPL-2.1, PawnIO.Modules release 0.2.12, unmodified; license in resources/pawnio/COPYING)
//! are embedded. The device only opens for administrators, so all of this needs an elevated SystemCore.

use std::ffi::c_void;
use std::sync::{Mutex, OnceLock};
use windows::core::{w, PCWSTR};
use windows::Win32::Foundation::{CloseHandle, GENERIC_READ, GENERIC_WRITE, HANDLE, WAIT_ABANDONED, WAIT_OBJECT_0};
use windows::Win32::Storage::FileSystem::{CreateFileW, FILE_FLAGS_AND_ATTRIBUTES, FILE_SHARE_DELETE, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING};
use windows::Win32::System::Threading::{CreateMutexW, ReleaseMutex, WaitForSingleObject};
use windows::Win32::System::IO::DeviceIoControl;

static SMBUS_PIIX4: &[u8] = include_bytes!("../../../resources/pawnio/SmbusPIIX4.bin");
static SMBUS_I801: &[u8] = include_bytes!("../../../resources/pawnio/SmbusI801.bin");
static AMD_FAMILY17: &[u8] = include_bytes!("../../../resources/pawnio/AMDFamily17.bin");

// CTL_CODE(0xA1B2, fn, METHOD_BUFFERED, FILE_ANY_ACCESS)
const IOCTL_LOAD_BINARY: u32 = 0xA1B2_2084;
const IOCTL_EXECUTE_FN: u32 = 0xA1B2_2104;

/// Driver installed (service registered), whether or not we may open it.
pub fn installed() -> bool {
    winreg::RegKey::predef(winreg::enums::HKEY_LOCAL_MACHINE).open_subkey(r"SYSTEM\CurrentControlSet\Services\PawnIO").is_ok()
}

/// One driver handle with one module loaded into it.
pub struct Module(HANDLE);
// The handle is only used behind a Mutex.
unsafe impl Send for Module {}

impl Module {
    pub fn load(blob: &[u8]) -> Result<Self, String> {
        let h = unsafe {
            CreateFileW(
                w!(r"\\?\GLOBALROOT\Device\PawnIO"),
                (GENERIC_READ | GENERIC_WRITE).0,
                FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                None,
                OPEN_EXISTING,
                FILE_FLAGS_AND_ATTRIBUTES(0),
                None,
            )
        }
        .map_err(|e| format!("PawnIO: {}", e.message()))?;
        let m = Module(h);
        unsafe { DeviceIoControl(m.0, IOCTL_LOAD_BINARY, Some(blob.as_ptr() as *const c_void), blob.len() as u32, None, 0, None, None) }
            .map_err(|e| format!("PawnIO module: {}", e.message()))?;
        Ok(m)
    }

    /// Calls a module function: 32-byte name, then u64 arguments; returns up to `out_len` u64 results.
    pub fn exec(&self, name: &str, input: &[u64], out_len: usize) -> Result<Vec<u64>, String> {
        let mut buf = vec![0u8; 32 + input.len() * 8];
        buf[..name.len().min(31)].copy_from_slice(&name.as_bytes()[..name.len().min(31)]);
        for (i, v) in input.iter().enumerate() {
            buf[32 + i * 8..40 + i * 8].copy_from_slice(&v.to_le_bytes());
        }
        let mut out = vec![0u64; out_len];
        let mut got = 0u32;
        unsafe {
            DeviceIoControl(
                self.0,
                IOCTL_EXECUTE_FN,
                Some(buf.as_ptr() as *const c_void),
                buf.len() as u32,
                Some(out.as_mut_ptr() as *mut c_void),
                (out_len * 8) as u32,
                Some(&mut got),
                None,
            )
        }
        .map_err(|e| e.message().to_string())?;
        out.truncate(got as usize / 8);
        Ok(out)
    }
}

impl Drop for Module {
    fn drop(&mut self) {
        unsafe {
            let _ = CloseHandle(self.0);
        }
    }
}

/// System-wide lock other hardware tools (HWiNFO, OpenRGB, vendor software) also take before touching a bus.
struct GlobalLock(HANDLE);

impl GlobalLock {
    fn take(name: PCWSTR) -> Option<Self> {
        let h = unsafe { CreateMutexW(None, false, name) }.ok()?;
        let r = unsafe { WaitForSingleObject(h, 1000) };
        if r == WAIT_OBJECT_0 || r == WAIT_ABANDONED {
            Some(GlobalLock(h))
        } else {
            unsafe {
                let _ = CloseHandle(h);
            }
            None
        }
    }
}

impl Drop for GlobalLock {
    fn drop(&mut self) {
        unsafe {
            let _ = ReleaseMutex(self.0);
            let _ = CloseHandle(self.0);
        }
    }
}

// ---- SMBus ----

/// SPD EEPROMs (0x50–0x57) and DDR4 SPD page select (0x30–0x37): writing there can make a RAM module unbootable.
/// Nothing in SystemCore may ever send a write to them.
pub fn protected(addr: u8) -> bool {
    (0x30..=0x37).contains(&addr) || (0x50..=0x57).contains(&addr)
}

const SIZE_BYTE: u64 = 1;
const SIZE_BYTE_DATA: u64 = 2;
const SIZE_WORD_DATA: u64 = 3;

/// The motherboard SMBus (AMD PIIX4-compatible or Intel I801), with the bus lock held while borrowed.
pub struct Smbus<'a> {
    m: &'a Module,
    _lock: GlobalLock,
}

impl Smbus<'_> {
    fn xfer(&self, addr: u8, read: bool, cmd: u8, size: u64, data: u64) -> Result<u64, String> {
        if !read && protected(addr) {
            return Err(format!("refused: write to protected SMBus address 0x{addr:02x}"));
        }
        let out = self.m.exec("ioctl_smbus_xfer", &[addr as u64, read as u64, cmd as u64, size, data, 0, 0, 0, 0], 5)?;
        out.first().copied().ok_or_else(|| "no data".into())
    }
    /// SMBus "receive byte": a read-only presence check.
    pub fn read_byte(&self, addr: u8) -> Result<u8, String> {
        self.xfer(addr, true, 0, SIZE_BYTE, 0).map(|v| v as u8)
    }
    pub fn read_byte_data(&self, addr: u8, cmd: u8) -> Result<u8, String> {
        self.xfer(addr, true, cmd, SIZE_BYTE_DATA, 0).map(|v| v as u8)
    }
    pub fn write_byte_data(&self, addr: u8, cmd: u8, val: u8) -> Result<(), String> {
        self.xfer(addr, false, cmd, SIZE_BYTE_DATA, val as u64).map(|_| ())
    }
    pub fn write_word_data(&self, addr: u8, cmd: u8, val: u16) -> Result<(), String> {
        self.xfer(addr, false, cmd, SIZE_WORD_DATA, val as u64).map(|_| ())
    }
}

fn smbus_module() -> &'static Mutex<Option<Module>> {
    static M: OnceLock<Mutex<Option<Module>>> = OnceLock::new();
    // Each module checks the chipset itself and refuses to load on the wrong one.
    M.get_or_init(|| Mutex::new(Module::load(SMBUS_PIIX4).or_else(|_| Module::load(SMBUS_I801)).ok()))
}

/// Runs `f` on SMBus port `port` (PIIX4 has ports 0 and 1; I801 has one) with the system-wide bus lock held.
pub fn with_smbus<T>(port: u8, f: impl FnOnce(&Smbus) -> Result<T, String>) -> Result<T, String> {
    let guard = smbus_module().lock().unwrap_or_else(|e| e.into_inner());
    let m = guard.as_ref().ok_or("SMBus not available (PawnIO missing, not elevated, or unsupported chipset)")?;
    let lock = GlobalLock::take(w!(r"Global\Access_SMBUS.HTP.Method")).ok_or("SMBus busy (another hardware tool holds it)")?;
    // PIIX4 only: select the port. I801 has no such function, which is fine for port 0.
    if m.exec("ioctl_piix4_port_sel", &[port as u64], 1).is_err() && port != 0 {
        return Err("no such SMBus port".into());
    }
    f(&Smbus { m, _lock: lock })
}

// ---- AMD Ryzen temperature (SMN) ----

/// Ryzen Tctl in °C from the SMU thermal register (families 17h–1Ah).
pub fn amd_cpu_temperature() -> Option<f32> {
    static M: OnceLock<Mutex<Option<Module>>> = OnceLock::new();
    let guard = M.get_or_init(|| Mutex::new(Module::load(AMD_FAMILY17).ok())).lock().unwrap_or_else(|e| e.into_inner());
    let m = guard.as_ref()?;
    let _lock = GlobalLock::take(w!(r"Global\Access_PCI"))?;
    let v = *m.exec("ioctl_read_smn", &[0x59800], 1).ok()?.first()? as u32;
    tctl_celsius(v)
}

fn tctl_celsius(v: u32) -> Option<f32> {
    let mut t = ((v >> 21) & 0x7FF) as f32 / 8.0;
    // "Range select" bit: the reading is offset by 49 °C.
    if v & (1 << 19) != 0 {
        t -= 49.0;
    }
    (t > 0.0 && t < 125.0).then_some(t)
}

#[cfg(test)]
mod tests {
    #[test]
    fn protected_addresses() {
        for a in [0x30, 0x36, 0x37, 0x50, 0x53, 0x57] {
            assert!(super::protected(a), "0x{a:02x}");
        }
        for a in [0x2f, 0x38, 0x4f, 0x58, 0x70, 0x77] {
            assert!(!super::protected(a), "0x{a:02x}");
        }
    }

    #[test]
    fn tctl_decoding() {
        assert_eq!(super::tctl_celsius(400 << 21), Some(50.0)); // 400 / 8
        assert_eq!(super::tctl_celsius((792 << 21) | (1 << 19)), Some(50.0)); // 99 − 49
        assert_eq!(super::tctl_celsius(0), None);
    }
}
