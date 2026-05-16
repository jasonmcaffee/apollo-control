use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct KeyCombo {
    pub modifiers: Vec<String>,
    pub key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum Action {
    Toggle { path: String },
    Step { path: String, delta: f64, min: f64, max: f64 },
    Set { path: String, value: Value },
    Hold { path: String, press_value: Value, release_value: Value },
    /** Bidirectional scroll-wheel action: direction (±1.0) applied at runtime from wheel delta. */
    Knob { path: String, step: f64, min: f64, max: f64 },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Mapping {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub trigger: KeyCombo,
    pub action: Action,
}

impl Mapping {
    pub fn new(name: String, trigger: KeyCombo, action: Action) -> Self {
        Mapping { id: Uuid::new_v4().to_string(), name, enabled: true, trigger, action }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Config {
    pub mappings: Vec<Mapping>,
}

impl Config {
    /** Load config from ~/.apollo-control/mappings.json, returning empty config on error. */
    pub fn load() -> Self {
        let path = config_path();
        let data = match fs::read_to_string(&path) {
            Ok(s) => s,
            Err(_) => return Config::default(),
        };
        serde_json::from_str(&data).unwrap_or_default()
    }

    /** Persist config to ~/.apollo-control/mappings.json, creating the directory if needed. */
    pub fn save(&self) -> Result<(), String> {
        let path = config_path();
        if let Some(dir) = path.parent() {
            fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        let json = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        fs::write(&path, json).map_err(|e| e.to_string())
    }

    /** Upsert a mapping by id, returning the id. */
    pub fn upsert(&mut self, mapping: Mapping) -> String {
        let id = mapping.id.clone();
        if let Some(existing) = self.mappings.iter_mut().find(|m| m.id == id) {
            *existing = mapping;
        } else {
            self.mappings.push(mapping);
        }
        id
    }

    /** Remove a mapping by id. Returns true if it was found and removed. */
    pub fn remove(&mut self, id: &str) -> bool {
        let before = self.mappings.len();
        self.mappings.retain(|m| m.id != id);
        self.mappings.len() < before
    }
}

/** Returns the config file path: ~/.apollo-control/mappings.json */
fn config_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".apollo-control")
        .join("mappings.json")
}
