//! Internet speed test against Cloudflare's public speed endpoints (the ones speed.cloudflare.com uses).
//! Runs only when the user starts it. No IP address or other personal data is stored or shown.

use serde::Serialize;
use std::io::Read;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

const BASE: &str = "https://speed.cloudflare.com";
const PING_SAMPLES: usize = 12;
const TRANSFER_SECS: f64 = 10.0;
/// Ramp-up (TCP slow start) excluded from the final figure.
const WARMUP_SECS: f64 = 1.5;
const DOWNLOAD_STREAMS: usize = 6;
const UPLOAD_STREAMS: usize = 4;
const DOWNLOAD_CHUNK: u64 = 25_000_000;
/// Cloudflare rate-limits large downloads after repeated tests; chunks shrink down to this size.
const MIN_DOWNLOAD_CHUNK: u64 = 1_000_000;
const UPLOAD_CHUNK: u64 = 8_000_000;
const TICK: Duration = Duration::from_millis(200);

#[derive(Default)]
pub struct SpeedTestState {
    running: AtomicBool,
    cancel: Arc<AtomicBool>,
}

#[derive(Serialize, Clone, Copy, PartialEq, Debug)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    Connecting,
    Ping,
    Download,
    Upload,
    Done,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub phase: Option<Phase>,
    /// 0–1 across the whole test.
    pub progress: f64,
    pub ping_ms: Option<f64>,
    pub jitter_ms: Option<f64>,
    pub download_mbps: Option<f64>,
    pub upload_mbps: Option<f64>,
    /// Cloudflare data center code serving the test, e.g. "BUD".
    pub server: Option<String>,
}

/// Median of samples (ms). `None` for no samples.
pub fn median(samples: &[f64]) -> Option<f64> {
    if samples.is_empty() {
        return None;
    }
    let mut s = samples.to_vec();
    s.sort_by(|a, b| a.total_cmp(b));
    let m = s.len() / 2;
    Some(if s.len() % 2 == 0 { (s[m - 1] + s[m]) / 2.0 } else { s[m] })
}

/// Jitter = mean absolute difference between consecutive samples (as speed test sites report it).
pub fn jitter(samples: &[f64]) -> Option<f64> {
    (samples.len() >= 2).then(|| samples.windows(2).map(|w| (w[1] - w[0]).abs()).sum::<f64>() / (samples.len() - 1) as f64)
}

/// Mean after dropping the lowest `low` and highest `high` fractions of samples.
/// Same idea as Speedtest.net: stream restarts cause short dips that should not define the result.
pub fn trimmed_mean(samples: &[f64], low: f64, high: f64) -> Option<f64> {
    let mut s: Vec<f64> = samples.iter().copied().filter(|v| v.is_finite()).collect();
    s.sort_by(|a, b| a.total_cmp(b));
    let (from, to) = ((s.len() as f64 * low) as usize, s.len() - (s.len() as f64 * high) as usize);
    let kept = s.get(from..to).filter(|k| !k.is_empty())?;
    Some(kept.iter().sum::<f64>() / kept.len() as f64)
}

pub fn mbps(bytes: u64, secs: f64) -> f64 {
    if secs <= 0.0 { 0.0 } else { bytes as f64 * 8.0 / 1_000_000.0 / secs }
}

fn agent() -> ureq::Agent {
    ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(30)))
        // Statuses are inspected by hand so a 429 can be handled (smaller chunks / Retry-After).
        .http_status_as_error(false)
        .build()
        .into()
}

/// Data center code from Cloudflare's trace endpoint (only the `colo=` line is read).
fn server(agent: &ureq::Agent) -> Option<String> {
    let text = agent.get(&format!("{BASE}/cdn-cgi/trace")).call().ok()?.body_mut().read_to_string().ok()?;
    text.lines().find_map(|l| l.strip_prefix("colo=")).map(str::to_owned)
}

fn measure_ping(agent: &ureq::Agent, cancel: &AtomicBool) -> Result<Vec<f64>, String> {
    let url = format!("{BASE}/__down?bytes=0");
    let mut samples = Vec::with_capacity(PING_SAMPLES);
    for i in 0..=PING_SAMPLES {
        if cancel.load(Ordering::Relaxed) {
            return Err("cancelled".into());
        }
        let start = Instant::now();
        let mut resp = agent.get(&url).call().map_err(|e| format!("Ping failed: {e}"))?;
        if !resp.status().is_success() {
            return Err(format!("Ping failed: server answered HTTP {}", resp.status().as_u16()));
        }
        let _ = resp.body_mut().read_to_vec();
        // The first request includes DNS + TLS handshake; it is not a ping.
        if i > 0 {
            samples.push(start.elapsed().as_secs_f64() * 1000.0);
        }
    }
    Ok(samples)
}

