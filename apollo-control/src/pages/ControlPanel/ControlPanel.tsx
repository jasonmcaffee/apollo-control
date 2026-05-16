import { useCallback, useMemo, useState } from "react";
import { ControlRow } from "../../components/ControlRow/ControlRow";
import { MappingModal } from "../../components/MappingModal/MappingModal";
import { FlatControl, useDeviceTree } from "../../hooks/useDeviceTree";
import { useControlValues } from "../../hooks/useControlValues";
import { useMappings } from "../../hooks/useMappings";
import { Mapping } from "../../models/types";
import "./ControlPanel.css";

interface ControlPanelProps {
  onShowMappings: () => void;
}

/** Main control surface panel: shows all Apollo controls with live values and inline key mapping. */
export function ControlPanel({ onShowMappings }: ControlPanelProps) {
  const { controls, loading: treeLoading } = useDeviceTree();
  const { values, loading: valLoading, sdkAvailable, setValue } = useControlValues(controls);
  const { mappings, upsert: saveMappingFn, remove: deleteMapping } = useMappings();
  const [modalControl, setModalControl] = useState<FlatControl | null>(null);
  const handleCloseModal = useCallback(() => setModalControl(null), []);

  const groups = useMemo(() => groupControls(controls), [controls]);

  const mappingsByPath = useMemo(() => {
    const map: Record<string, Mapping[]> = {};
    mappings.forEach(m => {
      const path = m.action.path;
      if (!map[path]) map[path] = [];
      map[path].push(m);
    });
    return map;
  }, [mappings]);

  if (treeLoading || valLoading) {
    return <div className="control-panel__loading">Loading Apollo controls…</div>;
  }

  return (
    <div className="control-panel">
      <header className="control-panel__header">
        <div className="control-panel__title">
          <span className="control-panel__title-text">Apollo Control</span>
          <span
            className={`control-panel__sdk-dot${sdkAvailable ? " control-panel__sdk-dot--ok" : " control-panel__sdk-dot--err"}`}
            title={sdkAvailable ? "SDK connected" : "SDK not reachable"}
          />
        </div>
        <button className="control-panel__mappings-btn" onClick={onShowMappings}>
          Mappings
        </button>
      </header>

      <div className="control-panel__grid">
        {groups.map(group => (
          <ControlSection
            key={group.name}
            group={group}
            values={values}
            mappingsByPath={mappingsByPath}
            onSetValue={setValue}
            onOpenModal={setModalControl}
          />
        ))}
      </div>

      {modalControl && (
        <MappingModal
          control={modalControl}
          mappings={mappingsByPath[modalControl.path] ?? []}
          onSave={saveMappingFn}
          onDelete={deleteMapping}
          onClose={handleCloseModal}
        />
      )}
    </div>
  );
}

interface ControlSectionGroup {
  name: string;
  controls: FlatControl[];
  wide?: boolean;
}

interface ControlSectionProps {
  group: ControlSectionGroup;
  values: Record<string, unknown>;
  mappingsByPath: Record<string, Mapping[]>;
  onSetValue: (path: string, value: unknown) => void;
  onOpenModal: (control: FlatControl) => void;
}

function ControlSection({ group, values, mappingsByPath, onSetValue, onOpenModal }: ControlSectionProps) {
  return (
    <div className={`ctrl-section${group.wide ? " ctrl-section--wide" : ""}`}>
      <div className="ctrl-section__name">{group.name}</div>
      <div className="ctrl-section__controls">
        {group.controls.map(ctrl => (
          <ControlRow
            key={ctrl.path}
            control={ctrl}
            value={values[ctrl.path]}
            mappings={mappingsByPath[ctrl.path] ?? []}
            onSetValue={onSetValue}
            onOpenModal={() => onOpenModal(ctrl)}
          />
        ))}
      </div>
    </div>
  );
}

/** Group the flat control list into display sections. */
function groupControls(controls: FlatControl[]): ControlSectionGroup[] {
  const byGroup: Record<string, FlatControl[]> = {};
  controls.forEach(c => {
    if (!byGroup[c.group]) byGroup[c.group] = [];
    byGroup[c.group].push(c);
  });

  const ORDER = ["Monitor", "HP 1", "HP 2", "Aux 1", "Aux 2", "Analog 1", "Analog 2"];
  const WIDE = ["Analog 1", "Analog 2"];

  return ORDER
    .filter(name => byGroup[name])
    .map(name => ({ name, controls: byGroup[name], wide: WIDE.includes(name) }));
}
