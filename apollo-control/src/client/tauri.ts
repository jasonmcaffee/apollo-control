import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { Action, Mapping, MidiEvent, Trigger, keyTrigger, KeyCombo } from "../models/types";

/** True when running inside the Tauri WebView. False when served by `vite dev` in a regular browser. */
function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Invoke a Tauri command, or fall back to the browser mock when running outside Tauri. */
async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (inTauri()) return tauriInvoke<T>(cmd, args);
  return browserMock<T>(cmd, args);
}

/** Fetch all saved mappings from the Rust backend. */
export async function getMappings(): Promise<Mapping[]> {
  return invoke<Mapping[]>("get_mappings");
}

/** Create or update a mapping. Returns the mapping id. */
export async function saveMapping(mapping: Mapping): Promise<string> {
  return invoke<string>("save_mapping", { mapping });
}

/** Delete a mapping by id. */
export async function deleteMapping(id: string): Promise<void> {
  return invoke<void>("delete_mapping", { id });
}

/** Get the current live value for an Apollo control path. */
export async function getControlValue(path: string): Promise<unknown> {
  return invoke<unknown>("get_control_value", { path });
}

/** Set an Apollo control value directly. */
export async function setControlValue(path: string, value: unknown): Promise<void> {
  return invoke<void>("set_control_value", { path, value });
}

/** Check if UAMixerEngine is reachable. */
export async function getSdkStatus(): Promise<boolean> {
  return invoke<boolean>("sdk_status");
}

/** Fetch the Apollo Solo device control tree. */
export async function getDeviceTree(): Promise<unknown> {
  return invoke<unknown>("get_device_tree");
}

/** List currently-connected MIDI input device names. */
export async function listMidiDevices(): Promise<string[]> {
  return invoke<string[]>("list_midi_devices");
}

/** Arm MIDI capture; resolves with the first matching event (30s timeout in backend). */
export async function startMidiCapture(device: string | null): Promise<MidiEvent> {
  return invoke<MidiEvent>("start_midi_capture", { device });
}

/** Disarm MIDI capture. */
export async function cancelMidiCapture(): Promise<void> {
  return invoke<void>("cancel_midi_capture");
}

/** Build a new mapping object with a generated id. */
export function createNewMapping(trigger: Trigger | KeyCombo, action: Action, name: string): Mapping {
  const t: Trigger = "source" in trigger ? trigger : keyTrigger(trigger);
  return {
    id: crypto.randomUUID(),
    name,
    enabled: true,
    trigger: t,
    action,
  };
}

// ─── Browser-mode mock ────────────────────────────────────────────────────
// Only used when the app is served by `vite dev` outside the Tauri WebView
// (e.g. for visual screenshots in a regular browser). The real Tauri backend
// is unaffected.

const mockValues: Record<string, unknown> = {
  "monitor/level": -18,
  "monitor/mute": false,
  "monitor/dim": false,
  "monitor/mono": false,
  "hp1/level": -12,
  "hp1/mute": false,
  "hp2/level": -24,
  "hp2/mute": true,
  "aux1/send/0": -36,
  "aux1/send/1": -42,
  "aux2/send/0": -28,
  "aux2/send/1": -28,
  "in1/fader": -6,
  "in1/pan": -30,
  "in1/phantom": true,
  "in1/pad": false,
  "in1/polarity": false,
  "in2/fader": -10,
  "in2/pan": 20,
  "in2/phantom": false,
  "in2/pad": true,
  "in2/polarity": false,
};

const mockMappings: Mapping[] = [
  {
    id: "mock-1",
    name: "Monitor Level Up",
    enabled: true,
    trigger: { source: "Key", modifiers: ["Cmd"], key: "ArrowUp" },
    action: { type: "Step", path: "monitor/level", delta: 2, min: -96, max: 0 },
  },
  {
    id: "mock-2",
    name: "Monitor Level Down",
    enabled: true,
    trigger: { source: "Key", modifiers: ["Cmd"], key: "ArrowDown" },
    action: { type: "Step", path: "monitor/level", delta: -2, min: -96, max: 0 },
  },
  {
    id: "mock-3",
    name: "Monitor Knob",
    enabled: true,
    trigger: { source: "Key", modifiers: [], key: "VolumeUp" },
    action: { type: "Knob", path: "monitor/level", step: 2, min: -96, max: 0 },
  },
  {
    id: "mock-4",
    name: "Mute Toggle",
    enabled: false,
    trigger: { source: "Key", modifiers: ["Cmd", "Shift"], key: "M" },
    action: { type: "Toggle", path: "monitor/mute" },
  },
];

