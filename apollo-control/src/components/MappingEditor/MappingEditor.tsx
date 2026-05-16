import { useEffect, useState } from "react";
import { FlatControl } from "../../hooks/useDeviceTree";
import { Action, ActionType, KeyCombo, Mapping } from "../../models/types";
import { ControlPicker } from "../ControlPicker/ControlPicker";
import { KeyCapture } from "../KeyCapture/KeyCapture";
import "./MappingEditor.css";

interface MappingEditorProps {
  initial: Mapping | null;
  onSave: (mapping: Mapping) => void;
  onCancel: () => void;
}

/** Modal editor for creating or modifying a single key-to-control mapping. */
export function MappingEditor({ initial, onSave, onCancel }: MappingEditorProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [combo, setCombo] = useState<KeyCombo | null>(initial?.trigger ?? null);
  const [selectedControl, setSelectedControl] = useState<FlatControl | null>(null);
  const [actionType, setActionType] = useState<ActionType>(
    (initial?.action.type as ActionType) ?? "Toggle"
  );
  const [delta, setDelta] = useState(
    initial?.action.type === "Step" ? initial.action.delta : 2.0
  );

  useEffect(() => {
    if (initial?.action.type === "Step" || initial?.action.type === "Toggle") {
      // selectedControl is populated lazily via ControlPicker
    }
  }, [initial]);

  const handleSave = () => {
    if (!combo || !selectedControl) return;
    const action = buildAction(actionType, selectedControl, delta);
    const mapping: Mapping = {
      id: initial?.id ?? crypto.randomUUID(),
      name: name || `${combo.modifiers.join("+")}+${combo.key} → ${selectedControl.label}`,
      enabled: initial?.enabled ?? true,
      trigger: combo,
      action,
    };
    onSave(mapping);
  };

  const canSave = combo !== null && selectedControl !== null;

  return (
    <div className="mapping-editor-overlay" onClick={onCancel}>
      <div className="mapping-editor" onClick={e => e.stopPropagation()}>
        <h2 className="mapping-editor__title">
          {initial ? "Edit Mapping" : "New Mapping"}
        </h2>

        <label className="mapping-editor__label">Name (optional)</label>
        <input
          className="mapping-editor__input"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Auto-generated if blank"
        />

        <label className="mapping-editor__label">Key Combo</label>
        <KeyCapture value={combo} onChange={setCombo} />

        <label className="mapping-editor__label">Apollo Control</label>
        <ControlPicker value={selectedControl} onChange={setSelectedControl} />

        <label className="mapping-editor__label">Action</label>
        <div className="mapping-editor__action-row">
          <select
            className="mapping-editor__select"
            value={actionType}
            onChange={e => setActionType(e.target.value as ActionType)}
          >
            <option value="Toggle">Toggle (bool)</option>
            <option value="Step">Step (±value)</option>
            <option value="Set">Set (absolute)</option>
            <option value="Hold">Hold (while held)</option>
          </select>
          {actionType === "Step" && (
            <input
              className="mapping-editor__input mapping-editor__input--delta"
              type="number"
              value={delta}
              step={0.5}
              onChange={e => setDelta(Number(e.target.value))}
              placeholder="Delta"
            />
          )}
        </div>

        <div className="mapping-editor__footer">
          <button className="mapping-editor__btn mapping-editor__btn--cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="mapping-editor__btn mapping-editor__btn--save"
            onClick={handleSave}
            disabled={!canSave}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function buildAction(type: ActionType, control: FlatControl, delta: number): Action {
  switch (type) {
    case "Toggle":
      return { type: "Toggle", path: control.path };
    case "Step":
      return { type: "Step", path: control.path, delta, min: control.min ?? -96, max: control.max ?? 0 };
    case "Set":
      return { type: "Set", path: control.path, value: 0 };
    case "Hold":
      return { type: "Hold", path: control.path, press_value: true, release_value: false };
    case "Knob":
      return { type: "Knob", path: control.path, step: 2, min: control.min ?? -96, max: control.max ?? 0 };
  }
}
