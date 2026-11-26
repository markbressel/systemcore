//! Windows power plan switching through `powercfg` (no console window).

use std::os::windows::process::CommandExt;
use std::process::Command;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
/// Built-in "High performance" plan. Some laptops (Modern Standby) hide it; switching then just fails.
pub const HIGH_PERFORMANCE: &str = "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c";

fn powercfg(args: &[&str]) -> Option<String> {
    let out = Command::new("powercfg").args(args).creation_flags(CREATE_NO_WINDOW).output().ok()?;
    out.status.success().then(|| String::from_utf8_lossy(&out.stdout).into_owned())
}

/// GUID from `powercfg /getactivescheme` output ("Power Scheme GUID: <guid>  (Balanced)"), any language.
pub fn parse_scheme(out: &str) -> Option<String> {
    out.split_whitespace().find(|w| w.len() == 36 && w.matches('-').count() == 4).map(str::to_lowercase)
}

pub fn active_scheme() -> Option<String> {
    parse_scheme(&powercfg(&["/getactivescheme"])?)
}

pub fn set_scheme(guid: &str) -> bool {
    powercfg(&["/setactive", guid]).is_some()
}

#[cfg(test)]
mod tests {
    #[test]
    fn parses_scheme_guid() {
        let out = "Power Scheme GUID: 381b4222-f694-41f0-9685-ff5bb260df2e  (Balanced)\r\n";
        assert_eq!(super::parse_scheme(out).as_deref(), Some("381b4222-f694-41f0-9685-ff5bb260df2e"));
        assert_eq!(super::parse_scheme("Energiaséma GUID-ja: 8C5E7FDA-E8BF-4A96-9A85-A6E23A8C635C (Nagy teljesítmény)").as_deref(), Some(super::HIGH_PERFORMANCE));
        assert_eq!(super::parse_scheme("error"), None);
    }
}
