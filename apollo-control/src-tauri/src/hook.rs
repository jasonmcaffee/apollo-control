use crate::actions::{execute_action, execute_hold_release, execute_knob_step};
use crate::config::{Action, Config, KeyCombo, Mapping, Trigger};
use rdev::{listen, Event, EventType};
use std::collections::{HashMap, HashSet};
use std::sync::mpsc;
use std::sync::{Arc, RwLock};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

pub struct HookState {
    pub config: Arc<RwLock<Config>>,
    pub capturing: Arc<AtomicBool>,
    pub captured_tx: Arc<std::sync::Mutex<Option<std::sync::mpsc::Sender<KeyCombo>>>>,
}

enum HookMsg {
    KeyPress { key_name: String, pressed: HashSet<String> },
    KeyRelease { key_name: String },
    Scroll { delta_y: i64, pressed: HashSet<String> },
}

/**
 * Knob key pairs: pressing the "down" sibling of a Knob trigger key fires the action in reverse.
 * Maps the "down" key → "up" key (the canonical trigger stored in the mapping).
 */
fn knob_sibling_direction(trigger_key: &str, pressed_key: &str) -> Option<f64> {
    if pressed_key == trigger_key {
        return Some(1.0);
    }
    match (trigger_key, pressed_key) {
        ("VolumeUp", "VolumeDown") => Some(-1.0),
        ("VolumeDown", "VolumeUp") => Some(1.0),
        _ => None,
    }
}

/**
 * Spawn the global input hook. The rdev callback is kept minimal (just captures
 * event data and sends to a channel) so it never approaches the WH_LL timeout.
 * A separate processor thread handles all config lookups, matching, and actions.
 */
pub fn spawn_hook(state: Arc<HookState>) {
    let (tx, rx) = mpsc::sync_channel::<HookMsg>(256);

    // Processor thread — all the heavy lifting happens here, off the hook thread
    let state_proc = state.clone();
    std::thread::spawn(move || {
        let mut held_mappings: Vec<Mapping> = Vec::new();
        let mut last_fired: HashMap<String, Instant> = HashMap::new();
        for msg in rx {
            match msg {
                HookMsg::KeyPress { key_name, pressed } => {
                    process_key_press(&key_name, &pressed, &mut held_mappings, &mut last_fired, &state_proc);
                }
                HookMsg::KeyRelease { key_name } => {
                    process_key_release(&key_name, &mut held_mappings);
                }
                HookMsg::Scroll { delta_y, pressed } => {
                    process_scroll(delta_y, &pressed, &state_proc);
                }
            }
        }
    });

    // Hook thread — minimal callback, must return as fast as possible
    std::thread::spawn(move || {
        let mut pressed: HashSet<String> = HashSet::new();

        if let Err(e) = listen(move |event: Event| {
            match &event.event_type {
                EventType::KeyPress(key) => {
                    let key_name = format!("{:?}", key);
                    pressed.insert(key_name.clone());
                    let _ = tx.try_send(HookMsg::KeyPress { key_name, pressed: pressed.clone() });
                }
                EventType::KeyRelease(key) => {
                    let key_name = format!("{:?}", key);
                    pressed.remove(&key_name);
                    let _ = tx.try_send(HookMsg::KeyRelease { key_name });
                }
                EventType::Wheel { delta_y, .. } => {
                    let _ = tx.try_send(HookMsg::Scroll { delta_y: *delta_y, pressed: pressed.clone() });
                }
                _ => {}
            }
        }) {
            eprintln!("rdev listen error: {:?}", e);
        }
    });
}

/** Check capturing mode, then match and fire keyboard actions. */
fn process_key_press(key_name: &str, pressed: &HashSet<String>, held_mappings: &mut Vec<Mapping>, last_fired: &mut HashMap<String, Instant>, state: &Arc<HookState>) {
    if state.capturing.load(Ordering::SeqCst) {
        let combo = build_combo_from_pressed(pressed);
        state.capturing.store(false, Ordering::SeqCst);
        if let Ok(guard) = state.captured_tx.lock() {
            if let Some(tx) = guard.as_ref() {
                let _ = tx.send(combo);
            }
        }
        return;
    }

    let config = match state.config.read() {
        Ok(c) => c,
        Err(_) => return,
    };

    for mapping in &config.mappings {
        if !mapping.enabled { continue; }
        let Trigger::Key(combo) = &mapping.trigger else { continue };

        // Keyboard Knob: match trigger key OR its directional sibling (e.g. VolumeUp/VolumeDown)
        if let Action::Knob { .. } = &mapping.action {
            if combo.key == "ScrollWheel" { continue; }
            let direction = match knob_sibling_direction(&combo.key, key_name) {
                Some(d) => d,
                None => continue,
            };
            if !modifiers_match(&combo.modifiers, pressed) { continue; }
            if debounced(last_fired, &mapping.id, Duration::from_millis(100)) { continue; }
            let action = mapping.action.clone();
            std::thread::spawn(move || {
                if let Err(e) = execute_knob_step(&action, direction) {
                    eprintln!("[knob error] {}", e);
                }
            });
            continue;
        }

        // Normal key combo match
        if !combo_matches(combo, pressed) { continue; }
        if debounced(last_fired, &mapping.id, Duration::from_millis(100)) { continue; }

        let action = mapping.action.clone();
        let mapping_clone = mapping.clone();
        let name_for_log = mapping_clone.name.clone();
        std::thread::spawn(move || {
            if let Err(e) = execute_action(&action) {
                eprintln!("[key action error] {}: {}", name_for_log, e);
            }
        });
        if matches!(&mapping.action, Action::Hold { .. }) {
            held_mappings.push(mapping_clone);
        }
    }
}

