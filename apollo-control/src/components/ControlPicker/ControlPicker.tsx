import { useMemo, useState } from "react";
import { FlatControl, useDeviceTree } from "../../hooks/useDeviceTree";
import "./ControlPicker.css";

interface ControlPickerProps {
  value: FlatControl | null;
  onChange: (control: FlatControl) => void;
}

/** Tree browser for Apollo control paths, grouped by section (Monitor, HP, Inputs, Auxes). */
export function ControlPicker({ value, onChange }: ControlPickerProps) {
  const { controls, loading, error } = useDeviceTree();
  const [search, setSearch] = useState("");

  const grouped = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = controls.filter(
      c => c.label.toLowerCase().includes(q) || c.group.toLowerCase().includes(q)
    );
    const groups: Record<string, FlatControl[]> = {};
    filtered.forEach(c => {
      if (!groups[c.group]) groups[c.group] = [];
      groups[c.group].push(c);
    });
    return groups;
  }, [controls, search]);

  if (loading) return <div className="control-picker__loading">Loading controls…</div>;
  if (error) return <div className="control-picker__error">{error}</div>;

  return (
    <div className="control-picker">
      <input
        className="control-picker__search"
        placeholder="Filter controls…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      <div className="control-picker__list">
        {Object.entries(grouped).map(([group, items]) => (
          <div key={group} className="control-picker__group">
            <div className="control-picker__group-label">{group}</div>
            {items.map(ctrl => (
              <button
                key={ctrl.path}
                className={`control-picker__item${value?.path === ctrl.path ? " control-picker__item--selected" : ""}`}
                onClick={() => onChange(ctrl)}
                type="button"
              >
                <span className="control-picker__item-label">{ctrl.label}</span>
                <span className="control-picker__item-type">{ctrl.type}</span>
              </button>
            ))}
          </div>
        ))}
        {Object.keys(grouped).length === 0 && (
          <div className="control-picker__empty">No controls match.</div>
        )}
      </div>
    </div>
  );
}
