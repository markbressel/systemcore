//! Windows-only adapters for data sysinfo does not provide.

pub mod memory;
pub mod nvidia;
pub mod pdh;
pub mod wmi_sources;

/// Manual hardware probe: `cargo test probe -- --ignored --nocapture`. Prints what each source returns here.
#[cfg(test)]
mod tests {
    #[test]
    #[ignore]
    fn probe() {
        let pdh = super::pdh::Pdh::new().expect("PDH query");
        std::thread::sleep(std::time::Duration::from_millis(1000));
        assert!(pdh.collect());
        println!("cpu freq (effective, base): {:?}", pdh.cpu_frequency());
        println!("gpu mem: {:?}", pdh.gpu_memory().map(|m| (m.dedicated, m.shared)));
        println!("commit: {:?}", super::memory::commit());
        if let Some(nv) = super::nvidia::Nvidia::new() {
            for r in nv.read() {
                println!("nvidia {:02x}:{:02x} temp {:?} core {:?} mem {:?} power {:?} fan {:?} vram {:?}/{:?}",
                    r.bus, r.device, r.temperature_c, r.core_clock_mhz, r.memory_clock_mhz, r.power_watts, r.fan_percent, r.vram_used, r.vram_total);
            }
        } else {
            println!("nvml: not available");
        }
        for (k, v) in super::wmi_sources::disk_health() {
            println!("disk {k}: {} {:?} {:?}", v.health, v.media, v.model);
        }
        for m in super::wmi_sources::memory_modules() {
            println!("dimm {:?} {:?} {:?}/{:?} {:?} {:?}", m.slot, m.capacity_bytes, m.speed_mts, m.configured_speed_mts, m.kind, m.part_number);
        }
        println!("lhm cpu temp: {:?}", super::wmi_sources::lhm_cpu_temperature());
    }
}