/// Upload body that counts bytes as the HTTP client reads them, and ends early when told to stop.
struct CountingZeros {
    left: u64,
    counter: Arc<AtomicU64>,
    stop: Arc<AtomicBool>,
}

impl Read for CountingZeros {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        if self.left == 0 || self.stop.load(Ordering::Relaxed) {
            return Ok(0);
        }
        let n = buf.len().min(self.left as usize).min(64 * 1024);
        buf[..n].fill(0);
        self.left -= n as u64;
        self.counter.fetch_add(n as u64, Ordering::Relaxed);
        Ok(n)
    }
}

/// Runs `streams` worker loops for TRANSFER_SECS, reporting live Mbps; returns steady-state Mbps.
fn transfer(
    emit: &mut dyn FnMut(&Progress),
    progress: &mut Progress,
    cancel: &Arc<AtomicBool>,
    upload: bool,
    progress_range: (f64, f64),
) -> Result<f64, String> {
    let counter = Arc::new(AtomicU64::new(0));
    let stop = Arc::new(AtomicBool::new(false));
    let chunk = Arc::new(AtomicU64::new(DOWNLOAD_CHUNK));
    // Seconds from the server's Retry-After once even the smallest chunk is refused (0 = not limited).
    let retry_after = Arc::new(AtomicU64::new(0));
    let workers: Vec<_> = (0..if upload { UPLOAD_STREAMS } else { DOWNLOAD_STREAMS })
        .map(|_| {
            let (counter, stop, agent) = (counter.clone(), stop.clone(), agent());
            let (chunk, retry_after) = (chunk.clone(), retry_after.clone());
            std::thread::spawn(move || {
                let mut buf = vec![0u8; 64 * 1024];
                let limited = |resp: &ureq::http::Response<ureq::Body>, shrink: bool| {
                    let secs = resp.headers().get("retry-after").and_then(|v| v.to_str().ok()?.parse().ok()).unwrap_or(60);
                    let cur = chunk.load(Ordering::Relaxed);
                    if shrink && cur > MIN_DOWNLOAD_CHUNK {
                        chunk.fetch_min((cur / 5).max(MIN_DOWNLOAD_CHUNK), Ordering::Relaxed);
                    } else {
                        retry_after.store(secs, Ordering::Relaxed);
                    }
                };
                while !stop.load(Ordering::Relaxed) {
                    let ok = if upload {
                        let body = CountingZeros { left: UPLOAD_CHUNK, counter: counter.clone(), stop: stop.clone() };
                        match agent.post(&format!("{BASE}/__up")).send(ureq::SendBody::from_owned_reader(body)) {
                            Ok(resp) if resp.status().as_u16() == 429 => {
                                limited(&resp, false);
                                false
                            }
                            Ok(resp) => resp.status().is_success(),
                            Err(_) => false,
                        }
                    } else {
                        let size = chunk.load(Ordering::Relaxed);
                        match agent.get(&format!("{BASE}/__down?bytes={size}")).call() {
                            Ok(resp) if resp.status().as_u16() == 429 => {
                                limited(&resp, true);
                                false
                            }
                            Ok(resp) if !resp.status().is_success() => false,
                            Ok(resp) => {
                                let mut reader = resp.into_body().into_reader();
                                while !stop.load(Ordering::Relaxed) {
                                    match reader.read(&mut buf) {
                                        Ok(0) | Err(_) => break,
                                        Ok(n) => {
                                            counter.fetch_add(n as u64, Ordering::Relaxed);
                                        }
                                    }
                                }
                                true
                            }
                            Err(_) => false,
                        }
                    };
                    if !ok {
                        // Back off briefly on errors instead of hammering the server.
                        std::thread::sleep(Duration::from_millis(300));
                    }
                }
            })
        })
        .collect();

    let start = Instant::now();
    let (mut last_bytes, mut last_t) = (0u64, 0.0f64);
    let mut steady = Vec::new();
    loop {
        std::thread::sleep(TICK);
        let t = start.elapsed().as_secs_f64();
        let bytes = counter.load(Ordering::Relaxed);
        let live = mbps(bytes - last_bytes, t - last_t);
        (last_bytes, last_t) = (bytes, t);
        if t >= WARMUP_SECS {
            steady.push(live);
        }
        if upload { progress.upload_mbps = Some(live) } else { progress.download_mbps = Some(live) }
        progress.progress = progress_range.0 + (progress_range.1 - progress_range.0) * (t / TRANSFER_SECS).min(1.0);
        emit(progress);
        if t >= TRANSFER_SECS || cancel.load(Ordering::Relaxed) {
            break;
        }
    }
    stop.store(true, Ordering::Relaxed);
    let end_bytes = counter.load(Ordering::Relaxed);
    for w in workers {
        let _ = w.join();
    }
    if cancel.load(Ordering::Relaxed) {
        return Err("cancelled".into());
    }
    if end_bytes == 0 {
        let wait = retry_after.load(Ordering::Relaxed);
        return Err(if wait > 0 {
            format!(
                "Cloudflare is temporarily limiting speed tests from your connection (too many runs in a short time). Try again in about {} min.",
                wait.div_ceil(60)
            )
        } else {
            format!("No data could be {}. Check your internet connection.", if upload { "uploaded" } else { "downloaded" })
        });
    }
    trimmed_mean(&steady, 0.3, 0.1).ok_or_else(|| "Test ended before a stable measurement".into())
}

