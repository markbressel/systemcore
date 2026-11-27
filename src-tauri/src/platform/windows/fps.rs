//! Frame rate from ETW present events (the PresentMon approach, simplified): every Present call of a
//! process is one frame. Real-time ETW sessions need administrator rights (or Performance Log Users).

use ferrisetw::parser::{Parser, Pointer};
use ferrisetw::provider::Provider;
use ferrisetw::trace::{stop_trace_by_name, TraceTrait, UserTrace};
use ferrisetw::{EventRecord, SchemaLocator};
use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};

const SESSION: &str = "SystemCore-FPS";
const WINDOW_NS: i64 = 10_000_000_000;
const MAX_FRAMES: usize = 20_000;
/// A process that has not presented for this long is not rendering any more.
const IDLE_NS: i64 = 2_500_000_000;

// Provider GUIDs and Present event ids, from the providers' manifests (`wevtutil gp <name> /ge`).
const DXGI: &str = "ca11c036-0102-4a2d-a6ad-f03cfed5d3c9"; // Present start = 42
const D3D9: &str = "783aca0a-790e-4d7f-8451-aa850511c6b9"; // Present start = 1
const DXGKRNL: &str = "802ec45a-1e99-4b83-9920-87c98277ba9d"; // Present = 184, keyword Present = 0x8000000

/// Where a present was seen. API presents (D3D9 / DXGI) are one per frame the game submits; kernel
/// presents cover Vulkan / OpenGL but repeat DXGI frames too, so they are only a fallback.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
enum Source {
    Api,
    Kernel,
}

/// One queue per (source, provider, swap chain). The same frame can be reported by two layers (a D3D9
/// game also fires DXGI events) and a game can own several swap chains, so adding every event up would
/// double the FPS. Instead the single busiest queue is the game's frame rate.
#[derive(Default)]
struct Frames {
    queues: HashMap<(Source, u8, usize), VecDeque<i64>>,
}

impl Frames {
    fn push(&mut self, key: (Source, u8, usize), t: i64) {
        let q = self.queues.entry(key).or_default();
        q.push_back(t);
        while q.len() > MAX_FRAMES || q.front().is_some_and(|f| *f < t - WINDOW_NS) {
            q.pop_front();
        }
    }

    fn last(&self) -> Option<i64> {
        self.queues.values().filter_map(|q| q.back().copied()).max()
    }

    /// The busiest queue (most presents in the last second) among those still rendering,
    /// preferring API presents over the kernel fallback.
    fn pick(&self, now: i64) -> Option<&VecDeque<i64>> {
        let recent = |q: &VecDeque<i64>| q.iter().rev().take_while(|t| **t >= now - 1_000_000_000).count();
        [Source::Api, Source::Kernel].into_iter().find_map(|src| {
            self.queues
                .iter()
                .filter(|((s, _, _), q)| *s == src && q.back().is_some_and(|t| *t > now - IDLE_NS))
                .max_by_key(|(_, q)| recent(q))
                .map(|(_, q)| q)
        })
    }
}

type Shared = Arc<Mutex<HashMap<u32, Frames>>>;

#[derive(Debug, PartialEq)]
pub struct FrameStats {
    pub fps: f32,
    pub frame_time_ms: f32,
    pub low1_fps: f32,
}

/// Stats from present timestamps (ns, ascending): FPS and frame time over the last second,
/// 1 % low over everything given (average of the slowest 1 % of frame intervals).
pub fn frame_stats(ts: &[i64]) -> Option<FrameStats> {
    let last = *ts.last()?;
    let recent: Vec<_> = ts.iter().filter(|t| **t >= last - 1_000_000_000).collect();
    if recent.len() < 2 {
        return None;
    }
    let avg_ns = (last - *recent[0]) as f64 / (recent.len() - 1) as f64;
    let mut gaps: Vec<i64> = ts.windows(2).map(|w| w[1] - w[0]).collect();
    gaps.sort_unstable_by(|a, b| b.cmp(a));
    let n = (gaps.len() / 100).max(1);
    let slow_ns = gaps[..n].iter().sum::<i64>() as f64 / n as f64;
    Some(FrameStats { fps: (1e9 / avg_ns) as f32, frame_time_ms: (avg_ns / 1e6) as f32, low1_fps: (1e9 / slow_ns) as f32 })
}

pub struct Fps {
    frames: Shared,
    _trace: UserTrace,
}

