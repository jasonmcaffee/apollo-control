/**
 * MIDI input manager.
 *
 * Owns one `midir::MidiInputConnection` per available MIDI input port. Each port's
 * callback parses raw bytes into a `MidiEvent` and forwards it to a single processor
 * thread which:
 *   - in capture mode: emits the event to the UI and resolves a pending capture future
 *   - in run mode:     looks up matching mappings and dispatches actions via the executor
 *
 * Hot-plug is handled by a 2s polling watcher (midir has no native plug events on Windows).
 */

use crate::actions::{execute_action, execute_knob_step, execute_hold_release};
use crate::config::{Action, Config, MidiKind, MidiMode, MidiTrigger, Trigger};
use midir::{MidiInput, MidiInputConnection, MidiInputPort};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex, RwLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

/** Normalized MIDI event used internally and over IPC. */
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MidiEvent {
    pub device: String,
    pub channel: u8,
    pub kind: MidiKind,
    /** Note number, CC controller number, or 0 for pitch_bend. */
    pub data1: u8,
    /** 7-bit value (velocity / CC value); for pitch_bend this is the high byte. */
    pub data2: u8,
    /** Raw 14-bit value for pitch_bend (0..16383); for note/CC this is data2 in 0..127. */
    pub raw_value: u16,
}

impl MidiEvent {
    /** Returns the value normalized to 0.0..1.0. */
    pub fn normalized(&self) -> f64 {
        match self.kind {
            MidiKind::PitchBend => (self.raw_value as f64) / 16383.0,
            _ => (self.data2 as f64) / 127.0,
        }
    }
}

/** Public handle owned by the Tauri app to control the MIDI manager. */
pub struct MidiHandle {
    inner: Arc<MidiInner>,
}

impl MidiHandle {
    /** Force the manager to re-read config (e.g. after a mapping was saved/deleted). */
    pub fn reload(&self) {
        self.inner.reload_signal.store(true, Ordering::SeqCst);
    }

    /** List currently connected MIDI input port names. */
    pub fn list_devices(&self) -> Vec<String> {
        let connections = self.inner.connections.lock().unwrap();
        let mut names: Vec<String> = connections.keys().cloned().collect();
        names.sort();
        names
    }

    /**
     * Arm capture mode. The first matching event is sent via the returned receiver,
     * and subsequent events are emitted to the UI as Tauri `midi:event` events until
     * `cancel_capture` is called.
     */
    pub fn start_capture(&self, device: Option<String>) -> mpsc::Receiver<MidiEvent> {
        let (tx, rx) = mpsc::channel::<MidiEvent>();
        let mut state = self.inner.capture.lock().unwrap();
        state.armed = true;
        state.device_filter = device;
        state.first_event_tx = Some(tx);
        rx
    }

    /** Disarm capture mode. */
    pub fn cancel_capture(&self) {
        let mut state = self.inner.capture.lock().unwrap();
        state.armed = false;
        state.device_filter = None;
        state.first_event_tx = None;
    }
}

struct MidiInner {
    config: Arc<RwLock<Config>>,
    app: Mutex<Option<AppHandle>>,
    connections: Mutex<HashMap<String, MidiInputConnection<()>>>,
    capture: Mutex<CaptureState>,
    reload_signal: AtomicBool,
}

#[derive(Default)]
struct CaptureState {
    armed: bool,
    device_filter: Option<String>,
    /** One-shot sender for the first captured event after arming. */
    first_event_tx: Option<mpsc::Sender<MidiEvent>>,
}

/** Spawn the MIDI manager. Call once at startup; pass the AppHandle as soon as it's available. */
pub fn spawn_midi_manager(config: Arc<RwLock<Config>>) -> MidiHandle {
    let inner = Arc::new(MidiInner {
        config,
        app: Mutex::new(None),
        connections: Mutex::new(HashMap::new()),
        capture: Mutex::new(CaptureState::default()),
        reload_signal: AtomicBool::new(false),
    });

    let (event_tx, event_rx) = mpsc::channel::<MidiEvent>();

    // Watcher thread — reconciles open MidiInputConnections with the current port list.
    let watcher_inner = inner.clone();
    let watcher_tx = event_tx.clone();
    std::thread::spawn(move || run_watcher(watcher_inner, watcher_tx));

    // Processor thread — handles events from all input callbacks.
    let processor_inner = inner.clone();
    std::thread::spawn(move || run_processor(processor_inner, event_rx));

    MidiHandle { inner }
}

