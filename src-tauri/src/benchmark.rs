//! CPU load test: every logical core runs the same integer + floating-point workload for a fixed time.
//! The score is work units finished per second, so it only compares runs on the same build.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering::Relaxed};
use std::sync::Arc;
use std::time::{Duration, Instant};

#[derive(Default)]
pub struct BenchmarkState {
    pub cancel: Arc<AtomicBool>,
}

/// One unit of work: long enough that the loop and the shared counter cost nothing measurable.
fn work_unit(seed: u64) -> u64 {
    let mut x = seed | 1;
    let mut f = 1.0f64;
    for _ in 0..50_000 {
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        f = (f * 1.000_001 + (x & 0xff) as f64).sqrt();
    }
    x ^ f.to_bits()
}

/// Loads every logical core for `duration`; `None` if cancelled.
pub fn run_cpu(duration: Duration, cancel: &AtomicBool) -> Option<f64> {
    let threads = std::thread::available_parallelism().map_or(1, |n| n.get());
    let units = AtomicU64::new(0);
    let start = Instant::now();
    let deadline = start + duration;
    std::thread::scope(|s| {
        for t in 0..threads {
            let units = &units;
            s.spawn(move || {
                let mut seed = t as u64 + 1;
                while Instant::now() < deadline && !cancel.load(Relaxed) {
                    seed = std::hint::black_box(work_unit(seed));
                    units.fetch_add(1, Relaxed);
                }
            });
        }
    });
    (!cancel.load(Relaxed)).then(|| units.load(Relaxed) as f64 / start.elapsed().as_secs_f64())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scores_and_cancels() {
        let flag = AtomicBool::new(false);
        assert!(run_cpu(Duration::from_millis(200), &flag).unwrap() > 0.0);
        flag.store(true, Relaxed);
        assert_eq!(run_cpu(Duration::from_millis(200), &flag), None);
    }
}
