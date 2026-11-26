//! Bytes received/sent per process from the Microsoft-Windows-Kernel-Network ETW provider.
//! Like FPS, real-time ETW sessions need administrator rights.

use ferrisetw::parser::Parser;
use ferrisetw::provider::Provider;
use ferrisetw::trace::{stop_trace_by_name, TraceTrait, UserTrace};
use ferrisetw::{EventRecord, SchemaLocator};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

const SESSION: &str = "SystemCore-Net";
const KERNEL_NETWORK: &str = "7dd42a49-5329-4832-8dfd-43d979153a88";

/// true = received, false = sent; TCP and UDP over IPv4 and IPv6 (event ids from the provider manifest).
pub fn direction(event_id: u16) -> Option<bool> {
    match event_id {
        11 | 27 | 43 | 59 => Some(true),
        10 | 26 | 42 | 58 => Some(false),
        _ => None,
    }
}

type Totals = Arc<Mutex<HashMap<u32, (u64, u64)>>>;

pub struct NetPerProcess {
    totals: Totals,
    _trace: UserTrace,
}

impl NetPerProcess {
    pub fn start() -> Result<Self, String> {
        // A crashed run can leave the session behind, and a second session with the same name fails.
        let _ = stop_trace_by_name(SESSION);
        let totals: Totals = Default::default();
        let t = totals.clone();
        let provider = Provider::by_guid(KERNEL_NETWORK)
            .add_callback(move |r: &EventRecord, locator: &SchemaLocator| {
                let Some(received) = direction(r.event_id()) else { return };
                let Ok(schema) = locator.event_schema(r) else { return };
                let p = Parser::create(r, &schema);
                // The payload PID is the owner; the header PID of receive events is whoever was running.
                let (Ok(pid), Ok(size)) = (p.try_parse::<u32>("PID"), p.try_parse::<u32>("size")) else { return };
                if let Ok(mut m) = t.lock() {
                    let e = m.entry(pid).or_default();
                    if received { e.0 += size as u64 } else { e.1 += size as u64 }
                }
            })
            .build();
        let (trace, handle) = UserTrace::new()
            .named(SESSION.into())
            .enable(provider)
            .start()
            .map_err(|e| format!("{e:?}"))?;
        std::thread::Builder::new()
            .name("etw-net".into())
            .spawn(move || {
                let _ = UserTrace::process_from_handle(handle);
            })
            .map_err(|e| e.to_string())?;
        Ok(Self { totals, _trace: trace })
    }

    /// Cumulative (received, sent) bytes per process since start. Forgets processes `alive` rejects.
    pub fn totals(&self, alive: impl Fn(u32) -> bool) -> HashMap<u32, (u64, u64)> {
        let Ok(mut m) = self.totals.lock() else { return HashMap::new() };
        m.retain(|pid, _| alive(*pid));
        m.clone()
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn send_and_receive_events() {
        assert_eq!(super::direction(11), Some(true));
        assert_eq!(super::direction(42), Some(false));
        assert_eq!(super::direction(12), None);
    }
}