/** Attach the Tauri AppHandle so the manager can emit events to the UI. */
pub fn attach_app_handle(handle: &MidiHandle, app: AppHandle) {
    *handle.inner.app.lock().unwrap() = Some(app);
}

// ── Watcher ────────────────────────────────────────────────────────────────

fn run_watcher(inner: Arc<MidiInner>, event_tx: mpsc::Sender<MidiEvent>) {
    let mut failed: std::collections::HashSet<String> = std::collections::HashSet::new();
    loop {
        if let Err(e) = reconcile_ports(&inner, &event_tx, &mut failed) {
            eprintln!("[midi] reconcile failed: {}", e);
        }
        std::thread::sleep(Duration::from_secs(2));
    }
}

/**
 * Diff the open connections against the current set of MIDI input ports; open/close as needed.
 * Ports that fail to open are remembered in `failed` so we don't retry (and re-log) every 2s.
 * A failed port is forgotten when it disappears, so unplug/replug will trigger one fresh attempt.
 */
fn reconcile_ports(inner: &Arc<MidiInner>, event_tx: &mpsc::Sender<MidiEvent>, failed: &mut std::collections::HashSet<String>) -> Result<(), String> {
    let midi_in = MidiInput::new("apollo-control-enum").map_err(|e| e.to_string())?;
    let ports: Vec<MidiInputPort> = midi_in.ports();
    let mut current_names: Vec<(MidiInputPort, String)> = Vec::with_capacity(ports.len());
    for p in ports.iter() {
        if let Ok(name) = midi_in.port_name(p) {
            current_names.push((p.clone(), name));
        }
    }
    let alive_names: std::collections::HashSet<String> = current_names.iter().map(|(_, n)| n.clone()).collect();
    failed.retain(|n| alive_names.contains(n));

    let mut connections = inner.connections.lock().unwrap();

    // Drop any connection whose name no longer appears.
    let to_drop: Vec<String> = connections.keys().filter(|k| !alive_names.contains(*k)).cloned().collect();
    for name in to_drop {
        connections.remove(&name);
        emit_devices_changed(inner);
    }

    // Open new ones.
    for (port, name) in current_names.iter() {
        if connections.contains_key(name) { continue; }
        if failed.contains(name) { continue; }
        let device_name_owned = name.clone();
        let tx_clone = event_tx.clone();
        let midi_in_per_port = match MidiInput::new("apollo-control") {
            Ok(m) => m,
            Err(e) => { eprintln!("[midi] new input failed: {}", e); continue; }
        };
        let conn = midi_in_per_port.connect(
            port,
            "apollo-control-in",
            move |_ts, message, _| {
                if let Some(ev) = parse_midi(&device_name_owned, message) {
                    let _ = tx_clone.send(ev);
                }
            },
            (),
        );
        match conn {
            Ok(c) => {
                connections.insert(name.clone(), c);
                emit_devices_changed(inner);
            }
            Err(e) => {
                eprintln!("[midi] connect '{}' failed: {}", name, e);
                failed.insert(name.clone());
            }
        }
    }

    Ok(())
}

fn emit_devices_changed(inner: &Arc<MidiInner>) {
    if let Some(app) = inner.app.lock().unwrap().clone() {
        let mut names: Vec<String> = inner.connections.lock().unwrap().keys().cloned().collect();
        names.sort();
        let _ = app.emit("midi:devices", names);
    }
}

// ── Parser ─────────────────────────────────────────────────────────────────

/** Parse a raw MIDI message into a normalized MidiEvent. Returns None for SysEx/realtime. */
pub fn parse_midi(device: &str, msg: &[u8]) -> Option<MidiEvent> {
    if msg.is_empty() { return None; }
    let status = msg[0];
    if status >= 0xF0 { return None; } // SysEx (0xF0) + realtime
    let kind_nibble = status & 0xF0;
    let channel = status & 0x0F;
    let d1 = *msg.get(1)? & 0x7F;
    let d2 = *msg.get(2).unwrap_or(&0) & 0x7F;

    let (kind, data1, data2, raw_value) = match kind_nibble {
        0x80 => (MidiKind::NoteOff, d1, d2, d2 as u16),
        0x90 => {
            // Note On with velocity 0 is conventionally a Note Off.
            if d2 == 0 {
                (MidiKind::NoteOff, d1, 0, 0)
            } else {
                (MidiKind::NoteOn, d1, d2, d2 as u16)
            }
        }
        0xB0 => (MidiKind::Cc, d1, d2, d2 as u16),
        0xE0 => {
            let value = ((d2 as u16) << 7) | (d1 as u16);
            (MidiKind::PitchBend, 0, d2, value)
        }
        _ => return None,
    };

    Some(MidiEvent {
        device: device.to_string(),
        channel,
        kind,
        data1,
        data2,
        raw_value,
    })
}

