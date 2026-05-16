import { useEffect, useRef, useState } from "react";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { AiOutlineClose } from "react-icons/ai";
import { BsKeyboard } from "react-icons/bs";
import { FiChevronUp, FiChevronDown } from "react-icons/fi";
import { TbPiano, TbAdjustmentsHorizontal, TbPlayerPlay } from "react-icons/tb";
import { FlatControl } from "../../hooks/useDeviceTree";
import {
  Action,
  KnobAction,
  KeyCombo,
  Mapping,
  StepAction,
  Trigger,
  MidiEvent,
  MidiMode,
  keyTrigger,
  midiTrigger,
  asKeyCombo,
  asMidiTrigger,
} from "../../models/types";
import {
  CapturedCombo,
  comboLabel,
  eventToKeyCombo,
  getEventModifiers,
  scrollToKeyCombo,
  HARDWARE_KNOB_KEYS,
  normalizeKnobKey,
} from "../../utils/keyTranslation";
import {
  eventToMidiTrigger,
  looksContinuous,
  midiEventLabel,
  midiTriggerLabel,
} from "../../utils/midiTranslation";
import {
  cancelMidiCapture,
  listMidiDevices,
  startMidiCapture,
} from "../../client/tauri";
import { Modal } from "../common/Modal/Modal";
import { IconButton } from "../common/IconButton/IconButton";
import "./MappingModal.css";

interface MappingModalProps {
  control: FlatControl;
  mappings: Mapping[];
  onSave: (mapping: Mapping) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

type Tab = "keyboard" | "midi";

/** Modal for viewing, editing, and capturing key/scroll/MIDI mappings for a single control. */
export function MappingModal({ control, mappings, onSave, onDelete, onClose }: MappingModalProps) {
  const [tab, setTab] = useState<Tab>("keyboard");

  return (
    <Modal
      onClose={onClose}
      windowClassName="mapping-modal__window"
      contentClassName="mapping-modal__content"
      title={`Map — ${control.group} ${control.label}`}
    >
      <div className="mapping-modal__tabs">
        <button
          className={`mapping-modal__tab${tab === "keyboard" ? " mapping-modal__tab--active" : ""}`}
          onClick={() => setTab("keyboard")}
        >
          <BsKeyboard size={14} />
          <span>Keyboard</span>
        </button>
        <button
          className={`mapping-modal__tab${tab === "midi" ? " mapping-modal__tab--active" : ""}`}
          onClick={() => setTab("midi")}
        >
          <TbPiano size={14} />
          <span>MIDI</span>
        </button>
      </div>

      {mappings.length > 0 && (
        <section className="mapping-modal__current">
          <div className="mapping-modal__section-label">Current mappings</div>
          {mappings.map(m => (
            <MappingRow key={m.id} mapping={m} onDelete={() => onDelete(m.id)} />
          ))}
        </section>
      )}

      {tab === "keyboard" && (
        <KeyboardCapture control={control} onSave={onSave} onClose={onClose} />
      )}
      {tab === "midi" && (
        <MidiCapture control={control} onSave={onSave} onClose={onClose} />
      )}
    </Modal>
  );
}

// ── Keyboard capture ───────────────────────────────────────────────────────

interface CaptureProps {
  control: FlatControl;
  onSave: (mapping: Mapping) => void;
  onClose: () => void;
}

/** Keyboard / scroll / hardware-knob capture pane. */
function KeyboardCapture({ control, onSave, onClose }: CaptureProps) {
  const [captured, setCaptured] = useState<CapturedCombo | null>(null);
  const [liveModifiers, setLiveModifiers] = useState<string[]>([]);
  const [direction, setDirection] = useState<"pos" | "neg">("pos");
  const isNumeric = control.type !== "bool";
  const isScrollCapture = captured?.kind === "scroll";
  const isKeyboardCapture = captured?.kind === "keyboard";
  const isKnobCapture = isKeyboardCapture && HARDWARE_KNOB_KEYS.has(captured!.combo.key);
  const showDirectionPicker = isNumeric && isKeyboardCapture && !isKnobCapture;
  const canSave = captured !== null && !(captured.kind === "scroll" && !isNumeric) && !(isKnobCapture && !isNumeric);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Esc is handled by the common Modal — don't double-handle it here.
      if (e.code === "Escape") return;
      e.preventDefault();
      const combo = eventToKeyCombo(e);
      if (!combo) {
        setLiveModifiers(getEventModifiers(e));
        return;
      }
      setCaptured({ kind: "keyboard", combo });
      setLiveModifiers([]);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      setLiveModifiers(getEventModifiers(e));
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!isNumeric) return;
      setCaptured({ kind: "scroll", modifiers: getEventModifiers(e) });
      setLiveModifiers([]);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("wheel", onWheel);
    };
  }, [isNumeric, onClose]);

  /** Save a mapping from the key/scroll capture section. */
  const handleSaveCapture = () => {
    if (!captured) return;
    let trigger: KeyCombo;
    if (captured.kind === "scroll") {
      trigger = scrollToKeyCombo(captured.modifiers);
    } else if (isKnobCapture) {
      trigger = { modifiers: captured.combo.modifiers, key: normalizeKnobKey(captured.combo.key) };
    } else {
      trigger = captured.combo;
    }
    const action = buildCaptureAction(control, captured, direction);
    if (!action) return;
    const label = comboLabel(trigger);
    const isKnob = captured.kind === "scroll" || isKnobCapture;
    const dirLabel = isKnob ? "Knob" : direction === "pos" ? "▲" : "▼";
    const name = `${control.group} ${control.label} ${dirLabel} (${label})`;
    onSave({ id: crypto.randomUUID(), name, enabled: true, trigger: keyTrigger(trigger), action });
    onClose();
  };

  const liveLabel = getLiveLabel(captured, liveModifiers);

  return (
    <>
      <section className="mapping-modal__capture">
        <div className="mapping-modal__section-label">
          {isNumeric ? "Press a key combo / scroll wheel" : "Press a key combo to capture"}
        </div>
        <div className={`mapping-modal__live${captured ? " mapping-modal__live--captured" : ""}`}>
          {liveLabel}
        </div>

        {showDirectionPicker && (
          <div className="mapping-modal__direction">
            <button
              className={`mapping-modal__dir-btn${direction === "pos" ? " mapping-modal__dir-btn--active" : ""}`}
              onClick={() => setDirection("pos")}
            >
              <FiChevronUp size={14} /> Increase
            </button>
            <button
              className={`mapping-modal__dir-btn${direction === "neg" ? " mapping-modal__dir-btn--active" : ""}`}
              onClick={() => setDirection("neg")}
            >
              <FiChevronDown size={14} /> Decrease
            </button>
          </div>
        )}

        {(isScrollCapture || isKnobCapture) && (
          <div className="mapping-modal__scroll-note">
            Knob will increase or decrease based on direction
          </div>
        )}
      </section>

      <footer className="mapping-modal__footer">
        <button className="mapping-modal__btn mapping-modal__btn--cancel" onClick={onClose}>Cancel</button>
        <button
          className="mapping-modal__btn mapping-modal__btn--save"
          onClick={handleSaveCapture}
          disabled={!canSave}
        >
          Save Mapping
        </button>
      </footer>
    </>
  );
}