const mockDeviceTree = {
  device: {
    children: {
      monitor: {
        label: "Monitor",
        controls: [
          { label: "Level", path: "monitor/level", type: "float", min: -96, max: 0 },
          { label: "Mute", path: "monitor/mute", type: "bool" },
          { label: "Dim", path: "monitor/dim", type: "bool" },
          { label: "Mono", path: "monitor/mono", type: "bool" },
        ],
      },
      headphones: [
        {
          label: "HP 1",
          controls: [
            { label: "Level", path: "hp1/level", type: "float", min: -96, max: 0 },
            { label: "Mute", path: "hp1/mute", type: "bool" },
          ],
        },
        {
          label: "HP 2",
          controls: [
            { label: "Level", path: "hp2/level", type: "float", min: -96, max: 0 },
            { label: "Mute", path: "hp2/mute", type: "bool" },
          ],
        },
      ],
      auxes: [
        {
          label: "Aux 1",
          controls: [
            { label: "Send 1", path: "aux1/send/0", type: "float", min: -96, max: 12 },
            { label: "Send 2", path: "aux1/send/1", type: "float", min: -96, max: 12 },
          ],
        },
        {
          label: "Aux 2",
          controls: [
            { label: "Send 1", path: "aux2/send/0", type: "float", min: -96, max: 12 },
            { label: "Send 2", path: "aux2/send/1", type: "float", min: -96, max: 12 },
          ],
        },
      ],
      inputs: [
        {
          label: "Analog 1",
          controls: [
            { label: "Fader", path: "in1/fader", type: "float", min: -96, max: 12 },
            { label: "Pan", path: "in1/pan", type: "float", min: -100, max: 100 },
            { label: "48V", path: "in1/phantom", type: "bool" },
            { label: "Pad", path: "in1/pad", type: "bool" },
            { label: "Polarity", path: "in1/polarity", type: "bool" },
          ],
        },
        {
          label: "Analog 2",
          controls: [
            { label: "Fader", path: "in2/fader", type: "float", min: -96, max: 12 },
            { label: "Pan", path: "in2/pan", type: "float", min: -100, max: 100 },
            { label: "48V", path: "in2/phantom", type: "bool" },
            { label: "Pad", path: "in2/pad", type: "bool" },
            { label: "Polarity", path: "in2/polarity", type: "bool" },
          ],
        },
      ],
    },
  },
};

/** Resolve invoke calls with synthetic Apollo data when running outside Tauri. */
async function browserMock<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  switch (cmd) {
    case "get_device_tree": return mockDeviceTree as T;
    case "sdk_status": return true as T;
    case "get_control_value": {
      const path = args?.path as string;
      return (mockValues[path] ?? 0) as T;
    }
    case "set_control_value": {
      const path = args?.path as string;
      const value = args?.value;
      if (path) mockValues[path] = value;
      return undefined as T;
    }
    case "get_mappings": return [...mockMappings] as T;
    case "save_mapping": {
      const m = args?.mapping as Mapping;
      const idx = mockMappings.findIndex(x => x.id === m.id);
      if (idx >= 0) mockMappings[idx] = m;
      else mockMappings.push(m);
      return m.id as T;
    }
    case "delete_mapping": {
      const id = args?.id as string;
      const idx = mockMappings.findIndex(x => x.id === id);
      if (idx >= 0) mockMappings.splice(idx, 1);
      return undefined as T;
    }
    case "list_midi_devices": return ["KeyLab mkII 49", "Launch Control XL"] as T;
    case "start_midi_capture": return { device: "KeyLab mkII 49", channel: 1, kind: "cc", data1: 7, data2: 64, raw_value: 64 } as T;
    case "cancel_midi_capture": return undefined as T;
    default:
      console.warn(`[browser-mock] unhandled invoke: ${cmd}`);
      return undefined as T;
  }
}
