import { useEffect, useState } from "react";
import { Mapping } from "../../models/types";
import { FlatControl } from "../../hooks/useDeviceTree";
import { comboLabel } from "../../utils/keyTranslation";
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

function BoolRow({ control, value, mappings, onSetValue, onOpenModal }: ControlRowProps) {
  const isOn = value === true || value === 1;
  const summary = getMappingSummary(mappings);

  return (
    <div className="ctrl-row ctrl-row--bool">
      <span className="ctrl-row__label">{control.label}</span>
      <button
        className={`ctrl-row__toggle${isOn ? " ctrl-row__toggle--on" : ""}`}
        onClick={() => onSetValue(control.path, !isOn)}
        title={isOn ? "Click to turn OFF" : "Click to turn ON"}
      >
        {isOn ? "ON" : "OFF"}
      </button>
      <MapBtn summary={summary} onClick={onOpenModal} />
    </div>
  );
}

function NumericRow({ control, value, mappings, onSetValue, onOpenModal }: ControlRowProps) {
  const min = control.min ?? -96;
  const max = control.max ?? 0;
  const step = computeStep(min, max);
  const num = typeof value === "number" ? value : 0;
  const [sliderVal, setSliderVal] = useState(num);
  const summary = getMappingSummary(mappings);

  useEffect(() => { setSliderVal(num); }, [num]);

  const stepDown = () => onSetValue(control.path, clamp(num - step, min, max));
  const stepUp = () => onSetValue(control.path, clamp(num + step, min, max));

  return (
    <div className="ctrl-row ctrl-row--numeric">
      <div className="ctrl-row__top">
        <span className="ctrl-row__label">{control.label}</span>
        <span className="ctrl-row__value">{formatNum(num, control)}</span>
      </div>
      <div className="ctrl-row__slider-row">
        <input
          type="range"
          className="ctrl-row__slider"
          min={min} max={max} step={step / 4}
          value={sliderVal}
          onChange={e => setSliderVal(parseFloat(e.target.value))}
          onMouseUp={e => onSetValue(control.path, parseFloat((e.target as HTMLInputElement).value))}
          onTouchEnd={e => onSetValue(control.path, parseFloat((e.target as HTMLInputElement).value))}
        />
      </div>
      <div className="ctrl-row__actions">
        <div className="ctrl-row__steps">
          <button className="ctrl-row__step-btn" onClick={stepDown} title={`−${step}`}>−</button>
          <button className="ctrl-row__step-btn" onClick={stepUp} title={`+${step}`}>+</button>
        </div>
        <MapBtn summary={summary} onClick={onOpenModal} />
      </div>
    </div>
  );
}

interface MapBtnProps {
  summary: string | null;
  onClick: () => void;
}

/** Button showing the current mapping summary (or "Map") and opening the modal on click. */
function MapBtn({ summary, onClick }: MapBtnProps) {
  return (
    <button
      className={`ctrl-row__map-btn${summary ? " ctrl-row__map-btn--mapped" : ""}`}
      onClick={onClick}
      title={summary ? `Mapped: ${summary} — click to edit` : "Click to assign a key"}
    >
      {summary ? `⌨ ${summary}` : "Map"}
    </button>
  );
}

/** Returns a short label representing the most relevant mapping for a control. */
function getMappingSummary(mappings: Mapping[]): string | null {
  if (mappings.length === 0) return null;
  const knob = mappings.find(m => m.action.type === "Knob" || m.trigger.key === "ScrollWheel");
  if (knob) {
    const mods = knob.trigger.modifiers;
    return mods.length ? `${mods.join("+")} + Scroll` : "Scroll Wheel";
  }
  const first = mappings[0];
  return comboLabel(first.trigger);
}

function computeStep(min: number, max: number): number {
  const range = max - min;
  if (range <= 2) return 0.1;
  if (range <= 10) return 0.5;
  if (range <= 30) return 1;
  return 2;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, parseFloat(v.toFixed(4))));
}

function formatNum(num: number, control: FlatControl): string {
  if (control.type === "int") return Math.round(num).toString();
  const abs = Math.abs(num);
  if (abs < 10) return num.toFixed(2);
  return num.toFixed(1);
}