pub fn run(state: &SpeedTestState, emit: &mut dyn FnMut(&Progress)) -> Result<Progress, String> {
    if state.running.swap(true, Ordering::SeqCst) {
        return Err("A speed test is already running".into());
    }
    state.cancel.store(false, Ordering::SeqCst);
    let result = run_inner(&state.cancel, emit);
    state.running.store(false, Ordering::SeqCst);
    result
}

fn run_inner(cancel: &Arc<AtomicBool>, emit: &mut dyn FnMut(&Progress)) -> Result<Progress, String> {
    let mut p = Progress { phase: Some(Phase::Connecting), ..Default::default() };
    emit(&p);
    let agent = agent();
    p.server = server(&agent);

    p.phase = Some(Phase::Ping);
    emit(&p);
    let samples = measure_ping(&agent, cancel)?;
    p.ping_ms = median(&samples);
    p.jitter_ms = jitter(&samples);
    p.progress = 0.1;
    emit(&p);

    p.phase = Some(Phase::Download);
    let down = transfer(emit, &mut p, cancel, false, (0.1, 0.55))?;
    p.download_mbps = Some(down);

    p.phase = Some(Phase::Upload);
    emit(&p);
    let up = transfer(emit, &mut p, cancel, true, (0.55, 1.0))?;
    p.upload_mbps = Some(up);

    p.phase = Some(Phase::Done);
    p.progress = 1.0;
    emit(&p);
    Ok(p)
}

pub fn cancel(state: &SpeedTestState) {
    state.cancel.store(true, Ordering::SeqCst);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn median_and_jitter() {
        assert_eq!(median(&[]), None);
        assert_eq!(median(&[30.0, 10.0, 20.0]), Some(20.0));
        assert_eq!(median(&[10.0, 20.0, 30.0, 40.0]), Some(25.0));
        assert_eq!(jitter(&[10.0]), None);
        assert_eq!(jitter(&[10.0, 14.0, 12.0]), Some(3.0));
    }

    #[test]
    fn trimmed_mean_drops_dips_and_spikes() {
        assert_eq!(trimmed_mean(&[], 0.3, 0.1), None);
        // 10 samples: drop 3 lowest (dips) and 1 highest (spike).
        let s = [10.0, 20.0, 30.0, 300.0, 300.0, 300.0, 300.0, 300.0, 300.0, 9000.0];
        assert_eq!(trimmed_mean(&s, 0.3, 0.1), Some(300.0));
        assert_eq!(trimmed_mean(&[42.0], 0.3, 0.1), Some(42.0));
    }

    #[test]
    fn mbps_from_bytes() {
        assert_eq!(mbps(12_500_000, 1.0), 100.0);
        assert_eq!(mbps(1000, 0.0), 0.0);
    }

    /// Live network check: `cargo test speedtest_live -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn speedtest_live() {
        let state = SpeedTestState::default();
        let mut ticks = 0;
        let r = run(&state, &mut |_| ticks += 1).expect("speed test");
        println!(
            "server {:?} ping {:.1?} ms jitter {:.1?} ms down {:.1?} Mbps up {:.1?} Mbps ({ticks} progress events)",
            r.server, r.ping_ms, r.jitter_ms, r.download_mbps, r.upload_mbps
        );
        assert!(r.download_mbps.unwrap() > 0.0 && r.upload_mbps.unwrap() > 0.0);
    }

    #[test]
    fn upload_body_counts_and_stops() {
        let counter = Arc::new(AtomicU64::new(0));
        let stop = Arc::new(AtomicBool::new(false));
        let mut body = CountingZeros { left: 100_000, counter: counter.clone(), stop: stop.clone() };
        let mut buf = vec![1u8; 70_000];
        assert_eq!(body.read(&mut buf).unwrap(), 65_536);
        assert!(buf[..65_536].iter().all(|b| *b == 0));
        stop.store(true, Ordering::Relaxed);
        assert_eq!(body.read(&mut buf).unwrap(), 0);
        assert_eq!(counter.load(Ordering::Relaxed), 65_536);
    }
}
