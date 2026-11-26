//! 24 h of telemetry in memory (one point every 5 s), downsampled on request for the History page.
//! shortcut: memory only, lost when SystemCore quits; persist to disk if users want history across restarts.

use serde::Serialize;
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

/// Collector ticks (seconds) between stored points.
pub const EVERY_TICKS: u64 = 5;
const KEEP: usize = 24 * 3600 / EVERY_TICKS as usize;

#[derive(Serialize, Clone, Copy, Default, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Point {
    /// Unix epoch ms.
    pub t: u64,
    pub cpu: Option<f32>,
    pub cpu_temp: Option<f32>,
    pub gpu: Option<f32>,
    pub gpu_temp: Option<f32>,
    pub ram: Option<f32>,
    pub rx: Option<f32>,
    pub tx: Option<f32>,
    pub ping: Option<f32>,
    pub fps: Option<f32>,
}

pub type SharedHistory = Arc<Mutex<VecDeque<Point>>>;

pub fn push(h: &SharedHistory, p: Point) {
    if let Ok(mut q) = h.lock() {
        if q.len() == KEEP {
            q.pop_front();
        }
        q.push_back(p);
    }
}

fn avg(it: impl Iterator<Item = Option<f32>>) -> Option<f32> {
    let v: Vec<f32> = it.flatten().collect();
    (!v.is_empty()).then(|| v.iter().sum::<f32>() / v.len() as f32)
}

fn max(it: impl Iterator<Item = Option<f32>>) -> Option<f32> {
    it.flatten().reduce(f32::max)
}

/// `slots` equal time buckets from `since_ms` to `now_ms` (oldest first). Loads and rates are averaged;
/// temperatures keep the bucket's peak so a short spike is not averaged away. Buckets without data
/// have every value `None`, which the chart draws as a gap.
pub fn query(q: &VecDeque<Point>, since_ms: u64, now_ms: u64, slots: usize) -> Vec<Point> {
    let slots = slots.max(1);
    let width = (now_ms.saturating_sub(since_ms) / slots as u64).max(1);
    let mut buckets: Vec<Vec<&Point>> = vec![vec![]; slots];
    for p in q.iter().filter(|p| p.t >= since_ms && p.t <= now_ms) {
        let i = (((p.t - since_ms) / width) as usize).min(slots - 1);
        buckets[i].push(p);
    }
    buckets
        .iter()
        .enumerate()
        .map(|(i, c)| Point {
            t: since_ms + (i as u64 + 1) * width,
            cpu: avg(c.iter().map(|p| p.cpu)),
            cpu_temp: max(c.iter().map(|p| p.cpu_temp)),
            gpu: avg(c.iter().map(|p| p.gpu)),
            gpu_temp: max(c.iter().map(|p| p.gpu_temp)),
            ram: avg(c.iter().map(|p| p.ram)),
            rx: avg(c.iter().map(|p| p.rx)),
            tx: avg(c.iter().map(|p| p.tx)),
            ping: avg(c.iter().map(|p| p.ping)),
            fps: avg(c.iter().map(|p| p.fps)),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn downsamples_with_avg_load_and_peak_temp() {
        let q: VecDeque<Point> = (0..10)
            .map(|i| Point { t: i * 1000, cpu: Some(i as f32), cpu_temp: Some(if i == 3 { 95.0 } else { 50.0 }), ..Default::default() })
            .collect();
        // 0..10 s in two 5 s buckets: points 0-4 and 5-9.
        let out = query(&q, 0, 10_000, 2);
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].t, 5000);
        assert_eq!(out[0].cpu, Some(2.0));
        assert_eq!(out[0].cpu_temp, Some(95.0));
        assert_eq!(out[1].cpu_temp, Some(50.0));
        assert_eq!(out[0].gpu, None);
        // Time with no samples becomes empty buckets (a gap), not a shorter list.
        let gap = query(&q, 0, 40_000, 4);
        assert_eq!(gap.len(), 4);
        assert!(gap[1].cpu.is_some() || gap[0].cpu.is_some());
        assert_eq!(gap[3].cpu, None);
    }
}
