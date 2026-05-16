export interface KeyCombo {
  modifiers: string[];
  key: string;
}

export type MidiKind = "note_on" | "note_off" | "cc" | "pitch_bend";
export type MidiMode = "discrete" | "continuous";

export interface MidiTrigger {
  device: string | null;
  channel: number | null;
  kind: MidiKind;
  data1: number;
  mode: MidiMode;
}

export type Trigger =
  | ({ source: "Key" } & KeyCombo)
  | ({ source: "Midi" } & MidiTrigger);

export interface MidiEvent {
  device: string;
  channel: number;
  kind: MidiKind;
  data1: number;
  data2: number;
  raw_value: number;
}

export type ActionType = "Toggle" | "Step" | "Set" | "Hold" | "Knob";

export interface ToggleAction {
  type: "Toggle";
  path: string;
}

export interface StepAction {
  type: "Step";
  path: string;
  delta: number;
  min: number;
  max: number;
}

export interface SetAction {
  type: "Set";
  path: string;
  value: unknown;
}

export interface HoldAction {
  type: "Hold";
  path: string;
  press_value: unknown;
  release_value: unknown;
}

export interface KnobAction {
  type: "Knob";
  path: string;
  step: number;
  min: number;
  max: number;
}

export type Action = ToggleAction | StepAction | SetAction | HoldAction | KnobAction;

export interface Mapping {
  id: string;
  name: string;
  enabled: boolean;
  trigger: Trigger;
  action: Action;
}

export interface ControlNode {
  label: string;
  path: string;
  type?: "bool" | "float" | "int";
  min?: number;
  max?: number;
}

export interface ControlGroup {
  label: string;
  path: string;
  controls?: ControlNode[];
  children?: Record<string, unknown>;
}

/** Build a Trigger from a KeyCombo (preserves discriminator). */
export function keyTrigger(combo: KeyCombo): Trigger {
  return { source: "Key", modifiers: combo.modifiers, key: combo.key };
}

/** Build a Trigger from a MidiTrigger payload. */
export function midiTrigger(m: MidiTrigger): Trigger {
  return { source: "Midi", ...m };
}

/** Extract the KeyCombo from a Trigger if it's a keyboard trigger, else null. */
export function asKeyCombo(t: Trigger): KeyCombo | null {
  return t.source === "Key" ? { modifiers: t.modifiers, key: t.key } : null;
}

/** Extract the MidiTrigger payload from a Trigger if it's a MIDI trigger, else null. */
export function asMidiTrigger(t: Trigger): MidiTrigger | null {
  if (t.source !== "Midi") return null;
  return { device: t.device, channel: t.channel, kind: t.kind, data1: t.data1, mode: t.mode };
}