/// `id` tells providers apart; `chain_field` names the swap chain pointer in the event payload
/// (field names as PresentMon reads them), `None` for the kernel provider.
fn provider(frames: &Shared, guid: &str, id: u8, event: u16, chain_field: Option<&'static str>, keywords: Option<u64>) -> Provider {
    let f = frames.clone();
    let source = if chain_field.is_some() { Source::Api } else { Source::Kernel };
    let b = Provider::by_guid(guid).add_callback(move |r: &EventRecord, locator: &SchemaLocator| {
        if r.event_id() != event {
            return;
        }
        let chain = chain_field
            .and_then(|name| locator.event_schema(r).ok().and_then(|s| Parser::create(r, &s).try_parse::<Pointer>(name).ok()))
            .map_or(0, |p| *p);
        // FILETIME (100 ns since 1601) to Unix ns, to compare with the wall clock.
        let t = (r.raw_timestamp() - 116_444_736_000_000_000) * 100;
        if let Ok(mut m) = f.lock() {
            m.entry(r.process_id()).or_default().push((source, id, chain), t);
        }
    });
    match keywords {
        Some(k) => b.any(k).build(),
        None => b.build(),
    }
}

impl Fps {
    pub fn start() -> Result<Self, String> {
        // A crashed run can leave the session behind, and a second session with the same name fails.
        let _ = stop_trace_by_name(SESSION);
        let frames: Shared = Default::default();
        let (trace, handle) = UserTrace::new()
            .named(SESSION.into())
            .enable(provider(&frames, DXGI, 1, 42, Some("pIDXGISwapChain"), None))
            .enable(provider(&frames, D3D9, 2, 1, Some("pSwapchain"), None))
            .enable(provider(&frames, DXGKRNL, 3, 184, None, Some(0x800_0000)))
            .start()
            .map_err(|e| format!("{e:?}"))?;
        std::thread::Builder::new()
            .name("etw-fps".into())
            .spawn(move || {
                let _ = UserTrace::process_from_handle(handle);
            })
            .map_err(|e| e.to_string())?;
        Ok(Self { frames, _trace: trace })
    }

    /// Frame stats for one process; `None` if it is not presenting frames.
    pub fn stats(&self, pid: u32) -> Option<FrameStats> {
        let now = crate::domain::now_ms() as i64 * 1_000_000;
        let mut m = self.frames.lock().ok()?;
        // Forget processes that stopped presenting (exited or minimized).
        m.retain(|_, f| f.last().is_some_and(|t| t > now - WINDOW_NS));
        let q = m.get(&pid)?.pick(now)?;
        frame_stats(&q.iter().copied().collect::<Vec<_>>())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn duplicate_layers_and_swap_chains_are_not_added_up() {
        let mut f = Frames::default();
        let now = 2_000_000_000;
        for i in 0..120 {
            let t = i * 16_666_667;
            // The same 60 fps frame seen by D3D9 and DXGI, plus a second swap chain, plus the kernel.
            f.push((Source::Api, 2, 0xA), t);
            f.push((Source::Api, 1, 0xB), t + 1000);
            f.push((Source::Api, 1, 0xC), t + 2000);
            f.push((Source::Kernel, 3, 0), t + 3000);
        }
        let q = f.pick(now).unwrap();
        let s = frame_stats(&q.iter().copied().collect::<Vec<_>>()).unwrap();
        assert!((s.fps - 60.0).abs() < 0.5, "{s:?}");
    }

    #[test]
    fn kernel_is_only_a_fallback() {
        let mut f = Frames::default();
        f.push((Source::Kernel, 3, 0), 1_000_000_000);
        f.push((Source::Kernel, 3, 0), 1_010_000_000);
        assert!(f.pick(1_100_000_000).is_some(), "Vulkan/OpenGL: kernel presents only");
        assert!(f.pick(10_000_000_000).is_none(), "stopped rendering");
    }

    #[test]
    fn steady_60_fps() {
        let ts: Vec<i64> = (0..600).map(|i| i * 16_666_667).collect();
        let s = frame_stats(&ts).unwrap();
        assert!((s.fps - 60.0).abs() < 0.5, "{s:?}");
        assert!((s.frame_time_ms - 16.67).abs() < 0.1);
        assert!((s.low1_fps - 60.0).abs() < 0.5);
    }

    #[test]
    fn stutter_shows_in_one_percent_low() {
        let mut ts: Vec<i64> = (0..300).map(|i| i * 10_000_000).collect(); // 100 fps
        for t in ts.iter_mut().skip(150) {
            *t += 90_000_000; // one 100 ms hitch
        }
        let s = frame_stats(&ts).unwrap();
        assert!((s.fps - 100.0).abs() < 1.0, "{s:?}");
        assert!(s.low1_fps < 20.0, "{s:?}");
    }

    #[test]
    fn too_few_frames() {
        assert_eq!(frame_stats(&[]), None);
        assert_eq!(frame_stats(&[5]), None);
    }
}