// ── Processor ──────────────────────────────────────────────────────────────

fn run_processor(inner: Arc<MidiInner>, rx: mpsc::Receiver<MidiEvent>) {
    let mut last_dispatch: HashMap<String, Instant> = HashMap::new();
    let mut last_value: HashMap<String, u16> = HashMap::new();

    for event in rx {
        // Capture path takes precedence.
        let captured = handle_capture(&inner, &event);
        if captured { continue; }

        let cfg = match inner.config.read() {
            Ok(c) => c,
            Err(_) => continue,
        };

        for mapping in &cfg.mappings {
            if !mapping.enabled { continue; }
            let Trigger::Midi(trigger) = &mapping.trigger else { continue };
            if !trigger_matches(trigger, &event) { continue; }
            if !rate_ok(&mut last_dispatch, &mut last_value, &mapping.id, &event) { continue; }

            dispatch(trigger, &mapping.action, &event);
        }
    }
}

/** Returns true if the event was consumed by capture mode. */
fn handle_capture(inner: &Arc<MidiInner>, event: &MidiEvent) -> bool {
    let mut state = inner.capture.lock().unwrap();
    if !state.armed { return false; }
    if let Some(filter) = &state.device_filter {
        if !filter.eq_ignore_ascii_case(&event.device) {
            return false;
        }
    }

    // Resolve the first-event future if pending.
    if let Some(tx) = state.first_event_tx.take() {
        let _ = tx.send(event.clone());
    }

    // Drop the lock before emitting to avoid holding it across IPC.
    drop(state);

    if let Some(app) = inner.app.lock().unwrap().clone() {
        let _ = app.emit("midi:event", event);
    }
    true
}

/** Returns true if this MIDI event matches the trigger's filters. */
fn trigger_matches(trigger: &MidiTrigger, event: &MidiEvent) -> bool {
    if let Some(d) = &trigger.device {
        if !d.eq_ignore_ascii_case(&event.device) { return false; }
    }
    if let Some(ch) = trigger.channel {
        if ch != event.channel { return false; }
    }
    if trigger.kind != event.kind {
        // Allow a Discrete NoteOn trigger to also catch NoteOff for hold-style actions.
        // The downstream dispatch decides what to do; here we accept if the trigger's note matches.
        if trigger.kind == MidiKind::NoteOn && event.kind == MidiKind::NoteOff && trigger.data1 == event.data1 {
            return true;
        }
        return false;
    }
    if matches!(trigger.kind, MidiKind::NoteOn | MidiKind::NoteOff | MidiKind::Cc) {
        if trigger.data1 != event.data1 { return false; }
    }
    true
}

/**
 * Rate-limit and dedupe events per mapping.
 * Returns true if this event should dispatch, false if it's a duplicate or within cooldown.
 */
fn rate_ok(last_dispatch: &mut HashMap<String, Instant>, last_value: &mut HashMap<String, u16>, mapping_id: &str, event: &MidiEvent) -> bool {
    let now = Instant::now();
    // Skip if same value as last and within cooldown
    let value = event.raw_value;
    if let Some(prev) = last_value.get(mapping_id) {
        if *prev == value {
            if let Some(last) = last_dispatch.get(mapping_id) {
                if now.duration_since(*last) < Duration::from_millis(50) {
                    return false;
                }
            }
        }
    }
    // Global 10ms throttle per mapping
    if let Some(last) = last_dispatch.get(mapping_id) {
        if now.duration_since(*last) < Duration::from_millis(10) {
            return false;
        }
    }
    last_dispatch.insert(mapping_id.to_string(), now);
    last_value.insert(mapping_id.to_string(), value);
    true
}

