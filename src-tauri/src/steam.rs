//! Game search and system requirements from the public Steam store API (no key needed).
//! The requirement texts come back as the store's HTML; the UI parses them.

use serde_json::Value;

const STORE: &str = "https://store.steampowered.com/api";

#[derive(serde::Serialize)]
pub struct GameHit {
    id: u64,
    name: String,
}

#[derive(serde::Serialize)]
pub struct GameRequirements {
    name: String,
    minimum: String,
    recommended: String,
}

fn get_json(url: &str) -> Result<Value, String> {
    let agent: ureq::Agent = ureq::Agent::config_builder().timeout_global(Some(std::time::Duration::from_secs(15))).build().into();
    let text = agent.get(url).call().map_err(|e| format!("Steam store unreachable: {e}"))?.body_mut().read_to_string().map_err(|e| e.to_string())?;
    serde_json::from_str(&text).map_err(|e| format!("Unexpected answer from Steam: {e}"))
}

fn search(term: &str) -> Result<Vec<GameHit>, String> {
    let v = get_json(&format!("{STORE}/storesearch/?term={}&l=english&cc=us", crate::commands::url_encode(term)))?;
    Ok(v["items"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|i| i["type"] == "app" && i["platforms"]["windows"] != false)
        .filter_map(|i| Some(GameHit { id: i["id"].as_u64()?, name: i["name"].as_str()?.to_string() }))
        .take(8)
        .collect())
}

fn requirements(id: u64) -> Result<GameRequirements, String> {
    let v = get_json(&format!("{STORE}/appdetails?appids={id}&l=english&filters=basic"))?;
    let data = &v[id.to_string()]["data"];
    let name = data["name"].as_str().ok_or("Steam has no details for this game.")?.to_string();
    // pc_requirements is an empty array (not an object) when the store page lists none.
    let req = |k: &str| data["pc_requirements"][k].as_str().unwrap_or_default().to_string();
    Ok(GameRequirements { name, minimum: req("minimum"), recommended: req("recommended") })
}

#[tauri::command]
pub async fn search_games(term: String) -> Result<Vec<GameHit>, String> {
    let term = term.trim().chars().take(100).collect::<String>();
    if term.is_empty() {
        return Ok(vec![]);
    }
    tauri::async_runtime::spawn_blocking(move || search(&term)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn game_requirements(id: u64) -> Result<GameRequirements, String> {
    tauri::async_runtime::spawn_blocking(move || requirements(id)).await.map_err(|e| e.to_string())?
}
