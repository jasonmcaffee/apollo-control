import { useState } from "react";
import { FiPlus, FiEdit2, FiTrash2 } from "react-icons/fi";
import { MappingEditor } from "../../components/MappingEditor/MappingEditor";
import { IconButton } from "../../components/common/IconButton/IconButton";
import { useMappings } from "../../hooks/useMappings";
import { Mapping, Trigger } from "../../models/types";
import { midiTriggerLabel } from "../../utils/midiTranslation";
import "./MappingList.css";

/** Main view: table of all configured key-to-Apollo-control mappings with CRUD actions. */
export function MappingList() {
  const { mappings, loading, error, upsert, remove, toggleEnabled } = useMappings();
  const [editing, setEditing] = useState<Mapping | null | "new">(null);

  const handleSave = async (mapping: Mapping) => {
    await upsert(mapping);
    setEditing(null);
  };

  if (loading) return <div className="mapping-list__state">Loading…</div>;
  if (error) return <div className="mapping-list__state mapping-list__state--error">{error}</div>;

  return (
    <div className="mapping-list">
      <div className="mapping-list__toolbar">
        <span className="mapping-list__count">
          {mappings.length} {mappings.length === 1 ? "mapping" : "mappings"}
        </span>
        <button className="mapping-list__add-btn" onClick={() => setEditing("new")}>
          <FiPlus size={16} />
          <span>Add Mapping</span>
        </button>
      </div>

      {mappings.length === 0 ? (
        <EmptyState onAdd={() => setEditing("new")} />
      ) : (
        <div className="mapping-list__card">
          <table className="mapping-list__table">
            <thead>
              <tr>
                <th>Trigger</th>
                <th>Name</th>
                <th>Action</th>
                <th>On</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {mappings.map(m => (
                <MappingRow
                  key={m.id}
                  mapping={m}
                  onEdit={() => setEditing(m)}
                  onDelete={() => remove(m.id)}
                  onToggle={() => toggleEnabled(m.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing !== null && (
        <MappingEditor
          initial={editing === "new" ? null : editing}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}

interface MappingRowProps {
  mapping: Mapping;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}

function MappingRow({ mapping, onEdit, onDelete, onToggle }: MappingRowProps) {
  const combo = triggerLabel(mapping.trigger);
  const actionSummary = summarizeAction(mapping);

  return (
    <tr className={mapping.enabled ? "" : "mapping-list__row--disabled"}>
      <td className="mapping-list__combo">{combo}</td>
      <td className="mapping-list__name">{mapping.name}</td>
      <td className="mapping-list__action-summary">{actionSummary}</td>
      <td>
        <label className="mapping-list__switch">
          <input
            type="checkbox"
            checked={mapping.enabled}
            onChange={onToggle}
            aria-label="Enable/disable mapping"
          />
          <span className="mapping-list__switch-track">
            <span className="mapping-list__switch-thumb" />
          </span>
        </label>
      </td>
      <td className="mapping-list__actions">
        <IconButton Icon={FiEdit2} onClick={onEdit} size={14} title="Edit" ariaLabel="Edit mapping" />
        <IconButton Icon={FiTrash2} onClick={onDelete} size={14} title="Delete" ariaLabel="Delete mapping" className="mapping-list__btn--danger" />
      </td>
    </tr>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="mapping-list__empty">
      <p>No mappings yet.</p>
      <button className="mapping-list__add-btn" onClick={onAdd}>
        <FiPlus size={16} />
        <span>Add your first mapping</span>
      </button>
    </div>
  );
}

/** Build a short human-readable label for the trigger column in the list view. */
function triggerLabel(t: Trigger): string {
  if (t.source === "Key") {
    return [...t.modifiers, t.key].filter(Boolean).join(" + ");
  }
  return midiTriggerLabel(t);
}

function summarizeAction(mapping: Mapping): string {
  const { action } = mapping;
  const shortPath = action.path.split("/").slice(-2).join("/");
  switch (action.type) {
    case "Toggle": return `Toggle ${shortPath}`;
    case "Step": return `Step ${action.delta > 0 ? "+" : ""}${action.delta} → ${shortPath}`;
    case "Set": return `Set ${shortPath} = ${JSON.stringify(action.value)}`;
    case "Hold": return `Hold ${shortPath}`;
    case "Knob": return `Knob ±${action.step} → ${shortPath}`;
  }
}
