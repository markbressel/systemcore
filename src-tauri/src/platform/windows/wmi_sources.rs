//! WMI-based sources. All run without administrator rights.

use serde::Deserialize;
use std::collections::HashMap;
use wmi::WMIConnection;

/// CPU temperature published by LibreHardwareMonitor (when it is running) under ROOT\LibreHardwareMonitor.
/// Windows exposes no CPU die temperature to user-mode apps on most desktops (Ryzen in particular),
/// and reading it directly needs a kernel driver — which SystemCore deliberately does not install.
pub fn lhm_cpu_temperature() -> Option<f32> {
    #[derive(Deserialize)]
    #[serde(rename_all = "PascalCase")]
    struct Sensor {
        name: String,
        value: f32,
        parent: String,
    }
    let con = WMIConnection::with_namespace_path(r"ROOT\LibreHardwareMonitor").ok()?;
    let sensors: Vec<Sensor> = con
        .raw_query("SELECT Name, Value, Parent FROM Sensor WHERE SensorType = 'Temperature'")
        .ok()?;
    let cpu: Vec<&Sensor> = sensors.iter().filter(|s| s.parent.contains("cpu") && s.value.is_finite() && s.value > 0.0).collect();
    // Prefer the package / control temperature; fall back to the hottest CPU sensor.
    const PREFERRED: [&str; 4] = ["Core (Tctl/Tdie)", "CPU Package", "Core (Tdie)", "Core (Tctl)"];
    PREFERRED
        .iter()
        .find_map(|p| cpu.iter().find(|s| s.name == *p).map(|s| s.value))
        .or_else(|| cpu.iter().map(|s| s.value).reduce(f32::max))
}

pub struct DiskHealth {
    pub health: &'static str,
    pub media: Option<&'static str>,
    pub model: Option<String>,
}

/// Drive letter (e.g. "C") → health/media type of the physical disk behind it (Storage Management API).
pub fn disk_health() -> HashMap<String, DiskHealth> {
    #[derive(Deserialize)]
    #[serde(rename_all = "PascalCase")]
    struct Partition {
        drive_letter: Option<String>,
        disk_number: Option<u32>,
    }
    #[derive(Deserialize)]
    #[serde(rename_all = "PascalCase")]
    struct PhysicalDisk {
        device_id: Option<String>,
        media_type: Option<u16>,
        health_status: Option<u16>,
        friendly_name: Option<String>,
        spindle_speed: Option<u32>,
    }
    let Ok(con) = WMIConnection::with_namespace_path(r"ROOT\Microsoft\Windows\Storage") else { return HashMap::new() };
    let parts: Vec<Partition> = con.raw_query("SELECT DriveLetter, DiskNumber FROM MSFT_Partition").unwrap_or_default();
    let disks: Vec<PhysicalDisk> =
        con.raw_query("SELECT DeviceId, MediaType, HealthStatus, FriendlyName, SpindleSpeed FROM MSFT_PhysicalDisk").unwrap_or_default();

    parts
        .into_iter()
        .filter_map(|p| {
            let letter = p.drive_letter?.chars().next().filter(|c| c.is_ascii_alphabetic())?;
            let number = p.disk_number?.to_string();
            let disk = disks.iter().find(|d| d.device_id.as_deref() == Some(number.as_str()))?;
            let health = match disk.health_status {
                Some(0) => "Healthy",
                Some(1) => "Warning",
                Some(2) => "Unhealthy",
                _ => "Unknown",
            };
            let media = match disk.media_type {
                Some(3) => Some("HDD"),
                Some(4) => Some("SSD"),
                Some(5) => Some("SCM"),
                // Older drives report "unspecified"; a real spindle speed (not 0 / unknown 0xFFFFFFFF) means HDD.
                _ => disk.spindle_speed.filter(|s| *s > 0 && *s != u32::MAX).map(|_| "HDD"),
            };
            Some((letter.to_string(), DiskHealth { health, media, model: disk.friendly_name.clone() }))
        })
        .collect()
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MemoryModule {
    pub slot: Option<String>,
    pub capacity_bytes: Option<u64>,
    pub speed_mts: Option<u32>,
    pub configured_speed_mts: Option<u32>,
    pub kind: Option<&'static str>,
    pub manufacturer: Option<String>,
    pub part_number: Option<String>,
}

/// Installed RAM modules (SMBIOS via Win32_PhysicalMemory). Serial numbers are not read.
pub fn memory_modules() -> Vec<MemoryModule> {
    #[derive(Deserialize)]
    #[serde(rename_all = "PascalCase")]
    struct Module {
        device_locator: Option<String>,
        capacity: Option<u64>,
        speed: Option<u32>,
        configured_clock_speed: Option<u32>,
        #[serde(rename = "SMBIOSMemoryType")]
        smbios_memory_type: Option<u32>,
        manufacturer: Option<String>,
        part_number: Option<String>,
    }
    let Ok(con) = WMIConnection::new() else { return vec![] };
    let rows: Vec<Module> = con
        .raw_query("SELECT DeviceLocator, Capacity, Speed, ConfiguredClockSpeed, SMBIOSMemoryType, Manufacturer, PartNumber FROM Win32_PhysicalMemory")
        .unwrap_or_default();
    let clean = |s: Option<String>| s.map(|x| x.trim().to_owned()).filter(|x| !x.is_empty() && x != "Unknown");
    rows.into_iter()
        .map(|m| MemoryModule {
            slot: clean(m.device_locator),
            capacity_bytes: m.capacity.filter(|c| *c > 0),
            speed_mts: m.speed.filter(|s| *s > 0),
            configured_speed_mts: m.configured_clock_speed.filter(|s| *s > 0),
            kind: match m.smbios_memory_type {
                Some(24) => Some("DDR3"),
                Some(26) => Some("DDR4"),
                Some(34) => Some("DDR5"),
                _ => None,
            },
            manufacturer: clean(m.manufacturer),
            part_number: clean(m.part_number),
        })
        .collect()
}
