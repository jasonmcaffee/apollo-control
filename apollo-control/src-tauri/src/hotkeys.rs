/**
 * Windows RegisterHotKey manager.
 *
 * WH_KEYBOARD_LL (used by rdev) is suppressed when Chromium/WebView2 has focus because
 * Chromium routes keyboard input through Raw Input, bypassing the LL hook chain.
 * RegisterHotKey delivers WM_HOTKEY via a thread message queue and is immune to this.
 *
 * Strategy:
 *   - Mappings WITH at least one modifier → registered via RegisterHotKey (always fires)
 *   - Mappings WITHOUT modifiers → left to rdev (works when app is not focused)
 *   - Knob action on VolumeUp trigger → also registers VolumeDown sibling (opposite direction)
 */

use crate::actions::{execute_action, execute_knob_step};
use crate::config::{Action, Config, Mapping, Trigger};
use std::collections::HashMap;
use std::sync::{Arc, RwLock};

#[cfg(windows)]
use winapi::um::winuser::{
    GetMessageW, PostThreadMessageW, RegisterHotKey, UnregisterHotKey,
    MOD_ALT, MOD_CONTROL, MOD_NOREPEAT, MOD_SHIFT, MOD_WIN, WM_HOTKEY, WM_USER,
};

/// Message sent to the hotkey thread to trigger a config reload.
#[cfg(windows)]
const WM_RELOAD_HOTKEYS: u32 = WM_USER + 1;

/**
 * Spawn the RegisterHotKey manager thread. Call this once at startup.
 * When the config changes (mappings saved/deleted), call `reload_hotkeys`.
 */
pub fn spawn_hotkey_manager(config: Arc<RwLock<Config>>) -> HotkeyHandle {
    #[cfg(windows)]
    {
        let (tid_tx, tid_rx) = std::sync::mpsc::channel::<u32>();
        let config_clone = config.clone();
        std::thread::spawn(move || {
            // Publish thread ID so the handle can send reload messages
            let tid = unsafe { winapi::um::processthreadsapi::GetCurrentThreadId() };
            let _ = tid_tx.send(tid);
            run_hotkey_loop(config_clone);
        });
        let thread_id = tid_rx.recv().unwrap_or(0);
        HotkeyHandle { thread_id }
    }
    #[cfg(not(windows))]
    {
        let _ = config;
        HotkeyHandle {}
    }
}

/** Opaque handle used to signal the hotkey thread to reload its registrations. */
pub struct HotkeyHandle {
    #[cfg(windows)]
    thread_id: u32,
}

impl HotkeyHandle {
    /** Signal the hotkey thread to unregister all hotkeys and re-register from current config. */
    pub fn reload(&self) {
        #[cfg(windows)]
        unsafe {
            PostThreadMessageW(self.thread_id, WM_RELOAD_HOTKEYS, 0, 0);
        }
    }
}

// ── Windows implementation ─────────────────────────────────────────────────

#[cfg(windows)]
fn hlog(msg: &str) {
    use std::io::Write;
    let path = "C:\\Users\\jason\\AppData\\Local\\Temp\\apollo-hotkey.log";
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(f, "[hotkey] {}", msg);
    }
}

#[cfg(windows)]
fn run_hotkey_loop(config: Arc<RwLock<Config>>) {
    // id → (mapping, direction): direction is Some(±1.0) for Knob, None for other actions
    let mut registered: HashMap<i32, (Mapping, Option<f64>)> = HashMap::new();
    let mut next_id: i32 = 1;

    register_all(&config, &mut registered, &mut next_id);

    unsafe {
        let mut msg = std::mem::zeroed::<winapi::um::winuser::MSG>();
        loop {
            let ret = GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0);
            if ret == 0 || ret == -1 {
                break;
            }
            if msg.message == WM_RELOAD_HOTKEYS {
                unregister_all(&mut registered);
                next_id = 1;
                register_all(&config, &mut registered, &mut next_id);
                continue;
            }
            if msg.message == WM_HOTKEY {
                let id = msg.wParam as i32;
                hlog(&format!("WM_HOTKEY id={} registered_count={}", id, registered.len()));
                if let Some((mapping, direction)) = registered.get(&id) {
                    let action = mapping.action.clone();
                    let dir = *direction;
                    let name = mapping.name.clone();
                    hlog(&format!("firing: {} dir={:?}", name, dir));
                    std::thread::spawn(move || {
                        let result = if let Some(d) = dir {
                            execute_knob_step(&action, d)
                        } else {
                            execute_action(&action)
                        };
                        if let Err(e) = result {
                            eprintln!("[hotkey error] {}: {}", name, e);
                        }
                    });
                }
            }
        }
    }
}

#[cfg(windows)]
fn register_all(config: &Arc<RwLock<Config>>, registered: &mut HashMap<i32, (Mapping, Option<f64>)>, next_id: &mut i32) {
    let cfg = match config.read() {
        Ok(c) => c,
        Err(_) => return,
    };
    for mapping in &cfg.mappings {
        if !mapping.enabled { continue; }
        let Trigger::Key(combo) = &mapping.trigger else { continue }; // MIDI triggers handled by midi.rs
        if combo.modifiers.is_empty() { continue; } // bare keys left to rdev

        let mods = modifiers_to_win(&combo.modifiers);

        if let Action::Knob { .. } = &mapping.action {
            if combo.key == "ScrollWheel" { continue; }
            // Register both VolumeUp (+1) and VolumeDown (-1)
            if let Some(vk_up) = key_to_vk(&combo.key) {
                register_one(vk_up, mods, mapping, Some(1.0), registered, next_id);
            }
            if let Some(sibling) = knob_sibling(&combo.key) {
                if let Some(vk_down) = key_to_vk(sibling) {
                    register_one(vk_down, mods, mapping, Some(-1.0), registered, next_id);
                }
            }
        } else if let Some(vk) = key_to_vk(&combo.key) {
            register_one(vk, mods, mapping, None, registered, next_id);
        }
    }
}

