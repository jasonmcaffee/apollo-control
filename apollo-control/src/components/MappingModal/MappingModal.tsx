import { useEffect, useState } from "react";
import { FlatControl } from "../../hooks/useDeviceTree";
import { Action, KnobAction, KeyCombo, Mapping, StepAction } from "../../models/types";
import {
  CapturedCombo,
  comboLabel,
  eventToKeyCombo,
  getEventModifiers,
  scrollToKeyCombo,
  HARDWARE_KNOB_KEYS,
  normalizeKnobKey,
} from "../../utils/keyTranslation";
import "./MappingModal.css";

interface MappingModalProps {
  control: FlatControl;
  mappings: Mapping[];
  onSave: (mapping: Mapping) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

const MODIFIER_OPTIONS = ["Shift", "Ctrl", "Alt"];

/** Modal for viewing, editing, and capturing key/scroll mappings for a single control. */
export function MappingModal({ control, mappings, onSave, onDelete, onClose }: MappingModalProps) {
  const [captured, setCaptured] = useState<CapturedCombo | null>(null);
  const [liveModifiers, setLiveModifiers] = useState<string[]>([]);
  const [direction, setDirection] = useState<"pos" | "neg">("pos");
  const [knobMods, setKnobMods] = useState<string[]>([]);

  const isNumeric = control.type !== "bool";
  const isScrollCapture = captured?.kind === "scroll";
  const isKeyboardCapture = captured?.kind === "keyboard";
  const isKnobCapture = isKeyboardCapture && HARDWARE_KNOB_KEYS.has(captured!.combo.key);
  const showDirectionPicker = isNumeric && isKeyboardCapture && !isKnobCapture;
  const canSave = captured !== null && !(captured.kind === "scroll" && !isNumeric) && !(isKnobCapture && !isNumeric);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Escape") { onClose(); return; }
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
      // Normalize VolumeUp/Down to canonical "VolumeUp" anchor so both directions fire
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
    onSave({ id: crypto.randomUUID(), name, enabled: true, trigger, action });
    onClose();
  };

  /** Save a Volume Knob (VolumeUp/VolumeDown pair) mapping with the chosen modifiers. */
  const handleSaveVolumeKnob = () => {
    const trigger: KeyCombo = { modifiers: knobMods, key: "VolumeUp" };
    const min = control.min ?? -96;
    const max = control.max ?? 0;
    const step = computeStep(min, max);
    const action: KnobAction = { type: "Knob", path: control.path, step, min, max };
    const modLabel = knobMods.length ? knobMods.join("+") + " + " : "";
    const name = `${control.group} ${control.label} Knob (${modLabel}Volume Knob)`;
    onSave({ id: crypto.randomUUID(), name, enabled: true, trigger, action });
    onClose();
  };

  /** Toggle a modifier in the hardware knob section. */
  const toggleKnobMod = (mod: string) => {
    setKnobMods(prev => prev.includes(mod) ? prev.filter(m => m !== mod) : [...prev, mod]);
  };

  const liveLabel = getLiveLabel(captured, liveModifiers);

  return (
    <div className="mapping-modal__overlay" onClick={onClose}>
      <div className="mapping-modal" onClick={e => e.stopPropagation()}>

        <header className="mapping-modal__header">
          <span className="mapping-modal__title">Map — {control.group} {control.label}</span>
          <button className="mapping-modal__close" onClick={onClose}>✕</button>
        </header>

        {mappings.length > 0 && (
          <section className="mapping-modal__current">
            <div className="mapping-modal__section-label">Current mappings</div>
            {mappings.map(m => (
              <MappingRow key={m.id} mapping={m} onDelete={() => onDelete(m.id)} />
            ))}
          </section>
        )}

        {isNumeric && (
          <section className="mapping-modal__hardware-knob">
            <div className="mapping-modal__section-label">Volume Knob (keyboard media key)</div>
            <div className="mapping-modal__knob-row">
              <div className="mapping-modal__knob-mods">
                {MODIFIER_OPTIONS.map(mod => (
                  <button
                    key={mod}
                    className={`mapping-modal__mod-btn${knobMods.includes(mod) ? " mapping-modal__mod-btn--active" : ""}`}
                    onClick={() => toggleKnobMod(mod)}
                  >
                    {mod}
                  </button>
                ))}
              </div>
              <span className="mapping-modal__knob-label">
                {knobMods.length ? knobMods.join(" + ") + " + " : ""}Volume Knob
              </span>
              <button className="mapping-modal__btn mapping-modal__btn--save" onClick={handleSaveVolumeKnob}>
                Map
              </button>
            </div>
          </section>
        )}

        <section className="mapping-modal__capture">
          <div className="mapping-modal__section-label">
            {isNumeric ? "Or press a key combo / scroll to capture" : "Press a key combo to capture"}
          </div>
          <div className={`mapping-modal__live${captured ? " mapping-modal__live--captured" : ""}`}>
            {liveLabel}
          </div>

          {showDirectionPicker && (
            <div className="mapping-modal__direction">
              <button
                className={`mapping-modal__dir-btn${direction === "pos" ? " mapping-modal__dir-btn--active" : ""}`}
                onClick={() => setDirection("pos")}
              >▲ Increase</button>
              <button
                className={`mapping-modal__dir-btn${direction === "neg" ? " mapping-modal__dir-btn--active" : ""}`}
                onClick={() => setDirection("neg")}
              >▼ Decrease</button>
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
      </div>
    </div>
  );
}

interface MappingRowProps {
  mapping: Mapping;
  onDelete: () => void;
}

/** Single row showing an existing mapping with its key combo and action summary. */
function MappingRow({ mapping, onDelete }: MappingRowProps) {
  const triggerLabel = comboLabel(mapping.trigger);
  const actionLabel = getActionLabel(mapping.action);
  return (
    <div className="mapping-modal__mapping-row">
      <span className="mapping-modal__mapping-key">⌨ {triggerLabel}</span>
      <span className="mapping-modal__mapping-action">{actionLabel}</span>
      <button className="mapping-modal__mapping-delete" onClick={onDelete} title="Remove mapping">✕</button>
    </div>
  );
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
    case "Step": return (action as StepAction).delta > 0 ? `▲ +${(action as StepAction).delta}` : `▼ ${(action as StepAction).delta}`;
    case "Knob": return `Knob (+/-${(action as KnobAction).step})`;
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

  // Hardware volume knob (VolumeUp/VolumeDown) → bidirectional Knob action
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

function computeStep(min: number, max: number): number {
  const range = max - min;
  if (range <= 2) return 0.1;
  if (range <= 10) return 0.5;
  if (range <= 30) return 1;
  return 2;
}
