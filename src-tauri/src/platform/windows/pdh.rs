//! Windows performance counters (PDH): the same source Task Manager uses for
//! effective CPU clock and per-adapter GPU memory.

use std::collections::HashMap;
use windows::core::HSTRING;
use windows::Win32::System::Performance::{
    PdhAddEnglishCounterW, PdhCloseQuery, PdhCollectQueryData, PdhGetFormattedCounterArrayW, PdhGetFormattedCounterValue,
    PDH_FMT, PDH_FMT_COUNTERVALUE, PDH_FMT_COUNTERVALUE_ITEM_W, PDH_FMT_DOUBLE, PDH_HCOUNTER, PDH_HQUERY, PDH_MORE_DATA,
    PdhOpenQueryW,
};

const OK: u32 = 0;
// "% Processor Performance" legitimately exceeds 100 when boosting.
const FMT: PDH_FMT = PDH_FMT(PDH_FMT_DOUBLE.0 | 0x8000 /* PDH_FMT_NOCAP100 */);

pub struct Pdh {
    query: PDH_HQUERY,
    cpu_performance: Option<PDH_HCOUNTER>,
    cpu_base_mhz: Option<PDH_HCOUNTER>,
    gpu_dedicated: Option<PDH_HCOUNTER>,
    gpu_shared: Option<PDH_HCOUNTER>,
}

/// GPU memory in use for the busiest adapter (by dedicated usage), in bytes.
pub struct GpuMemory {
    pub dedicated: u64,
    pub shared: u64,
}

impl Pdh {
    pub fn new() -> Option<Self> {
        let mut query = PDH_HQUERY::default();
        if unsafe { PdhOpenQueryW(None, 0, &mut query) } != OK {
            return None;
        }
        let add = |path: &str| {
            let mut counter = PDH_HCOUNTER::default();
            (unsafe { PdhAddEnglishCounterW(query, &HSTRING::from(path), 0, &mut counter) } == OK).then_some(counter)
        };
        let pdh = Self {
            query,
            cpu_performance: add(r"\Processor Information(_Total)\% Processor Performance"),
            cpu_base_mhz: add(r"\Processor Information(_Total)\Processor Frequency"),
            gpu_dedicated: add(r"\GPU Adapter Memory(*)\Dedicated Usage"),
            gpu_shared: add(r"\GPU Adapter Memory(*)\Shared Usage"),
        };
        // Rate counters need a baseline sample.
        pdh.collect();
        Some(pdh)
    }

    pub fn collect(&self) -> bool {
        unsafe { PdhCollectQueryData(self.query) == OK }
    }

    fn value(counter: Option<PDH_HCOUNTER>) -> Option<f64> {
        let mut v = PDH_FMT_COUNTERVALUE::default();
        let ok = unsafe { PdhGetFormattedCounterValue(counter?, FMT, None, &mut v) } == OK && v.CStatus == OK;
        ok.then(|| unsafe { v.Anonymous.doubleValue }).filter(|x| x.is_finite())
    }

    fn array(counter: Option<PDH_HCOUNTER>) -> Vec<(String, f64)> {
        let Some(counter) = counter else { return vec![] };
        let (mut size, mut count) = (0u32, 0u32);
        if unsafe { PdhGetFormattedCounterArrayW(counter, FMT, &mut size, &mut count, None) } != PDH_MORE_DATA {
            return vec![];
        }
        // Items are followed by their name strings in the same buffer; allocate with item alignment.
        let item = std::mem::size_of::<PDH_FMT_COUNTERVALUE_ITEM_W>();
        let mut buf: Vec<PDH_FMT_COUNTERVALUE_ITEM_W> = Vec::with_capacity((size as usize).div_ceil(item));
        if unsafe { PdhGetFormattedCounterArrayW(counter, FMT, &mut size, &mut count, Some(buf.as_mut_ptr())) } != OK {
            return vec![];
        }
        unsafe { buf.set_len(count as usize) };
        buf.iter()
            .filter(|i| i.FmtValue.CStatus == OK)
            .map(|i| (unsafe { i.szName.to_string() }.unwrap_or_default(), unsafe { i.FmtValue.Anonymous.doubleValue }))
            .collect()
    }

    /// (effective MHz, base MHz). Effective = base × "% Processor Performance", which is what Task Manager shows.
    pub fn cpu_frequency(&self) -> (Option<u64>, Option<u64>) {
        let base = Self::value(self.cpu_base_mhz).filter(|b| *b > 0.0);
        let perf = Self::value(self.cpu_performance).filter(|p| *p > 0.0);
        let effective = base.zip(perf).map(|(b, p)| (b * p / 100.0).round() as u64);
        (effective, base.map(|b| b as u64))
    }

    /// Memory of the adapter with the most dedicated memory in use (instances are per LUID/physical part).
    pub fn gpu_memory(&self) -> Option<GpuMemory> {
        let luid = |name: &str| name.rsplit_once("_phys").map_or(name, |(l, _)| l).to_owned();
        let mut per: HashMap<String, GpuMemory> = HashMap::new();
        for (name, v) in Self::array(self.gpu_dedicated) {
            per.entry(luid(&name)).or_insert(GpuMemory { dedicated: 0, shared: 0 }).dedicated += v as u64;
        }
        for (name, v) in Self::array(self.gpu_shared) {
            per.entry(luid(&name)).or_insert(GpuMemory { dedicated: 0, shared: 0 }).shared += v as u64;
        }
        per.into_values().filter(|g| g.dedicated > 0).max_by_key(|g| g.dedicated)
    }
}

impl Drop for Pdh {
    fn drop(&mut self) {
        unsafe { PdhCloseQuery(self.query) };
    }
}
