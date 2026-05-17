import { Mapping, Trigger } from "../models/types";
import { FlatControl } from "../hooks/useDeviceTree";
import { comboLabel } from "./keyTranslation";
import { midiTriggerLabel } from "./midiTranslation";

const GA_ID = "G-YM7G0Q65NM";
const GA_API_SECRET = import.meta.env.VITE_GA_API_SECRET as string | undefined;
const MP_URL = `https://www.google-analytics.com/mp/collect?measurement_id=${GA_ID}&api_secret=${GA_API_SECRET}`;
const CLIENT_ID_KEY = "ga4_client_id";

/** Session ID is a Unix-second timestamp generated once per app launch. */
const SESSION_ID = String(Math.floor(Date.now() / 1000));

/** Returns a persistent random client ID stored in localStorage. */
function getClientId(): string {
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

/**
 * Send a GA4 event via the Measurement Protocol (direct fetch).
 * Fire-and-forget: errors are swallowed so analytics never affects the app.
 * @param eventName - GA4 event name (snake_case)
 * @param params - additional event parameters
 */
function track(eventName: string, params: Record<string, unknown> = {}): void {
  if (!GA_API_SECRET) return;
  const eventParams = {
    ...params,
    session_id: SESSION_ID,
    engagement_time_msec: 1,
    ...(import.meta.env.DEV ? { debug_mode: true } : {}),
  };
  const body = JSON.stringify({
    client_id: getClientId(),
    events: [{ name: eventName, params: eventParams }],
  });
  const init: RequestInit = { method: "POST", body };
  if (import.meta.env.DEV) {
    console.log("[analytics] sending", eventName, eventParams);
    fetch(MP_URL, init)
      .then(r => r.text().then(t => console.log("[analytics] response", r.status, t || "(empty)")))
      .catch(e => console.warn("[analytics] fetch error", e));
  } else {
    fetch(MP_URL, init).catch(() => {});
  }
}

/** Build a human-readable trigger label from any Trigger union. */
function triggerLabel(trigger: Trigger): string {
  if (trigger.source === "Key") return comboLabel({ modifiers: trigger.modifiers, key: trigger.key });
  return midiTriggerLabel(trigger);
}

/**
 * Track the app launching.
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
  track("mapping_saved", {
    control_group: control.group,
    control_label: control.label,
    control_path: control.path,
    control_type: control.type ?? "float",
    trigger_type: trigger.source === "Key" ? "keyboard" : "midi",
    trigger_label: triggerLabel(trigger),
    action_type: mapping.action.type,
  });
}

/**
 * Track when a mapping is deleted.
 * @param mapping - the mapping that was removed
 */
export function trackMappingDeleted(mapping: Mapping): void {
  track("mapping_deleted", {
    trigger_type: mapping.trigger.source === "Key" ? "keyboard" : "midi",
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

/**
 * Track when a numeric control knob is adjusted.
 * Intended to be called through a per-control debounce so rapid turns fire only one event.
 * @param control - the control that was adjusted
 * @param value - the settled value at the time the debounce fires
 */
export function trackControlAdjusted(control: FlatControl, value: number): void {
  track("control_adjusted", {
    control_group: control.group,
    control_label: control.label,
    control_path: control.path,
    control_type: control.type ?? "float",
    value,
  });
}
