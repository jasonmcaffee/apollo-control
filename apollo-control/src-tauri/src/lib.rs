mod actions;
mod config;
mod hook;
mod hotkeys;
mod midi;
mod sdk;

use crate::config::{Config, KeyCombo, Mapping};
use crate::hook::{spawn_hook, HookState};
use crate::hotkeys::{spawn_hotkey_manager, HotkeyHandle};
use crate::midi::{attach_app_handle, spawn_midi_manager, MidiEvent, MidiHandle};
use crate::sdk::{apollo_get, apollo_set, is_sdk_available};
use serde_json::Value;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex, RwLock};
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_autostart::ManagerExt;

struct AppState {
    config: Arc<RwLock<Config>>,
    capturing: Arc<AtomicBool>,
    captured_tx: Arc<Mutex<Option<std::sync::mpsc::Sender<KeyCombo>>>>,
    hotkey_handle: HotkeyHandle,
    midi_handle: MidiHandle,
}

// ── IPC commands ──────────────────────────────────────────────────────

/** Return all current mappings from config. */
#[tauri::command]
fn get_mappings(state: State<AppState>) -> Vec<Mapping> {
    state.config.read().map(|c| c.mappings.clone()).unwrap_or_default()
}

/** Upsert a mapping and persist config to disk. Returns the mapping id. */
#[tauri::command]
fn save_mapping(mapping: Mapping, state: State<AppState>) -> Result<String, String> {
    let id = {
        let mut config = state.config.write().map_err(|e| e.to_string())?;
        let id = config.upsert(mapping);
        config.save()?;
        id
    };
    state.hotkey_handle.reload();
    state.midi_handle.reload();
    Ok(id)
}

/** Delete a mapping by id and persist config. */
#[tauri::command]
fn delete_mapping(id: String, state: State<AppState>) -> Result<(), String> {
    {
        let mut config = state.config.write().map_err(|e| e.to_string())?;
        config.remove(&id);
        config.save()?;
    }
    state.hotkey_handle.reload();
    state.midi_handle.reload();
    Ok(())
}

/** Get the live value for an Apollo control path via the SDK. */
#[tauri::command]
async fn get_control_value(path: String) -> Result<Value, String> {
    apollo_get(&path).ok_or("SDK get failed or engine not running".into())
}

/** Set an Apollo control value via the SDK. */
#[tauri::command]
async fn set_control_value(path: String, value: Value) -> Result<(), String> {
    apollo_set(&path, &value).ok_or_else(|| "SDK set failed".to_string())?;
    Ok(())
}

/** Check if UAMixerEngine is reachable. */
#[tauri::command]
fn sdk_status() -> bool {
    is_sdk_available()
}

/**
 * Arm the keyboard hook to capture the next key combo and return it directly.
 * Blocks (on a spawn_blocking thread) until a key is pressed or 30s elapses.
 */
#[tauri::command]
async fn start_key_capture(state: State<'_, AppState>) -> Result<KeyCombo, String> {
    use std::sync::atomic::Ordering;
    let capturing = state.capturing.clone();
    let captured_tx = state.captured_tx.clone();
    let (tx, rx) = std::sync::mpsc::channel::<KeyCombo>();
    {
        let mut guard = captured_tx.lock().map_err(|e| e.to_string())?;
        *guard = Some(tx);
    }
    capturing.store(true, Ordering::SeqCst);
    tokio::task::spawn_blocking(move || {
        let result = rx
            .recv_timeout(std::time::Duration::from_secs(30))
            .map_err(|_| "Key capture timed out".to_string());
        capturing.store(false, Ordering::SeqCst);
        let mut guard = captured_tx.lock().unwrap();
        *guard = None;
        result
    })
    .await
    .map_err(|e| e.to_string())?
}

/** List MIDI input device names currently connected. */
#[tauri::command]
fn list_midi_devices(state: State<AppState>) -> Vec<String> {
    state.midi_handle.list_devices()
}

/**
 * Arm MIDI capture for the optional device filter ("All" if None).
 * Blocks on a spawn_blocking thread until the first matching event arrives or 30s elapses.
 * Subsequent events (until `cancel_midi_capture`) are emitted as `midi:event` Tauri events.
 */
