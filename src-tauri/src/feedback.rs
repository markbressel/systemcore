//! Bug reports and suggestions from the About page, sent in the background to Formspree, which e-mails them
//! to the developer. The form id is public by design (it can only deliver to the address set up on formspree.io),
//! so no password or token ships with the app.

use std::sync::Mutex;
use std::time::{Duration, Instant};

/// The id from the form's endpoint, https://formspree.io/f/<id>. Empty = sending is not set up yet.
const FORMSPREE_FORM: &str = "moedbgkv";
/// One message per minute, so a stuck button or a script cannot flood the inbox.
const MIN_GAP: Duration = Duration::from_secs(60);
static LAST_SENT: Mutex<Option<Instant>> = Mutex::new(None);

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Feedback {
    kind: String,
    title: String,
    message: String,
    /// One fact per line (version, Windows, CPU, ...); empty when the user leaves it out.
    system: String,
}

/// The JSON Formspree receives; `_subject` becomes the e-mail subject.
fn payload(f: &Feedback) -> Result<serde_json::Value, String> {
    let (title, message, system) = (f.title.trim(), f.message.trim(), f.system.trim());
    let kind = match f.kind.as_str() {
        "bug" => "Bug",
        "idea" => "Idea",
        _ => return Err("Unknown feedback type.".into()),
    };
    if title.chars().count() < 3 || message.chars().count() < 6 {
        return Err("Write a title and a short description first.".into());
    }
    if title.chars().count() > 120 || message.chars().count() > 4000 || system.chars().count() > 1000 {
        return Err("The message is too long.".into());
    }
    Ok(serde_json::json!({
        "_subject": format!("[SystemCore {kind}] {title}"),
        "type": kind,
        "title": title,
        "message": message,
        "system": system,
    }))
}

fn post(body: String) -> Result<(), String> {
    let agent: ureq::Agent = ureq::Agent::config_builder().timeout_global(Some(Duration::from_secs(20))).http_status_as_error(false).build().into();
    let mut resp = agent
        .post(&format!("https://formspree.io/f/{FORMSPREE_FORM}"))
        .header("Accept", "application/json")
        .header("Content-Type", "application/json")
        .send(body)
        .map_err(|e| format!("Could not reach the feedback service: {e}"))?;
    if resp.status().is_success() {
        return Ok(());
    }
    // Formspree explains refusals as {"errors":[{"message": "..."}]}.
    let text = resp.body_mut().read_to_string().unwrap_or_default();
    let reason = serde_json::from_str::<serde_json::Value>(&text).ok().and_then(|v| v["errors"][0]["message"].as_str().map(str::to_string));
    Err(format!("The feedback service refused the message: {}", reason.unwrap_or_else(|| resp.status().to_string())))
}

#[tauri::command]
pub async fn send_feedback(feedback: Feedback) -> Result<(), String> {
    if FORMSPREE_FORM.is_empty() {
        return Err("Sending feedback is not set up in this version yet.".into());
    }
    let body = payload(&feedback)?.to_string();
    {
        let mut last = LAST_SENT.lock().map_err(|e| e.to_string())?;
        if last.is_some_and(|t| t.elapsed() < MIN_GAP) {
            return Err("Please wait a minute before sending another message.".into());
        }
        *last = Some(Instant::now());
    }
    let result = tauri::async_runtime::spawn_blocking(move || post(body)).await.map_err(|e| e.to_string())?;
    if result.is_err() {
        // A failed send must not block the retry.
        *LAST_SENT.lock().map_err(|e| e.to_string())? = None;
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fb(kind: &str, title: &str, message: &str) -> Feedback {
        Feedback { kind: kind.into(), title: title.into(), message: message.into(), system: "SystemCore v0.3.0".into() }
    }

    #[test]
    fn builds_and_validates() {
        let v = payload(&fb("bug", " Overlay & FPS ", "It flickers ő")).unwrap();
        assert_eq!(v["_subject"], "[SystemCore Bug] Overlay & FPS");
        assert_eq!(v["system"], "SystemCore v0.3.0");
        assert!(payload(&fb("spam", "Title", "Message")).is_err());
        assert!(payload(&fb("idea", "ab", "Message")).is_err());
        assert!(payload(&fb("idea", "Title", &"x".repeat(4001))).is_err());
    }
}
