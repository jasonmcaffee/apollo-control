import { KeyCombo } from "../models/types";

export type CapturedCombo =
  | { kind: "keyboard"; combo: KeyCombo }
  | { kind: "scroll"; modifiers: string[] };

/** JS KeyboardEvent.code values that differ from rdev's Key Debug format. */
const JS_CODE_TO_RDEV: Record<string, string> = {
  Enter: "Return",
  ArrowUp: "UpArrow",
  ArrowDown: "DownArrow",
  ArrowLeft: "LeftArrow",
  ArrowRight: "RightArrow",
  Digit0: "Num0", Digit1: "Num1", Digit2: "Num2", Digit3: "Num3", Digit4: "Num4",
  Digit5: "Num5", Digit6: "Num6", Digit7: "Num7", Digit8: "Num8", Digit9: "Num9",
  Backquote: "BackQuote",
  BracketLeft: "LeftBracket",
  BracketRight: "RightBracket",
  Semicolon: "SemiColon",
  Backslash: "BackSlash",
  Period: "Dot",
  NumpadEnter: "KpReturn",
  NumpadAdd: "KpPlus",
  NumpadSubtract: "KpMinus",
  NumpadMultiply: "KpMultiply",
  NumpadDivide: "KpDivide",
  Numpad0: "Kp0", Numpad1: "Kp1", Numpad2: "Kp2", Numpad3: "Kp3", Numpad4: "Kp4",
  Numpad5: "Kp5", Numpad6: "Kp6", Numpad7: "Kp7", Numpad8: "Kp8", Numpad9: "Kp9",
  NumpadDecimal: "KpDelete",
  // Hardware media/volume keys (Apollo hardware knob sends these as keyboard events)
  AudioVolumeUp: "VolumeUp",
  AudioVolumeDown: "VolumeDown",
  AudioVolumeMute: "VolumeMute",
};

/** Keys that represent a bidirectional hardware knob (VolumeUp is the canonical anchor). */
export const HARDWARE_KNOB_KEYS = new Set(["VolumeUp", "VolumeDown"]);

/** Normalize a knob key to its canonical "up" anchor for storage in the trigger. */
export function normalizeKnobKey(_key: string): string {
  return "VolumeUp";
}

const MODIFIER_CODES = new Set([
  "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight",
  "AltLeft", "AltRight", "MetaLeft", "MetaRight",
]);

/** Extract modifier names from any input event. */
export function getEventModifiers(e: KeyboardEvent | WheelEvent): string[] {
  const mods: string[] = [];
  if (e.ctrlKey) mods.push("Ctrl");
  if (e.shiftKey) mods.push("Shift");
  if (e.altKey) mods.push("Alt");
  if (e.metaKey) mods.push("Meta");
  return mods;
}

/** Convert a scroll+modifier combo into the KeyCombo trigger format used by rdev. */
export function scrollToKeyCombo(modifiers: string[]): KeyCombo {
  return { modifiers, key: "ScrollWheel" };
}

/** Human-readable label for a KeyCombo (e.g. "Ctrl+Shift+KeyA" or "Shift + Scroll"). */
export function comboLabel(combo: KeyCombo): string {
  const parts = [...combo.modifiers];
  if (combo.key === "ScrollWheel") parts.push("Scroll");
  else if (combo.key === "VolumeUp") parts.push("Volume Knob");
  else if (combo.key) parts.push(combo.key);
  return parts.join(" + ");
}

/**
 * Convert a JS KeyboardEvent to a KeyCombo matching rdev's key name format.
 * Returns null if the pressed key is a bare modifier (nothing useful to capture).
 * @param e - the browser KeyboardEvent
 */
export function eventToKeyCombo(e: KeyboardEvent): KeyCombo | null {
  if (MODIFIER_CODES.has(e.code)) return null;

  const modifiers: string[] = [];
  if (e.ctrlKey) modifiers.push("Ctrl");
  if (e.shiftKey) modifiers.push("Shift");
  if (e.altKey) modifiers.push("Alt");
  if (e.metaKey) modifiers.push("Meta");

  // Media keys (VolumeUp/Down etc.) have e.code="" in WebView2 — fall back to e.key
  const codeOrKey = e.code || e.key;
  const key = JS_CODE_TO_RDEV[codeOrKey] ?? codeOrKey;
  if (!key) return null;
  return { modifiers, key };
}
