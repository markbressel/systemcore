use windows::Win32::System::ProcessStatus::{GetPerformanceInfo, PERFORMANCE_INFORMATION};

/// Commit charge: (committed bytes, commit limit bytes) — Task Manager's "Committed" figure.
pub fn commit() -> Option<(u64, u64)> {
    let mut info = PERFORMANCE_INFORMATION { cb: std::mem::size_of::<PERFORMANCE_INFORMATION>() as u32, ..Default::default() };
    unsafe { GetPerformanceInfo(&mut info, info.cb) }.ok()?;
    let page = info.PageSize as u64;
    Some((info.CommitTotal as u64 * page, info.CommitLimit as u64 * page))
}
