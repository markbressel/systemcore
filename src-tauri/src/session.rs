//! Game sessions: a fullscreen app in front for at least two minutes. Short alt-tabs do not end a
//! session; it ends when the app stays out of fullscreen focus for 30 s or another one takes over.

use crate::domain::GameSnapshot;
use serde::Serialize;

const GRACE_MS: u64 = 30_000;
const MIN_MS: u64 = 120_000;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GameSession {
    pub process: String,
    pub started_at: u64,
    pub ended_at: u64,
    pub avg_fps: Option<f32>,
    /// Average of the per-second 1 % lows.
    pub low1_fps: Option<f32>,
    pub cpu_max_temp_c: Option<f32>,
    pub gpu_max_temp_c: Option<f32>,
}

struct Running {
    process: String,
    pid: u32,
    started_at: u64,
    last_seen: u64,
    fps: (f32, u32),
    low1: (f32, u32),
    cpu_max: Option<f32>,
    gpu_max: Option<f32>,
}

impl Running {
    fn finish(self) -> Option<GameSession> {
        let avg = |(sum, n): (f32, u32)| (n > 0).then(|| sum / n as f32);
        (self.last_seen - self.started_at >= MIN_MS).then(|| GameSession {
            process: self.process,
            started_at: self.started_at,
            ended_at: self.last_seen,
            avg_fps: avg(self.fps),
            low1_fps: avg(self.low1),
            cpu_max_temp_c: self.cpu_max,
            gpu_max_temp_c: self.gpu_max,
        })
    }
}

fn max(a: Option<f32>, b: Option<f32>) -> Option<f32> {
    match (a, b) {
        (Some(x), Some(y)) => Some(x.max(y)),
        _ => a.or(b),
    }
}

#[derive(Default)]
pub struct SessionTracker {
    cur: Option<Running>,
}

impl SessionTracker {
    /// Feed one snapshot per tick; returns a session when one just ended.
    pub fn update(&mut self, now: u64, game: &GameSnapshot, cpu_temp: Option<f32>, gpu_temp: Option<f32>) -> Option<GameSession> {
        let playing = game.pid.filter(|_| game.fullscreen);
        let mut ended = None;
        if self.cur.as_ref().is_some_and(|c| Some(c.pid) != playing && (playing.is_some() || now - c.last_seen > GRACE_MS)) {
            ended = self.cur.take().and_then(Running::finish);
        }
        if let Some(pid) = playing {
            let c = self.cur.get_or_insert_with(|| Running {
                process: game.process.clone().unwrap_or_else(|| "Unknown app".into()),
                pid,
                started_at: now,
                last_seen: now,
                fps: (0.0, 0),
                low1: (0.0, 0),
                cpu_max: None,
                gpu_max: None,
            });
            c.last_seen = now;
            if let Some(f) = game.fps.value {
                c.fps = (c.fps.0 + f, c.fps.1 + 1);
            }
            if let Some(l) = game.low1_fps.value {
                c.low1 = (c.low1.0 + l, c.low1.1 + 1);
            }
            c.cpu_max = max(c.cpu_max, cpu_temp);
            c.gpu_max = max(c.gpu_max, gpu_temp);
        }
        ended
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{Metric, Status};

    fn game(pid: Option<u32>, fullscreen: bool, fps: Option<f32>) -> GameSnapshot {
        let m = |v: Option<f32>| Metric::from_option(v, "fps", "t", 0, Status::TemporarilyUnavailable);
        GameSnapshot { process: Some("game.exe".into()), pid, fullscreen, fps: m(fps), frame_time_ms: m(None), low1_fps: m(fps.map(|f| f / 2.0)) }
    }

    #[test]
    fn session_survives_alt_tab_and_reports_on_exit() {
        let mut t = SessionTracker::default();
        for s in 0..200 {
            assert_eq!(t.update(s * 1000, &game(Some(7), true, Some(100.0)), Some(70.0), None), None);
        }
        // 20 s alt-tab: still the same session.
        for s in 200..220 {
            assert_eq!(t.update(s * 1000, &game(Some(1), false, None), Some(50.0), None), None);
        }
        assert_eq!(t.update(220_000, &game(Some(7), true, Some(60.0)), Some(80.0), None), None);
        // Gone for good: ends after the grace period.
        let mut done = None;
        for s in 221..260 {
            done = done.or(t.update(s * 1000, &game(None, false, None), None, None));
        }
        let s = done.expect("session ended");
        assert_eq!(s.started_at, 0);
        assert_eq!(s.ended_at, 220_000);
        assert!((s.avg_fps.unwrap() - (200.0 * 100.0 + 60.0) / 201.0).abs() < 0.01);
        assert_eq!(s.cpu_max_temp_c, Some(80.0));
        assert_eq!(s.gpu_max_temp_c, None);
    }

    #[test]
    fn short_fullscreen_is_not_a_session() {
        let mut t = SessionTracker::default();
        for s in 0..60 {
            t.update(s * 1000, &game(Some(7), true, None), None, None);
        }
        assert_eq!(t.update(100_000, &game(None, false, None), None, None), None);
    }

    #[test]
    fn switching_games_ends_the_first() {
        let mut t = SessionTracker::default();
        for s in 0..150 {
            t.update(s * 1000, &game(Some(7), true, None), None, None);
        }
        assert!(t.update(150_000, &game(Some(8), true, None), None, None).is_some());
    }
}