/** Returns true and skips the action if the mapping fired within `cooldown`. Updates the timestamp otherwise. */
fn debounced(last_fired: &mut HashMap<String, Instant>, id: &str, cooldown: Duration) -> bool {
    let now = Instant::now();
    if let Some(last) = last_fired.get(id) {
        if now.duration_since(*last) < cooldown {
            return true;
        }
    }
    last_fired.insert(id.to_string(), now);
    false
}

/** Release any held mappings whose primary key was just released. */
fn process_key_release(key_name: &str, held_mappings: &mut Vec<Mapping>) {
    held_mappings.retain(|m| {
        let key_match = match &m.trigger {
            Trigger::Key(c) => c.key == key_name,
            _ => false,
        };
        if key_match {
            let action = m.action.clone();
            std::thread::spawn(move || {
                if let Err(e) = execute_hold_release(&action) {
                    eprintln!("[hold release error] {}", e);
                }
            });
            false
        } else {
            true
        }
    });
}

/** Match scroll events against Knob mappings whose modifiers are currently held. */
fn process_scroll(delta_y: i64, pressed: &HashSet<String>, state: &Arc<HookState>) {
    let config = match state.config.read() {
        Ok(c) => c,
        Err(_) => return,
    };
    // Windows: positive delta_y = scroll forward/up = increase
    let direction = if delta_y > 0 { 1.0_f64 } else { -1.0_f64 };

    for mapping in &config.mappings {
        if !mapping.enabled { continue; }
        let Trigger::Key(combo) = &mapping.trigger else { continue };
        if combo.key != "ScrollWheel" { continue; }
        if !modifiers_match(&combo.modifiers, pressed) { continue; }
        let action = mapping.action.clone();
        std::thread::spawn(move || {
            if let Err(e) = execute_knob_step(&action, direction) {
                eprintln!("[knob error] {}", e);
            }
        });
    }
}

/** Returns true if the currently pressed keys satisfy the trigger combo. */
fn combo_matches(trigger: &KeyCombo, pressed: &HashSet<String>) -> bool {
    if !pressed.contains(&trigger.key) {
        return false;
    }
    for modifier in &trigger.modifiers {
        if !pressed.iter().any(|k| modifier_matches(k, modifier)) {
            return false;
        }
    }
    true
}

/** Returns true when all required modifiers are present among the currently pressed keys. */
fn modifiers_match(required: &[String], pressed: &HashSet<String>) -> bool {
    required.iter().all(|modifier| {
        pressed.iter().any(|k| modifier_matches(k, modifier))
    })
}

fn modifier_matches(pressed_key: &str, modifier: &str) -> bool {
    match modifier {
        "Shift" => matches!(pressed_key, "ShiftLeft" | "ShiftRight"),
        "Ctrl" | "Control" => matches!(pressed_key, "ControlLeft" | "ControlRight"),
        "Alt" => matches!(pressed_key, "Alt" | "AltGr"),
        "Meta" | "Super" => matches!(pressed_key, "MetaLeft" | "MetaRight"),
        other => pressed_key == other,
    }
}

/** Build a KeyCombo from the currently pressed key set, separating modifiers from the primary key. */
fn build_combo_from_pressed(pressed: &HashSet<String>) -> KeyCombo {
    let modifier_keys = ["ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight",
                         "Alt", "AltGr", "MetaLeft", "MetaRight"];
    let modifiers: Vec<String> = pressed
        .iter()
        .filter(|k| modifier_keys.contains(&k.as_str()))
        .map(|k| normalize_modifier(k))
        .collect();
    let key = pressed
        .iter()
        .find(|k| !modifier_keys.contains(&k.as_str()))
        .cloned()
        .unwrap_or_default();
    KeyCombo { modifiers, key }
}

fn normalize_modifier(key: &str) -> String {
    match key {
        "ShiftLeft" | "ShiftRight" => "Shift".into(),
        "ControlLeft" | "ControlRight" => "Ctrl".into(),
        "Alt" | "AltGr" => "Alt".into(),
        "MetaLeft" | "MetaRight" => "Meta".into(),
        other => other.into(),
    }
}
