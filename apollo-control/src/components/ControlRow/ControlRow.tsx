import { useEffect, useState } from "react";
import { BsKeyboard } from "react-icons/bs";
import { Mapping, asKeyCombo, asMidiTrigger } from "../../models/types";
import { FlatControl } from "../../hooks/useDeviceTree";
import { comboLabel } from "../../utils/keyTranslation";
import { midiTriggerLabel } from "../../utils/midiTranslation";
import { CircularKnob } from "../common/CircularKnob/CircularKnob";
import "./ControlRow.css";

interface ControlRowProps {
  control: FlatControl;
  value: unknown;
  mappings: Mapping[];
  onSetValue: (path: string, value: unknown) => void;
  onOpenModal: () => void;
}

/** Renders a single Apollo control with live interact UI and a Map button. */
export function ControlRow({ control, value, mappings, onSetValue, onOpenModal }: ControlRowProps) {
  if (control.type === "bool") {
    return <BoolRow control={control} value={value} mappings={mappings} onSetValue={onSetValue} onOpenModal={onOpenModal} />;
  }
  return <NumericRow control={control} value={value} mappings={mappings} onSetValue={onSetValue} onOpenModal={onOpenModal} />;
}

/** Header: label on the left, map icon (mapped = blue) on the right. */
function ControlHeader({ label, mapped, summary, onMapClick }: { label: string; mapped: boolean; summary: string | null; onMapClick: () => void }) {
  return (
    <div className="ctrl-row__header">
      <span className="ctrl-row__label">{label}</span>
      <button
        type="button"
        className={`ctrl-row__map-btn${mapped ? " ctrl-row__map-btn--mapped" : ""}`}
        onClick={onMapClick}
        title={mapped ? `Mapped: ${summary} — click to edit` : "Click to assign a key"}
        aria-label={mapped ? `Mapped: ${summary}` : "Assign a key"}
      >
        <BsKeyboard size={14} />
      </button>
    </div>
  );
}

/** Bool control row: header (label + map icon) on top, neumorphic toggle below. */
function BoolRow({ control, value, mappings, onSetValue, onOpenModal }: ControlRowProps) {
  const isOn = value === true || value === 1;
  const summary = getMappingSummary(mappings);

  return (
    <div className="ctrl-row ctrl-row--bool">
      <ControlHeader label={control.label} mapped={summary !== null} summary={summary} onMapClick={onOpenModal} />
      <button
        className={`ctrl-row__toggle${isOn ? " ctrl-row__toggle--on" : ""}`}
        onClick={() => onSetValue(control.path, !isOn)}
        title={isOn ? "Click to turn OFF" : "Click to turn ON"}
        aria-pressed={isOn}
      >
        <span className="ctrl-row__toggle-track">
          <span className="ctrl-row__toggle-thumb" />
        </span>
        <span className="ctrl-row__toggle-label">{isOn ? "ON" : "OFF"}</span>
      </button>
    </div>
  );
}

/** Numeric control row: header (label + map icon) on top, circular knob below. */
function NumericRow({ control, value, mappings, onSetValue, onOpenModal }: ControlRowProps) {
  const min = control.min ?? -96;
  const max = control.max ?? 0;
  const step = computeStep(min, max);
  const num = typeof value === "number" ? value : 0;
  const [localVal, setLocalVal] = useState(num);
  const summary = getMappingSummary(mappings);

  useEffect(() => { setLocalVal(num); }, [num]);

  return (
    <div className="ctrl-row ctrl-row--numeric">
      <ControlHeader label={control.label} mapped={summary !== null} summary={summary} onMapClick={onOpenModal} />
      <CircularKnob
        min={min}
        max={max}
        value={localVal}
        step={step}
        onChange={next => { setLocalVal(next); onSetValue(control.path, next); }}
        onLiveChange={setLocalVal}
        format={v => formatNum(v, control)}
        ariaLabel={`${control.group} ${control.label}`}
        size="md"
      />
    </div>
  );
}

/** Returns a short label representing the most relevant mapping for a control. */
function getMappingSummary(mappings: Mapping[]): string | null {
  if (mappings.length === 0) return null;
  const knob = mappings.find(m => {
    const c = asKeyCombo(m.trigger);
    return m.action.type === "Knob" || (c && c.key === "ScrollWheel");
  });
  if (knob) {
    const c = asKeyCombo(knob.trigger);
    if (c) {
      return c.modifiers.length ? `${c.modifiers.join("+")} + Scroll` : "Scroll Wheel";
    }
  }
  const first = mappings[0];
  const kb = asKeyCombo(first.trigger);
  if (kb) return comboLabel(kb);
  const midi = asMidiTrigger(first.trigger);
  if (midi) return midiTriggerLabel(midi);
  return null;
}

function computeStep(min: number, max: number): number {
  const range = max - min;
  if (range <= 2) return 0.1;
  if (range <= 10) return 0.5;
  if (range <= 30) return 1;
  return 2;
}

function formatNum(num: number, control: FlatControl): string {
  if (control.type === "int") return Math.round(num).toString();
  const abs = Math.abs(num);
  if (abs < 10) return num.toFixed(2);
  return num.toFixed(1);
}