/** Dispatch the action for a matched MIDI event, based on trigger mode. */
fn dispatch(trigger: &MidiTrigger, action: &Action, event: &MidiEvent) {
    let action = action.clone();
    let mode = trigger.mode;
    let event_kind = event.kind;
    let normalized = event.normalized();
    std::thread::spawn(move || {
        let result = match mode {
            MidiMode::Continuous => dispatch_continuous(&action, normalized),
            MidiMode::Discrete => dispatch_discrete(&action, event_kind),
        };
        if let Err(e) = result {
            eprintln!("[midi action error] {}", e);
        }
    });
}

/** Map a normalized 0..1 value into the action's target range and apply via Set. */
fn dispatch_continuous(action: &Action, normalized: f64) -> Result<(), String> {
    match action {
        Action::Knob { path, min, max, .. } | Action::Step { path, min, max, .. } => {
            let target = min + normalized * (max - min);
            apply_set_float(path, target)
        }
        Action::Set { path, .. } => {
            // Treat the existing Set's range as -inf..inf; just set the normalized value as a float.
            apply_set_float(path, normalized)
        }
        Action::Toggle { .. } => {
            // Treat as a Set against 0 / 1 if it crosses 0.5.
            execute_action(action)
        }
        Action::Hold { .. } => execute_action(action),
    }
}

fn apply_set_float(path: &str, value: f64) -> Result<(), String> {
    let num = serde_json::Number::from_f64(value).ok_or("Invalid float for Set")?;
    let json = Value::Number(num);
    let set = Action::Set { path: path.to_string(), value: json };
    execute_action(&set)
}

