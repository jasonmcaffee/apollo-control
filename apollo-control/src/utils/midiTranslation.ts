import { MidiEvent, MidiKind, MidiTrigger } from "../models/types";

/** Note number → name table (C-1..G9). */
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** Human-readable note name for a 0-127 MIDI note number, e.g. 60 → "C4". */
export function noteName(n: number): string {
  const octave = Math.floor(n / 12) - 1;
  return `${NOTE_NAMES[n % 12]}${octave}`;
}

/** Short label for a MIDI event kind (used in live capture display). */
export function midiKindLabel(kind: MidiKind): string {
  switch (kind) {
    case "note_on": return "Note On";
    case "note_off": return "Note Off";
    case "cc": return "CC";
    case "pitch_bend": return "Pitch";
  }
}

/** Short label for the device portion of a trigger ("All" or the device name). */
export function deviceLabel(device: string | null | undefined): string {
  return device ?? "All";
}

/** Compact one-line description of a MIDI trigger for table/row displays. */
export function midiTriggerLabel(t: { device: string | null; channel: number | null; kind: MidiKind; data1: number; mode: string }): string {
  const dev = deviceLabel(t.device);
  const ch = t.channel === null ? "ch*" : `ch${t.channel + 1}`;
  const kind = midiKindLabel(t.kind);
  let payload = "";
  switch (t.kind) {
    case "note_on":
    case "note_off":
      payload = `${noteName(t.data1)} (${t.data1})`;
      break;
    case "cc":
      payload = `CC ${t.data1}`;
      break;
    case "pitch_bend":
      payload = "PB";
      break;
  }
  return `🎹 ${dev} · ${ch} · ${kind} ${payload}`;
}

/** Verbose live label of a captured event (used during MIDI Learn). */
export function midiEventLabel(ev: MidiEvent): string {
  const dev = deviceLabel(ev.device);
  const ch = `ch${ev.channel + 1}`;
  switch (ev.kind) {
    case "note_on":
      return `${dev} · ${ch} · Note On ${noteName(ev.data1)} v${ev.data2}`;
    case "note_off":
      return `${dev} · ${ch} · Note Off ${noteName(ev.data1)}`;
    case "cc":
      return `${dev} · ${ch} · CC ${ev.data1} = ${ev.data2}`;
    case "pitch_bend":
      return `${dev} · ${ch} · Pitch Bend = ${ev.raw_value}`;
  }
}

/** Build a MidiTrigger from a captured MidiEvent + chosen device filter + chosen mode. */
export function eventToMidiTrigger(ev: MidiEvent, deviceFilter: string | null, mode: "continuous" | "discrete"): MidiTrigger {
  return {
    device: deviceFilter,
    channel: ev.channel,
    kind: ev.kind,
    data1: ev.kind === "pitch_bend" ? 0 : ev.data1,
    mode,
  };
}

/** Heuristic: would this event-stream pattern suggest a continuous (knob/fader) trigger? */
export function looksContinuous(prev: MidiEvent | null, current: MidiEvent): boolean {
  // Pitch bend is always continuous.
  if (current.kind === "pitch_bend") return true;
  if (!prev) return false;
  if (prev.kind !== current.kind || prev.data1 !== current.data1) return false;
  return Math.abs(prev.data2 - current.data2) > 1;
}
