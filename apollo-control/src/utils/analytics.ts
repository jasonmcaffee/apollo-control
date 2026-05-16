import { Mapping, Trigger } from "../models/types";
import { FlatControl } from "../hooks/useDeviceTree";
import { comboLabel } from "./keyTranslation";
import { midiTriggerLabel } from "./midiTranslation";

declare function gtag(command: string, eventName: string, params?: Record<string, unknown>): void;

/**
 * Fire a GA4 custom event. No-ops gracefully if gtag hasn't loaded yet.
 * @param eventName - GA4 event name (snake_case)
 * @param params - additional event parameters
 */
function track(eventName: string, params: Record<string, unknown> = {}): void {
  try {
    if (typeof gtag !== "function") return;
    gtag("event", eventName, params);
  } catch {
    // silently ignore if analytics fails
  }
}

/** Build a human-readable trigger label from any Trigger union. */
function triggerLabel(trigger: Trigger): string {
  if (trigger.source === "Key") return comboLabel({ modifiers: trigger.modifiers, key: trigger.key });
  return midiTriggerLabel(trigger);
}

/**
 * Track the app launching / initial page view.
 */
export function trackAppLaunch(): void {
  track("app_launch", { app_name: "apollo_control" });
}

/**
 * Track when a mapping is saved (keyboard or MIDI).
 * @param control - the control being mapped
 * @param mapping - the full mapping that was saved
 */
export function trackMappingSaved(control: FlatControl, mapping: Mapping): void {
  const trigger = mapping.trigger;
  const triggerType = trigger.source === "Key" ? "keyboard" : "midi";
  track("mapping_saved", {
    control_group: control.group,
    control_label: control.label,
    control_path: control.path,
    control_type: control.type ?? "float",
    trigger_type: triggerType,
    trigger_label: triggerLabel(trigger),
    action_type: mapping.action.type,
  });
}

/**
 * Track when a mapping is deleted.
 * @param mapping - the mapping that was removed
 */
export function trackMappingDeleted(mapping: Mapping): void {
  const triggerType = mapping.trigger.source === "Key" ? "keyboard" : "midi";
  track("mapping_deleted", {
    trigger_type: triggerType,
    trigger_label: triggerLabel(mapping.trigger),
    action_type: mapping.action.type,
    control_path: mapping.action.path,
  });
}

/**
 * Track when the mapping modal is opened for a control.
 * @param control - the control whose mapping modal was opened
 */
export function trackMappingModalOpened(control: FlatControl): void {
  track("mapping_modal_opened", {
    control_group: control.group,
    control_label: control.label,
    control_path: control.path,
    control_type: control.type ?? "float",
  });
}

/**
 * Track when the settings modal is opened.
 */
export function trackSettingsOpened(): void {
  track("settings_opened");
}