/** Dispatch for discrete triggers: NoteOn-style or NoteOff release. */
fn dispatch_discrete(action: &Action, event_kind: MidiKind) -> Result<(), String> {
    match action {
        Action::Hold { .. } => match event_kind {
            MidiKind::NoteOn => execute_action(action),
            MidiKind::NoteOff => execute_hold_release(action),
            _ => Ok(()),
        },
        Action::Knob { .. } => {
            // Single-press on a knob action → step up by 1
            if event_kind == MidiKind::NoteOn {
                execute_knob_step(action, 1.0)
            } else {
                Ok(())
            }
        }
        _ => match event_kind {
            MidiKind::NoteOn => execute_action(action),
            _ => Ok(()),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{KeyCombo, Mapping};

    fn ev(kind: MidiKind, device: &str, channel: u8, data1: u8, data2: u8) -> MidiEvent {
        let raw_value = if matches!(kind, MidiKind::PitchBend) {
            ((data2 as u16) << 7) | (data1 as u16)
        } else { data2 as u16 };
        MidiEvent { device: device.into(), channel, kind, data1, data2, raw_value }
    }

    #[test]
    fn parser_note_on() {
        let m = parse_midi("X", &[0x90, 60, 100]).unwrap();
        assert_eq!(m.kind, MidiKind::NoteOn);
        assert_eq!(m.channel, 0);
        assert_eq!(m.data1, 60);
        assert_eq!(m.data2, 100);
    }

    #[test]
    fn parser_note_on_zero_velocity_is_note_off() {
        let m = parse_midi("X", &[0x90, 60, 0]).unwrap();
        assert_eq!(m.kind, MidiKind::NoteOff);
    }

    #[test]
    fn parser_cc() {
        let m = parse_midi("X", &[0xB0, 80, 31]).unwrap();
        assert_eq!(m.kind, MidiKind::Cc);
        assert_eq!(m.data1, 80);
        assert_eq!(m.data2, 31);
    }

    #[test]
    fn parser_pitch_bend_14bit() {
        let m = parse_midi("X", &[0xE0, 0x00, 0x40]).unwrap();
        assert_eq!(m.kind, MidiKind::PitchBend);
        assert_eq!(m.raw_value, 0x2000);
    }

    #[test]
    fn parser_sysex_returns_none() {
        assert!(parse_midi("X", &[0xF0, 0x7E, 0xF7]).is_none());
    }

    #[test]
    fn trigger_matches_device_filter() {
        let t = MidiTrigger {
            device: Some("MiniLab 3".into()),
            channel: None,
            kind: MidiKind::Cc,
            data1: 80,
            mode: MidiMode::Continuous,
        };
        assert!(trigger_matches(&t, &ev(MidiKind::Cc, "MiniLab 3", 0, 80, 64)));
        assert!(trigger_matches(&t, &ev(MidiKind::Cc, "minilab 3", 0, 80, 64))); // case-insensitive
        assert!(!trigger_matches(&t, &ev(MidiKind::Cc, "OtherDevice", 0, 80, 64)));
    }

    #[test]
    fn trigger_matches_all_devices_when_none() {
        let t = MidiTrigger {
            device: None,
            channel: None,
            kind: MidiKind::Cc,
            data1: 80,
            mode: MidiMode::Continuous,
        };
        assert!(trigger_matches(&t, &ev(MidiKind::Cc, "A", 0, 80, 0)));
        assert!(trigger_matches(&t, &ev(MidiKind::Cc, "B", 0, 80, 0)));
    }

    #[test]
    fn trigger_matches_channel_filter() {
        let t = MidiTrigger {
            device: None,
            channel: Some(0),
            kind: MidiKind::Cc,
            data1: 80,
            mode: MidiMode::Continuous,
        };
        assert!(trigger_matches(&t, &ev(MidiKind::Cc, "X", 0, 80, 0)));
        assert!(!trigger_matches(&t, &ev(MidiKind::Cc, "X", 1, 80, 0)));
    }

    #[test]
    fn trigger_matches_data1() {
        let t = MidiTrigger {
            device: None,
            channel: None,
            kind: MidiKind::Cc,
            data1: 80,
            mode: MidiMode::Continuous,
        };
        assert!(!trigger_matches(&t, &ev(MidiKind::Cc, "X", 0, 81, 0)));
    }

    #[test]
    fn note_on_trigger_accepts_note_off_for_same_note() {
        let t = MidiTrigger {
            device: None,
            channel: None,
            kind: MidiKind::NoteOn,
            data1: 60,
            mode: MidiMode::Discrete,
        };
        assert!(trigger_matches(&t, &ev(MidiKind::NoteOff, "X", 0, 60, 0)));
        assert!(!trigger_matches(&t, &ev(MidiKind::NoteOff, "X", 0, 61, 0)));
    }

    #[test]
    fn normalized_cc() {
        let e = ev(MidiKind::Cc, "X", 0, 80, 0);
        assert!((e.normalized() - 0.0).abs() < 1e-9);
        let e = ev(MidiKind::Cc, "X", 0, 80, 127);
        assert!((e.normalized() - 1.0).abs() < 1e-9);
        let e = ev(MidiKind::Cc, "X", 0, 80, 63);
        assert!((e.normalized() - (63.0 / 127.0)).abs() < 1e-9);
    }

    #[test]
    fn normalized_pitch_bend_center() {
        let e = parse_midi("X", &[0xE0, 0x00, 0x40]).unwrap();
        let n = e.normalized();
        assert!((n - 0.5).abs() < 0.001);
    }

    #[test]
    fn rate_ok_deduplicates_same_value() {
        let mut ld = HashMap::new();
        let mut lv = HashMap::new();
        let e = ev(MidiKind::Cc, "X", 0, 80, 64);
        assert!(rate_ok(&mut ld, &mut lv, "id1", &e));
        // Same value, immediately again → dropped
        assert!(!rate_ok(&mut ld, &mut lv, "id1", &e));
    }

    #[test]
    fn rate_ok_allows_value_change() {
        let mut ld = HashMap::new();
        let mut lv = HashMap::new();
        let e1 = ev(MidiKind::Cc, "X", 0, 80, 64);
        let e2 = ev(MidiKind::Cc, "X", 0, 80, 65);
        assert!(rate_ok(&mut ld, &mut lv, "id1", &e1));
        // Different value but inside 10ms throttle → still dropped
        assert!(!rate_ok(&mut ld, &mut lv, "id1", &e2));
        std::thread::sleep(Duration::from_millis(15));
        assert!(rate_ok(&mut ld, &mut lv, "id1", &e2));
    }

    /** Sanity check that we don't accidentally treat keyboard triggers as midi-trigger candidates. */
    #[test]
    fn key_triggers_are_ignored_in_midi_processor() {
        let m = Mapping {
            id: "k".into(),
            name: "kb".into(),
            enabled: true,
            trigger: Trigger::Key(KeyCombo { modifiers: vec![], key: "KeyA".into() }),
            action: Action::Toggle { path: "/x".into() },
        };
        assert!(m.midi_trigger().is_none());
    }
}
