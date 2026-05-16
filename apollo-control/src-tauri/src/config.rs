use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct KeyCombo {
    pub modifiers: Vec<String>,
    pub key: String,
}

/**
 * Source of a mapping trigger: a keyboard combo or a MIDI message.
 *
 * Serialized form (note the `source` tag rather than `kind`, since MidiTrigger
 * already has a `kind` field for the MIDI message type):
 *   `{ "source": "Key",  "modifiers": [...], "key": "..." }`
 *   `{ "source": "Midi", "device": "...", "channel": 0, "kind": "cc", "data1": 80, "mode": "continuous" }`
 */
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(tag = "source")]
pub enum Trigger {
    Key(KeyCombo),
    Midi(MidiTrigger),
}

/** Custom deserializer that supports the legacy `{modifiers, key}` shape for keyboard triggers. */
impl<'de> Deserialize<'de> for Trigger {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let v = Value::deserialize(d)?;
        if let Some(source) = v.get("source").and_then(|k| k.as_str()) {
            match source {
                "Key" => {
                    let combo: KeyCombo = serde_json::from_value(v).map_err(serde::de::Error::custom)?;
                    Ok(Trigger::Key(combo))
                }
                "Midi" => {
                    let m: MidiTrigger = serde_json::from_value(v).map_err(serde::de::Error::custom)?;
                    Ok(Trigger::Midi(m))
                }
                other => Err(serde::de::Error::custom(format!("unknown trigger source: {}", other))),
            }
        } else {
            // Legacy format: `{ modifiers, key }` without `source` field.
            let combo: KeyCombo = serde_json::from_value(v).map_err(serde::de::Error::custom)?;
            Ok(Trigger::Key(combo))
        }
    }
}

/** MIDI message-shape trigger. `device: None` means "any source device". */
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MidiTrigger {
    pub device: Option<String>,
    pub channel: Option<u8>,
    pub kind: MidiKind,
    /** Note number for note_on/off, controller number for cc, ignored for pitch_bend. */
    pub data1: u8,
    pub mode: MidiMode,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum MidiKind {
    NoteOn,
    NoteOff,
    Cc,
    PitchBend,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum MidiMode {
    /** Single-shot trigger (note-on or fixed CC): fires `Toggle` / `Hold` / press-on-down style actions. */
    Discrete,
    /** Continuous-value trigger (fader / CC sweep / pitch bend): maps 0..1 normalized value to the control range. */
    Continuous,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum Action {
    Toggle { path: String },
    Step { path: String, delta: f64, min: f64, max: f64 },
    Set { path: String, value: Value },
    Hold { path: String, press_value: Value, release_value: Value },
    /** Bidirectional scroll-wheel / knob action: direction (±1.0) applied at runtime from wheel delta. */
    Knob { path: String, step: f64, min: f64, max: f64 },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Mapping {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub trigger: Trigger,
    pub action: Action,
}

impl Mapping {
    #[allow(dead_code)]
    pub fn new(name: String, trigger: Trigger, action: Action) -> Self {
        Mapping { id: Uuid::new_v4().to_string(), name, enabled: true, trigger, action }
    }

    /** Returns the keyboard combo if this mapping is keyboard-triggered, else None. */
    #[allow(dead_code)]
    pub fn key_trigger(&self) -> Option<&KeyCombo> {
        match &self.trigger {
            Trigger::Key(c) => Some(c),
            _ => None,
        }
    }

    /** Returns the MIDI trigger if this mapping is MIDI-triggered, else None. */
    #[allow(dead_code)]
    pub fn midi_trigger(&self) -> Option<&MidiTrigger> {
        match &self.trigger {
            Trigger::Midi(m) => Some(m),
            _ => None,
        }
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn legacy_trigger_deserializes_as_key() {
        let raw = json!({ "modifiers": ["Shift"], "key": "KeyS" });
        let t: Trigger = serde_json::from_value(raw).unwrap();
        assert_eq!(
            t,
            Trigger::Key(KeyCombo { modifiers: vec!["Shift".into()], key: "KeyS".into() })
        );
    }

    #[test]
    fn legacy_config_loads_and_migrates() {
        let legacy = json!({
            "mappings": [{
                "id": "abc",
                "name": "legacy",
                "enabled": true,
                "trigger": { "modifiers": ["Shift"], "key": "KeyS" },
                "action": { "type": "Toggle", "path": "/foo" }
            }]
        });
        let cfg: Config = serde_json::from_value(legacy).unwrap();
        assert_eq!(cfg.mappings.len(), 1);
        let key = cfg.mappings[0].key_trigger().unwrap();
        assert_eq!(key.key, "KeyS");
        assert_eq!(key.modifiers, vec!["Shift".to_string()]);
        // Round-trip: persist + reload preserves data with new shape.
        let json_out = serde_json::to_string(&cfg).unwrap();
        assert!(json_out.contains("\"source\":\"Key\""));
        let cfg2: Config = serde_json::from_str(&json_out).unwrap();
        assert_eq!(cfg2.mappings[0].key_trigger().unwrap().key, "KeyS");
    }

    #[test]
    fn new_key_trigger_serde_round_trip() {
        let t = Trigger::Key(KeyCombo { modifiers: vec!["Ctrl".into()], key: "F1".into() });
        let s = serde_json::to_string(&t).unwrap();
        assert!(s.contains("\"source\":\"Key\""));
        let back: Trigger = serde_json::from_str(&s).unwrap();
        assert_eq!(t, back);
    }

    #[test]
    fn midi_trigger_serde_round_trip() {
        let t = Trigger::Midi(MidiTrigger {
            device: Some("MiniLab 3".into()),
            channel: Some(0),
            kind: MidiKind::Cc,
            data1: 80,
            mode: MidiMode::Continuous,
        });
        let s = serde_json::to_string(&t).unwrap();
        assert!(s.contains("\"source\":\"Midi\""));
        assert!(s.contains("\"kind\":\"cc\""));
        let back: Trigger = serde_json::from_str(&s).unwrap();
        assert_eq!(t, back);
    }

    #[test]
    fn midi_trigger_all_devices_is_none() {
        let raw = json!({
            "source": "Midi",
            "device": null,
            "channel": null,
            "kind": "note_on",
            "data1": 64,
            "mode": "discrete"
        });
        let t: Trigger = serde_json::from_value(raw).unwrap();
        match t {
            Trigger::Midi(m) => {
                assert_eq!(m.device, None);
                assert_eq!(m.channel, None);
                assert_eq!(m.kind, MidiKind::NoteOn);
                assert_eq!(m.data1, 64);
                assert_eq!(m.mode, MidiMode::Discrete);
            }
            _ => panic!("expected Midi"),
        }
    }
}
