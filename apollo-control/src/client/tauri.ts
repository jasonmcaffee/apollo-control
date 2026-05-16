import { invoke } from "@tauri-apps/api/core";
import { Action, Mapping, MidiEvent, Trigger, keyTrigger, KeyCombo } from "../models/types";

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
