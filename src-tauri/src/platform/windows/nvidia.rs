//! NVIDIA sensors through NVML. `nvml.dll` ships with the NVIDIA driver and is loaded at runtime,
//! so systems without an NVIDIA GPU simply get `None` here.

use nvml_wrapper::bitmasks::device::ThrottleReasons;
use nvml_wrapper::enum_wrappers::device::{Clock, TemperatureSensor};
use nvml_wrapper::Nvml;

pub struct Nvidia {
    nvml: Nvml,
}

pub struct NvidiaReading {
    pub domain: u32,
    pub bus: u32,
    pub device: u32,
    pub temperature_c: Option<f32>,
    pub core_clock_mhz: Option<u64>,
    pub max_core_clock_mhz: Option<u64>,
    pub memory_clock_mhz: Option<u64>,
    pub power_watts: Option<f32>,
    pub fan_percent: Option<f32>,
    pub vram_used: Option<u64>,
    pub vram_total: Option<u64>,
    /// The driver is lowering clocks because the GPU is too hot.
    pub thermal_throttle: Option<bool>,
}

impl Nvidia {
    pub fn new() -> Option<Self> {
        Nvml::init().ok().map(|nvml| Self { nvml })
    }

    pub fn read(&self) -> Vec<NvidiaReading> {
        let count = self.nvml.device_count().unwrap_or(0);
        (0..count)
            .filter_map(|i| self.nvml.device_by_index(i).ok())
            .filter_map(|d| {
                let pci = d.pci_info().ok()?;
                let mem = d.memory_info().ok();
                Some(NvidiaReading {
                    domain: pci.domain,
                    bus: pci.bus,
                    device: pci.device,
                    temperature_c: d.temperature(TemperatureSensor::Gpu).ok().map(|t| t as f32),
                    core_clock_mhz: d.clock_info(Clock::Graphics).ok().map(u64::from),
                    max_core_clock_mhz: d.max_clock_info(Clock::Graphics).ok().map(u64::from).filter(|m| *m > 0),
                    memory_clock_mhz: d.clock_info(Clock::Memory).ok().map(u64::from),
                    power_watts: d.power_usage().ok().map(|mw| mw as f32 / 1000.0),
                    // Fanless / passively cooled boards report an error here.
                    fan_percent: d.fan_speed(0).ok().map(|p| p as f32),
                    vram_used: mem.as_ref().map(|m| m.used),
                    vram_total: mem.map(|m| m.total),
                    thermal_throttle: d
                        .current_throttle_reasons()
                        .ok()
                        .map(|r| r.intersects(ThrottleReasons::SW_THERMAL_SLOWDOWN | ThrottleReasons::HW_THERMAL_SLOWDOWN)),
                })
            })
            .collect()
    }
}
