import { useState } from "react";
import { MappingEditor } from "../../components/MappingEditor/MappingEditor";
import { useMappings } from "../../hooks/useMappings";
import { Mapping } from "../../models/types";
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
      <div className="mapping-list__header">
        <h1 className="mapping-list__title">Apollo Control</h1>
        <button className="mapping-list__add-btn" onClick={() => setEditing("new")}>
          + Add Mapping
        </button>
      </div>

      {mappings.length === 0 ? (
        <EmptyState onAdd={() => setEditing("new")} />
      ) : (
        <table className="mapping-list__table">
          <thead>
            <tr>
              <th>Key Combo</th>
              <th>Name</th>
              <th>Action</th>
              <th>Enabled</th>
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
  const combo = [...mapping.trigger.modifiers, mapping.trigger.key]
    .filter(Boolean)
    .join(" + ");
  const actionSummary = summarizeAction(mapping);

  return (
    <tr className={mapping.enabled ? "" : "mapping-list__row--disabled"}>
      <td className="mapping-list__combo">{combo}</td>
      <td>{mapping.name}</td>
      <td className="mapping-list__action-summary">{actionSummary}</td>
      <td>
        <input
          type="checkbox"
          checked={mapping.enabled}
          onChange={onToggle}
          title="Enable/disable"
        />
      </td>
      <td className="mapping-list__actions">
        <button className="mapping-list__btn" onClick={onEdit}>Edit</button>
        <button className="mapping-list__btn mapping-list__btn--danger" onClick={onDelete}>
          Delete
        </button>
      </td>
    </tr>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="mapping-list__empty">
      <p>No mappings yet.</p>
      <button className="mapping-list__add-btn" onClick={onAdd}>+ Add your first mapping</button>
    </div>
  );
}

function summarizeAction(mapping: Mapping): string {
  const { action } = mapping;
  const shortPath = action.path.split("/").slice(-2).join("/");
  switch (action.type) {
    case "Toggle": return `Toggle ${shortPath}`;
    case "Step": return `Step ${action.delta > 0 ? "+" : ""}${action.delta} → ${shortPath}`;
    case "Set": return `Set ${shortPath} = ${JSON.stringify(action.value)}`;
    case "Hold": return `Hold ${shortPath}`;
    case "Knob": return `Scroll ±${action.step} → ${shortPath}`;
  }
}
