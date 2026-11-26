//! One-shot hardware inventory. Every field is optional: unknown stays unknown, never invented.
//! Serial numbers and UUIDs are intentionally not collected.

use crate::platform::windows::wmi_sources::{self, MemoryModule};
use serde::Serialize;
use sysinfo::{CpuRefreshKind, Gpus, MemoryRefreshKind, Motherboard, Networks, Product, RefreshKind, System};

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HardwareInfo {
    pub cpu: CpuInfo,
    pub memory_total_bytes: Option<u64>,
    pub memory_modules: Vec<MemoryModule>,
    pub os: OsInfo,
    pub motherboard: BoardInfo,
    pub system: BoardInfo,
    pub gpus: Vec<GpuInfo>,
    /// "Name · driver version" per display adapter.
    pub gpu_drivers: Vec<String>,
    pub network_adapters: Vec<AdapterInfo>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CpuInfo {
    pub brand: Option<String>,
    pub vendor: Option<String>,
    pub architecture: String,
    pub physical_cores: Option<usize>,
    pub logical_processors: usize,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OsInfo {
    pub name: Option<String>,
    pub version: Option<String>,
    pub long_version: Option<String>,
    pub kernel: Option<String>,
    pub host_name: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BoardInfo {
    pub vendor: Option<String>,
    pub name: Option<String>,
    pub version: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GpuInfo {
    pub model: Option<String>,
    pub vendor: Option<String>,
    pub vram_total_bytes: Option<u64>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AdapterInfo {
    pub name: String,
    pub mac: String,
}

fn non_empty(s: &str) -> Option<String> {
    let t = s.trim();
    (!t.is_empty()).then(|| t.to_owned())
}

pub fn collect() -> HardwareInfo {
    let sys = System::new_with_specifics(
        RefreshKind::nothing().with_cpu(CpuRefreshKind::nothing()).with_memory(MemoryRefreshKind::nothing().with_ram()),
    )
    .ok();
    let first_cpu = sys.as_ref().and_then(|s| s.cpus().first());
    let board = Motherboard::new().ok();

    HardwareInfo {
        cpu: CpuInfo {
            brand: first_cpu.and_then(|c| non_empty(c.brand())),
            vendor: first_cpu.and_then(|c| non_empty(c.vendor_id())),
            architecture: System::cpu_arch(),
            physical_cores: System::physical_core_count().ok(),
            logical_processors: sys.as_ref().map_or(0, |s| s.cpus().len()),
        },
        memory_total_bytes: sys.as_ref().map(|s| s.total_memory()).filter(|m| *m > 0),
        memory_modules: wmi_sources::memory_modules(),
        gpu_drivers: wmi_sources::gpu_drivers(),
        os: OsInfo {
            name: System::name().ok(),
            version: System::os_version().ok(),
            long_version: System::long_os_version().ok(),
            kernel: System::kernel_version().ok(),
            host_name: System::host_name().ok(),
        },
        motherboard: BoardInfo {
            vendor: board.as_ref().and_then(|b| b.vendor_name()),
            name: board.as_ref().and_then(|b| b.name()),
            version: board.as_ref().and_then(|b| b.version()),
        },
        system: BoardInfo {
            vendor: Product::vendor_name().ok(),
            name: Product::name().ok(),
            version: Product::version().ok(),
        },
        gpus: Gpus::new_with_refreshed_list()
            .map(|g| {
                g.iter()
                    .map(|x| GpuInfo {
                        model: x.model().map(str::to_owned),
                        vendor: x.vendor().map(str::to_owned),
                        vram_total_bytes: x.total_memory(),
                    })
                    .collect()
            })
            .unwrap_or_default(),
        network_adapters: Networks::new_with_refreshed_list()
            .map(|n| {
                let mut v: Vec<_> = n
                    .iter()
                    .map(|(name, d)| AdapterInfo { name: name.to_string_lossy().into_owned(), mac: d.mac_address().to_string() })
                    .collect();
                v.sort_by(|a, b| a.name.cmp(&b.name));
                v
            })
            .unwrap_or_default(),
    }
}