#[tauri::command]
async fn start_midi_capture(device: Option<String>, state: State<'_, AppState>) -> Result<MidiEvent, String> {
    let rx = state.midi_handle.start_capture(device);
    tokio::task::spawn_blocking(move || {
        rx.recv_timeout(std::time::Duration::from_secs(30))
            .map_err(|_| "MIDI capture timed out".to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/** Stop MIDI capture (no-op if not armed). */
#[tauri::command]
fn cancel_midi_capture(state: State<AppState>) -> Result<(), String> {
    state.midi_handle.cancel_capture();
    Ok(())
}

/** Return whether the app is registered to start automatically on login. */
#[tauri::command]
fn get_autostart(app: AppHandle) -> bool {
    app.autolaunch().is_enabled().unwrap_or(false)
}

/** Enable or disable starting the mapper listener on system login. */
#[tauri::command]
fn set_autostart(enabled: bool, app: AppHandle) -> Result<(), String> {
    let al = app.autolaunch();
    if enabled { al.enable() } else { al.disable() }
        .map_err(|e| e.to_string())
}

/**
 * Return the Apollo Solo device tree as a nested JSON structure.
 * Indices are based on the live-verified Solo control surface.
 */
#[tauri::command]
fn get_device_tree() -> Value {
    serde_json::json!({
        "device": {
            "label": "Apollo Solo",
            "path": "/devices/0",
            "children": {
                "monitor": {
                    "label": "Monitor (CR)",
                    "path": "/devices/0/outputs/4",
                    "controls": [
                        { "label": "Monitor Level", "path": "/devices/0/outputs/4/CRMonitorLevel/value", "type": "float", "min": -96.0, "max": 0.0 },
                        { "label": "Mute", "path": "/devices/0/outputs/4/Mute/value", "type": "bool" },
                        { "label": "Dim", "path": "/devices/0/outputs/4/DimOn/value", "type": "bool" },
                        { "label": "Mono", "path": "/devices/0/outputs/4/MixToMono/value", "type": "bool" },
                        { "label": "Alt Monitor", "path": "/devices/0/outputs/4/AltMonEnabled/value", "type": "bool" },
                        { "label": "Dim Attenuation", "path": "/devices/0/DimAttenuation/value", "type": "int", "min": 0, "max": 96 }
                    ]
                },
                "headphones": [
                    { "label": "HP 1", "path": "/devices/0/outputs/0", "controls": [
                        { "label": "Level", "path": "/devices/0/outputs/0/CRMonitorLevel/value", "type": "float", "min": -96.0, "max": 0.0 },
                        { "label": "Mute", "path": "/devices/0/outputs/0/Mute/value", "type": "bool" }
                    ]},
                    { "label": "HP 2", "path": "/devices/0/outputs/1", "controls": [
                        { "label": "Level", "path": "/devices/0/outputs/1/CRMonitorLevel/value", "type": "float", "min": -96.0, "max": 0.0 },
                        { "label": "Mute", "path": "/devices/0/outputs/1/Mute/value", "type": "bool" }
                    ]}
                ],
                "inputs": [
                    { "index": 0, "label": "Analog 1", "controls": [
                        { "label": "Fader", "path": "/devices/0/inputs/0/FaderLevel/value", "type": "float", "min": -144.0, "max": 6.0 },
                        { "label": "Pan", "path": "/devices/0/inputs/0/Pan/value", "type": "float", "min": -1.0, "max": 1.0 },
                        { "label": "Mute", "path": "/devices/0/inputs/0/Mute/value", "type": "bool" },
                        { "label": "Solo", "path": "/devices/0/inputs/0/Solo/value", "type": "bool" },
                        { "label": "Gain", "path": "/devices/0/inputs/0/Gain/value", "type": "float", "min": 0.0, "max": 65.0 },
                        { "label": "48V", "path": "/devices/0/inputs/0/48V/value", "type": "bool" },
                        { "label": "Pad", "path": "/devices/0/inputs/0/Pad/value", "type": "bool" },
                        { "label": "Low Cut", "path": "/devices/0/inputs/0/LowCut/value", "type": "bool" },
                        { "label": "Phase", "path": "/devices/0/inputs/0/Phase/value", "type": "bool" }
                    ]},
                    { "index": 1, "label": "Analog 2", "controls": [
                        { "label": "Fader", "path": "/devices/0/inputs/1/FaderLevel/value", "type": "float", "min": -144.0, "max": 6.0 },
                        { "label": "Pan", "path": "/devices/0/inputs/1/Pan/value", "type": "float", "min": -1.0, "max": 1.0 },
                        { "label": "Mute", "path": "/devices/0/inputs/1/Mute/value", "type": "bool" },
                        { "label": "Solo", "path": "/devices/0/inputs/1/Solo/value", "type": "bool" },
                        { "label": "Gain", "path": "/devices/0/inputs/1/Gain/value", "type": "float", "min": 0.0, "max": 65.0 },
                        { "label": "48V", "path": "/devices/0/inputs/1/48V/value", "type": "bool" },
                        { "label": "Pad", "path": "/devices/0/inputs/1/Pad/value", "type": "bool" },
                        { "label": "Low Cut", "path": "/devices/0/inputs/1/LowCut/value", "type": "bool" },
                        { "label": "Phase", "path": "/devices/0/inputs/1/Phase/value", "type": "bool" }
                    ]}
                ],
                "auxes": [
                    { "index": 0, "label": "Aux 1", "controls": [
                        { "label": "Fader", "path": "/devices/0/auxs/0/FaderLevel/value", "type": "float", "min": -144.0, "max": 6.0 },
                        { "label": "Mute", "path": "/devices/0/auxs/0/Mute/value", "type": "bool" }
                    ]},
                    { "index": 1, "label": "Aux 2", "controls": [
                        { "label": "Fader", "path": "/devices/0/auxs/1/FaderLevel/value", "type": "float", "min": -144.0, "max": 6.0 },
                        { "label": "Mute", "path": "/devices/0/auxs/1/Mute/value", "type": "bool" }
                    ]}
                ]
            }
        }
    })
}

// ── Tauri app setup ───────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // When launched at boot via autostart, --hidden suppresses the main window.
    let start_hidden = std::env::args().any(|a| a == "--hidden");

    let config = Arc::new(RwLock::new(Config::load()));
    let capturing = Arc::new(AtomicBool::new(false));
    let captured_tx: Arc<Mutex<Option<std::sync::mpsc::Sender<KeyCombo>>>> =
        Arc::new(Mutex::new(None));

    let hook_state = Arc::new(HookState {
        config: config.clone(),
        capturing: capturing.clone(),
        captured_tx: captured_tx.clone(),
    });
    spawn_hook(hook_state);
    let hotkey_handle = spawn_hotkey_manager(config.clone());
    let midi_handle = spawn_midi_manager(config.clone());

    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--hidden"])))
        .manage(AppState { config, capturing, captured_tx, hotkey_handle, midi_handle })
        .setup(move |app| {
            let state: State<AppState> = app.state();
            attach_app_handle(&state.midi_handle, app.handle().clone());
            setup_tray(app)?;
            if start_hidden {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.hide();
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_mappings,
            save_mapping,
            delete_mapping,
            get_control_value,
            set_control_value,
            sdk_status,
            start_key_capture,
            list_midi_devices,
            start_midi_capture,
            cancel_midi_capture,
            get_autostart,
            set_autostart,
            get_device_tree,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Apollo Control");
}

fn setup_tray(app: &mut tauri::App) -> tauri::Result<()> {
    let show = MenuItemBuilder::with_id("show", "Show Window").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit Apollo Control").build(app)?;
    let menu = MenuBuilder::new(app).item(&show).separator().item(&quit).build()?;

    TrayIconBuilder::new()
        .menu(&menu)
        .tooltip("Apollo Control")
        .icon(app.default_window_icon().unwrap().clone())
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click {
                button: tauri::tray::MouseButton::Left,
                button_state: tauri::tray::MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(win) = app.get_webview_window("main") {
                    if win.is_visible().unwrap_or(false) {
                        let _ = win.hide();
                    } else {
                        let _ = win.show();
                        let _ = win.set_focus();
                    }
                }
            }
        })
        .build(app)?;
    Ok(())
}
