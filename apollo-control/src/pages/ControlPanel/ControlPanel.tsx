import { useCallback, useMemo, useState } from "react";
import { BsGear } from "react-icons/bs";
import { ControlRow } from "../../components/ControlRow/ControlRow";
import { MappingModal } from "../../components/MappingModal/MappingModal";
import { SettingsModal } from "../../components/SettingsModal/SettingsModal";
import { InfoTooltip } from "../../components/common/InfoTooltip/InfoTooltip";
import { IconButton } from "../../components/common/IconButton/IconButton";
import { FlatControl, useDeviceTree } from "../../hooks/useDeviceTree";
import { useControlValues } from "../../hooks/useControlValues";
import { useMappings } from "../../hooks/useMappings";
import { Mapping } from "../../models/types";
import { getSectionTooltip } from "../../utils/tooltipContent";
import { trackMappingModalOpened, trackSettingsOpened } from "../../utils/analytics";
import "./ControlPanel.css";

/** Main control surface panel: shows all Apollo controls with live values and inline key mapping. */
export function ControlPanel() {
  const { controls, loading: treeLoading } = useDeviceTree();
  const { values, loading: valLoading, sdkAvailable, setValue } = useControlValues(controls);
  const { mappings, upsert: saveMappingFn, remove: deleteMapping } = useMappings();
  const [modalControl, setModalControl] = useState<FlatControl | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const handleCloseModal = useCallback(() => setModalControl(null), []);
  const handleCloseSettings = useCallback(() => setShowSettings(false), []);

  const handleOpenModal = useCallback((control: FlatControl) => {
    trackMappingModalOpened(control);
    setModalControl(control);
  }, []);

  const handleOpenSettings = useCallback(() => {
    trackSettingsOpened();
    setShowSettings(true);
  }, []);

  const rows = useMemo(() => groupControlsByRow(controls), [controls]);

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
            className="control-panel__sdk-chip"
            title={sdkAvailable ? "SDK connected" : "SDK not reachable"}
          >
            <span className={`control-panel__sdk-dot${sdkAvailable ? " control-panel__sdk-dot--ok" : " control-panel__sdk-dot--err"}`} />
            {sdkAvailable ? "Live" : "Offline"}
          </span>
        </div>
        <IconButton Icon={BsGear} onClick={handleOpenSettings} ariaLabel="Settings" title="Settings" size={16} />
      </header>

      <div className="control-panel__grid">
        {rows.map((row, i) => (
          <div key={i} className="control-panel__row">
            {row.map(group => (
              <ControlSection
                key={group.name}
                group={group}
                values={values}
                mappingsByPath={mappingsByPath}
                onSetValue={setValue}
                onOpenModal={handleOpenModal}
              />
            ))}
          </div>
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
      {showSettings && <SettingsModal onClose={handleCloseSettings} />}
    </div>
  );
}

interface ControlSectionGroup {
  name: string;
  controls: FlatControl[];
}

interface ControlSectionProps {
  group: ControlSectionGroup;
  values: Record<string, unknown>;
  mappingsByPath: Record<string, Mapping[]>;
  onSetValue: (path: string, value: unknown) => void;
  onOpenModal: (control: FlatControl) => void;
}

function ControlSection({ group, values, mappingsByPath, onSetValue, onOpenModal }: ControlSectionProps) {
  const numerics = group.controls.filter(c => c.type !== "bool");
  const bools = group.controls.filter(c => c.type === "bool");
  const slug = group.name.toLowerCase().replace(/\s+/g, "-");
  const sectionTooltip = getSectionTooltip(group.name);
  return (
    <div className={`ctrl-section ctrl-section--${slug}`}>
      <div className="ctrl-section__name">
        {sectionTooltip ? (
          <InfoTooltip info={sectionTooltip}>{group.name}</InfoTooltip>
        ) : (
          group.name
        )}
      </div>
      {numerics.length > 0 && (
        <div className="ctrl-section__knobs">
          {numerics.map(ctrl => (
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
      )}
      {bools.length > 0 && (
        <div className="ctrl-section__bools">
          {bools.map(ctrl => (
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
      )}
    </div>
  );
}

const ROWS: string[][] = [
  ["Monitor", "Analog 1", "Analog 2"],
  ["Aux 1", "Aux 2", "HP 1", "HP 2"],
];

/** Group the flat control list into ordered rows of display sections. */
function groupControlsByRow(controls: FlatControl[]): ControlSectionGroup[][] {
  const byGroup: Record<string, FlatControl[]> = {};
  controls.forEach(c => {
    if (!byGroup[c.group]) byGroup[c.group] = [];
    byGroup[c.group].push(c);
  });

  return ROWS
    .map(row => row.filter(name => byGroup[name]).map(name => ({ name, controls: byGroup[name] })))
    .filter(row => row.length > 0);
}
