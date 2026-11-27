//! News page: RSS/Atom feeds from a fixed list of IT and gaming sites (the UI parses the XML),
//! and opening an article in the default browser.

use tauri_plugin_opener::OpenerExt;

/// The only URLs this command fetches; the UI asks by id so it can never point the app at another address.
const FEEDS: [(&str, &str); 8] = [
    ("hwsw", "https://www.hwsw.hu/xml/latest_news_rss.xml"),
    ("index-tech", "https://index.hu/tech/rss/"),
    ("gamestar-hu", "https://www.gamestar.hu/site/rss/rss.xml"),
    ("tomshardware", "https://www.tomshardware.com/feeds/all"),
    ("techpowerup", "https://www.techpowerup.com/rss/news"),
    ("arstechnica", "https://feeds.arstechnica.com/arstechnica/index"),
    ("pcgamer", "https://www.pcgamer.com/rss/"),
    ("eurogamer", "https://www.eurogamer.net/feed"),
];

fn fetch(url: &str) -> Result<String, String> {
    let agent: ureq::Agent = ureq::Agent::config_builder().timeout_global(Some(std::time::Duration::from_secs(15))).build().into();
    agent
        .get(url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) SystemCore")
        .call()
        .map_err(|e| e.to_string())?
        .body_mut()
        .with_config()
        .limit(8 * 1024 * 1024)
        .read_to_string()
        .map_err(|e| e.to_string())
}

/// The raw feed XML of one source.
#[tauri::command]
pub async fn fetch_news(source: String) -> Result<String, String> {
    let url = FEEDS.iter().find(|(id, _)| *id == source).ok_or("Unknown news source.")?.1;
    tauri::async_runtime::spawn_blocking(move || fetch(url)).await.map_err(|e| e.to_string())?
}

/// Opens a web page in the default browser; only plain https links.
#[tauri::command]
pub fn open_link(app: tauri::AppHandle, url: String) -> Result<(), String> {
    if !url.starts_with("https://") || url.chars().any(char::is_whitespace) {
        return Err("Only https links can be opened.".into());
    }
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}