// ── MIDI capture pane ──────────────────────────────────────────────────────

/** MIDI Learn pane: device dropdown, live event readout, mode toggle, save. */
function MidiCapture({ control, onSave, onClose }: CaptureProps) {
  const [devices, setDevices] = useState<string[]>([]);
  const [deviceFilter, setDeviceFilter] = useState<string>("__all__");
  const [captured, setCaptured] = useState<MidiEvent | null>(null);
  const [latestLive, setLatestLive] = useState<MidiEvent | null>(null);
  const [mode, setMode] = useState<MidiMode>("discrete");
  const [discreteAction, setDiscreteAction] = useState<"toggle" | "hold">("toggle");
  const [learning, setLearning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isNumeric = control.type !== "bool";
  const prevEventRef = useRef<MidiEvent | null>(null);

  /** Refresh the device list when the modal opens. */
  useEffect(() => {
    let alive = true;
    listMidiDevices().then(d => { if (alive) setDevices(d); }).catch(() => {});
    const unlistenPromise = listen<string[]>("midi:devices", e => {
      if (alive) setDevices(e.payload);
    });
    return () => {
      alive = false;
      unlistenPromise.then(un => un()).catch(() => {});
    };
  }, []);

  /** Listen for live MIDI events while the Learn flow is active. */
  useEffect(() => {
    if (!learning) return;
    let unlisten: UnlistenFn | null = null;
    listen<MidiEvent>("midi:event", e => {
      const ev = e.payload;
      setLatestLive(ev);
      setCaptured(prev => prev ?? ev);
      const prev = prevEventRef.current;
      if (prev && looksContinuous(prev, ev)) {
        setMode("continuous");
      }
      prevEventRef.current = ev;
    }).then(un => { unlisten = un; });
    return () => { if (unlisten) unlisten(); };
  }, [learning]);

  /** Kick off the backend's capture future. Resolves with the first event. */
  const handleLearn = async () => {
    setError(null);
    setCaptured(null);
    setLatestLive(null);
    prevEventRef.current = null;
    setLearning(true);
    const device = deviceFilter === "__all__" ? null : deviceFilter;
    try {
      const ev = await startMidiCapture(device);
      setCaptured(prev => prev ?? ev);
      setLatestLive(prev => prev ?? ev);
      if (ev.kind === "cc" || ev.kind === "pitch_bend") setMode("continuous");
      else setMode("discrete");
    } catch (e) {
      setError(String(e));
    }
  };

  /** Disarm backend capture on unmount or when leaving the tab. */
  useEffect(() => {
    return () => {
      cancelMidiCapture().catch(() => {});
    };
  }, []);

  const handleSave = () => {
    if (!captured) return;
    const device = deviceFilter === "__all__" ? null : deviceFilter;
    const trigger = eventToMidiTrigger(captured, device, mode);
    const action = buildMidiAction(control, mode, discreteAction);
    if (!action) return;
    const name = `${control.group} ${control.label} ${mode === "continuous" ? "🎚" : "▶"} (${midiTriggerLabel(trigger)})`;
    onSave({
      id: crypto.randomUUID(),
      name,
      enabled: true,
      trigger: midiTrigger(trigger),
      action,
    });
    cancelMidiCapture().catch(() => {});
    onClose();
  };

  const handleCancel = () => {
    cancelMidiCapture().catch(() => {});
    onClose();
  };

  const liveLabel = renderMidiLiveLabel(captured, latestLive, learning, error);
  const canSave = captured !== null && (isNumeric || mode === "discrete");

  return (
    <>
      <section className="mapping-modal__capture">
        <div className="mapping-modal__section-label">MIDI Device</div>
        <select
          className="mapping-modal__midi-device"
          value={deviceFilter}
          onChange={e => setDeviceFilter(e.target.value)}
        >
          <option value="__all__">All devices</option>
          {devices.map(d => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>

        <div className="mapping-modal__section-label" style={{ marginTop: 14 }}>
          MIDI Learn
        </div>
        <div className={`mapping-modal__live${captured ? " mapping-modal__live--captured" : ""}`}>
          {liveLabel}
        </div>

        <button
          className="mapping-modal__btn mapping-modal__btn--cancel mapping-modal__learn-btn"
          onClick={handleLearn}
          disabled={learning && captured === null}
        >
          {learning ? (captured ? "Capture more…" : "Listening…") : "Start Listening"}
        </button>

        {captured && (
          <div className="mapping-modal__midi-options">
            <div className="mapping-modal__section-label">Mode</div>
            <div className="mapping-modal__direction">
              <button
                className={`mapping-modal__dir-btn${mode === "continuous" ? " mapping-modal__dir-btn--active" : ""}`}
                onClick={() => setMode("continuous")}
                disabled={!isNumeric}
                title={!isNumeric ? "Continuous mode requires a numeric control" : undefined}
              >
                <TbAdjustmentsHorizontal size={14} /> Continuous
              </button>
              <button
                className={`mapping-modal__dir-btn${mode === "discrete" ? " mapping-modal__dir-btn--active" : ""}`}
                onClick={() => setMode("discrete")}
              >
                <TbPlayerPlay size={14} /> Discrete
              </button>
            </div>

            {mode === "discrete" && (
              <>
                <div className="mapping-modal__section-label" style={{ marginTop: 10 }}>Action on note</div>
                <div className="mapping-modal__direction">
                  <button
                    className={`mapping-modal__dir-btn${discreteAction === "toggle" ? " mapping-modal__dir-btn--active" : ""}`}
                    onClick={() => setDiscreteAction("toggle")}
                  >Toggle</button>
                  <button
                    className={`mapping-modal__dir-btn${discreteAction === "hold" ? " mapping-modal__dir-btn--active" : ""}`}
                    onClick={() => setDiscreteAction("hold")}
                    disabled={control.type !== "bool"}
                    title={control.type !== "bool" ? "Hold is only valid on bool controls" : undefined}
                  >Hold</button>
                </div>
              </>
            )}

            <div className="mapping-modal__scroll-note">
              {mode === "continuous"
                ? "Knob/Fader position 0..127 maps to the control range."
                : "Note On triggers the action."}
            </div>
          </div>
        )}
      </section>

      <footer className="mapping-modal__footer">
        <button className="mapping-modal__btn mapping-modal__btn--cancel" onClick={handleCancel}>Cancel</button>
        <button
          className="mapping-modal__btn mapping-modal__btn--save"
          onClick={handleSave}
          disabled={!canSave}
        >Save Mapping</button>
      </footer>
    </>
  );
}

/** Render the live readout in the MIDI learn pane. */
function renderMidiLiveLabel(captured: MidiEvent | null, live: MidiEvent | null, learning: boolean, error: string | null): string {
  if (error) return `Error: ${error}`;
  if (live) return midiEventLabel(live);
  if (captured) return midiEventLabel(captured);
  if (learning) return "Listening — move a fader, turn a knob, or play a note…";
  return "Click \"Start Listening\" and play your controller.";
}

// ── MappingRow (existing-mappings list inside the modal) ───────────────────

interface MappingRowProps {
  mapping: Mapping;
  onDelete: () => void;
}

/** Single row showing an existing mapping with its trigger and action summary. */
function MappingRow({ mapping, onDelete }: MappingRowProps) {
  const triggerStr = renderTriggerLabel(mapping.trigger);
  const actionLabel = getActionLabel(mapping.action);
  return (
    <div className="mapping-modal__mapping-row">
      <span className="mapping-modal__mapping-key">{triggerStr}</span>
      <span className="mapping-modal__mapping-action">{actionLabel}</span>
      <IconButton
        Icon={AiOutlineClose}
        onClick={onDelete}
        size={12}
        title="Remove mapping"
        ariaLabel="Remove mapping"
        className="mapping-modal__mapping-delete"
      />
    </div>
  );
}

function renderTriggerLabel(t: Trigger): string {
  const kb = asKeyCombo(t);
  if (kb) return comboLabel(kb);
  const midi = asMidiTrigger(t);
  if (midi) return midiTriggerLabel(midi);
  return "?";
}

function getLiveLabel(captured: CapturedCombo | null, liveModifiers: string[]): string {
  if (captured) {
    if (captured.kind === "scroll") {
      const prefix = captured.modifiers.length ? captured.modifiers.join(" + ") + " + " : "";
      return `${prefix}Scroll Wheel — captured`;
    }
    if (captured.kind === "keyboard" && HARDWARE_KNOB_KEYS.has(captured.combo.key)) {
      const prefix = captured.combo.modifiers.length ? captured.combo.modifiers.join(" + ") + " + " : "";
      return `${prefix}Volume Knob — captured`;
    }
    return `${comboLabel(captured.combo)} — captured`;
  }
  if (liveModifiers.length) return liveModifiers.join(" + ") + " + …";
  return "Press keys or scroll wheel…";
}

function getActionLabel(action: Action): string {
  switch (action.type) {
    case "Toggle": return "Toggle";
    case "Step": return (action as StepAction).delta > 0 ? `+${(action as StepAction).delta}` : `${(action as StepAction).delta}`;
    case "Knob": return `Knob (±${(action as KnobAction).step})`;
    case "Set": return `Set value`;
    case "Hold": return `Hold`;
  }
}

function buildCaptureAction(control: FlatControl, captured: CapturedCombo, direction: "pos" | "neg"): Action | null {
  const min = control.min ?? -96;
  const max = control.max ?? 0;
  const step = computeStep(min, max);

  if (captured.kind === "scroll") {
    if (control.type === "bool") return null;
    return { type: "Knob", path: control.path, step, min, max } satisfies KnobAction;
  }

  if (captured.kind === "keyboard" && HARDWARE_KNOB_KEYS.has(captured.combo.key)) {
    if (control.type === "bool") return null;
    return { type: "Knob", path: control.path, step, min, max } satisfies KnobAction;
  }

  if (control.type === "bool") {
    return { type: "Toggle", path: control.path };
  }

  const delta = direction === "pos" ? step : -step;
  return { type: "Step", path: control.path, delta, min, max } satisfies StepAction;
}

/** Map a captured MIDI trigger + chosen mode to an Action against the target control. */
function buildMidiAction(control: FlatControl, mode: MidiMode, discreteAction: "toggle" | "hold"): Action | null {
  const min = control.min ?? -96;
  const max = control.max ?? 0;
  const step = computeStep(min, max);

  if (mode === "continuous") {
    if (control.type === "bool") return null;
    return { type: "Knob", path: control.path, step, min, max } satisfies KnobAction;
  }

  if (control.type === "bool") {
    if (discreteAction === "hold") {
      return { type: "Hold", path: control.path, press_value: true, release_value: false };
    }
    return { type: "Toggle", path: control.path };
  }
  return { type: "Step", path: control.path, delta: step, min, max } satisfies StepAction;
}

function computeStep(min: number, max: number): number {
  const range = max - min;
  if (range <= 2) return 0.1;
  if (range <= 10) return 0.5;
  if (range <= 30) return 1;
  return 2;
}
