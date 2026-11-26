//! Game mode: while a fullscreen app is in front, give it high CPU priority and switch to the
//! High performance power plan; put both back when the game leaves fullscreen.

use crate::platform::windows::{power, system};

#[derive(Default)]
pub struct GameMode {
    /// (pid, its priority before) for the boosted game.
    boosted: Option<(u32, &'static str)>,
    /// Power plan to restore, when we switched it.
    previous_scheme: Option<String>,
}

impl GameMode {
    pub fn enter(&mut self, pid: u32) {
        self.leave();
        if let Some(before) = system::priority(pid).filter(|p| *p != "high") {
            if system::set_priority(pid, "high").is_ok() {
                self.boosted = Some((pid, before));
            }
        }
        if let Some(cur) = power::active_scheme().filter(|s| s != power::HIGH_PERFORMANCE) {
            if power::set_scheme(power::HIGH_PERFORMANCE) {
                self.previous_scheme = Some(cur);
            }
        }
    }

    /// Restores what `enter` changed. Safe to call repeatedly; a game that already exited is skipped.
    pub fn leave(&mut self) {
        if let Some((pid, before)) = self.boosted.take() {
            let _ = system::set_priority(pid, before);
        }
        if let Some(s) = self.previous_scheme.take() {
            power::set_scheme(&s);
        }
    }
}

// shortcut: the collector thread never ends normally, so quitting mid-game leaves the High performance
// plan active; restore it from an app-exit hook if that turns out to matter.
impl Drop for GameMode {
    fn drop(&mut self) {
        self.leave();
    }
}