#[cfg(windows)]
fn register_one(vk: u32, mods: u32, mapping: &Mapping, direction: Option<f64>, registered: &mut HashMap<i32, (Mapping, Option<f64>)>, next_id: &mut i32) {
    let id = *next_id;
    *next_id += 1;
    let full_mods = mods | MOD_NOREPEAT as u32;
    let ok = unsafe { RegisterHotKey(std::ptr::null_mut(), id, full_mods, vk) };
    if ok != 0 {
        hlog(&format!("registered id={} vk={:#x} mods={:#x} dir={:?} name={}", id, vk, full_mods, direction, mapping.name));
        registered.insert(id, (mapping.clone(), direction));
    } else {
        let err = unsafe { winapi::um::errhandlingapi::GetLastError() };
        hlog(&format!("RegisterHotKey FAILED id={} vk={:#x} mods={:#x} err={}", id, vk, full_mods, err));
    }
}

#[cfg(windows)]
fn unregister_all(registered: &mut HashMap<i32, (Mapping, Option<f64>)>) {
    for id in registered.keys() {
        unsafe { UnregisterHotKey(std::ptr::null_mut(), *id); }
    }
    registered.clear();
}

#[cfg(windows)]
fn modifiers_to_win(modifiers: &[String]) -> u32 {
    let mut mods: u32 = 0;
    for m in modifiers {
        match m.as_str() {
            "Shift" => mods |= MOD_SHIFT as u32,
            "Ctrl" | "Control" => mods |= MOD_CONTROL as u32,
            "Alt" => mods |= MOD_ALT as u32,
            "Meta" | "Super" | "Win" => mods |= MOD_WIN as u32,
            _ => {}
        }
    }
    mods
}

/** Returns the sibling "down" key name for a knob trigger key. */
fn knob_sibling(trigger_key: &str) -> Option<&'static str> {
    match trigger_key {
        "VolumeUp" => Some("VolumeDown"),
        "VolumeDown" => Some("VolumeUp"),
        _ => None,
    }
}

/** Map rdev key names to Windows virtual key codes. */
#[cfg(windows)]
fn key_to_vk(key: &str) -> Option<u32> {
    use winapi::um::winuser::*;
    let vk = match key {
        // Letter keys
        k if k.starts_with("Key") && k.len() == 4 => {
            let ch = k.chars().nth(3)?;
            ch.to_ascii_uppercase() as u32
        }
        // Number row
        "Num0" => 0x30, "Num1" => 0x31, "Num2" => 0x32, "Num3" => 0x33, "Num4" => 0x34,
        "Num5" => 0x35, "Num6" => 0x36, "Num7" => 0x37, "Num8" => 0x38, "Num9" => 0x39,
        // Function keys
        "F1" => VK_F1 as u32, "F2" => VK_F2 as u32, "F3" => VK_F3 as u32,
        "F4" => VK_F4 as u32, "F5" => VK_F5 as u32, "F6" => VK_F6 as u32,
        "F7" => VK_F7 as u32, "F8" => VK_F8 as u32, "F9" => VK_F9 as u32,
        "F10" => VK_F10 as u32, "F11" => VK_F11 as u32, "F12" => VK_F12 as u32,
        // Navigation
        "UpArrow" => VK_UP as u32, "DownArrow" => VK_DOWN as u32,
        "LeftArrow" => VK_LEFT as u32, "RightArrow" => VK_RIGHT as u32,
        "Home" => VK_HOME as u32, "End" => VK_END as u32,
        "PageUp" => VK_PRIOR as u32, "PageDown" => VK_NEXT as u32,
        "Insert" => VK_INSERT as u32, "Delete" => VK_DELETE as u32,
        // Common
        "Return" => VK_RETURN as u32,
        "BackSpace" => VK_BACK as u32,
        "Tab" => VK_TAB as u32,
        "Escape" => VK_ESCAPE as u32,
        "Space" => VK_SPACE as u32,
        // Volume / media
        "VolumeUp" => VK_VOLUME_UP as u32,
        "VolumeDown" => VK_VOLUME_DOWN as u32,
        "VolumeMute" => VK_VOLUME_MUTE as u32,
        "MediaPlayPause" => VK_MEDIA_PLAY_PAUSE as u32,
        "MediaStop" => VK_MEDIA_STOP as u32,
        "MediaNextTrack" => VK_MEDIA_NEXT_TRACK as u32,
        "MediaPrevTrack" => VK_MEDIA_PREV_TRACK as u32,
        // Punctuation (best effort)
        "Minus" => VK_OEM_MINUS as u32,
        "Equal" => VK_OEM_PLUS as u32,
        "LeftBracket" => VK_OEM_4 as u32,
        "RightBracket" => VK_OEM_6 as u32,
        "BackSlash" => VK_OEM_5 as u32,
        "SemiColon" => VK_OEM_1 as u32,
        "Quote" => VK_OEM_7 as u32,
        "BackQuote" => VK_OEM_3 as u32,
        "Comma" => VK_OEM_COMMA as u32,
        "Dot" => VK_OEM_PERIOD as u32,
        "Slash" => VK_OEM_2 as u32,
        _ => return None,
    };
    Some(vk)
}
