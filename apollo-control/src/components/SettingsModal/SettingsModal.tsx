import { useEffect, useState } from "react";
import { Modal } from "../common/Modal/Modal";
import { getAutostart, setAutostart } from "../../client/tauri";
import "./SettingsModal.css";

interface SettingsModalProps {
  onClose: () => void;
}

/** Settings modal — app-level preferences like startup behavior. */
export function SettingsModal({ onClose }: SettingsModalProps) {
  const [autostartEnabled, setAutostartEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAutostart()
      .then(v => setAutostartEnabled(v))
      .finally(() => setLoading(false));
  }, []);

  async function handleAutostartToggle() {
    const next = !autostartEnabled;
    setAutostartEnabled(next);
    try {
      await setAutostart(next);
    } catch (e) {
      setAutostartEnabled(!next);
      console.error("Failed to set autostart:", e);
    }
  }

  return (
    <Modal title="Settings" onClose={onClose} closeOnBackdropClick>
      <div className="settings-modal">
        {loading ? (
          <div className="settings-modal__loading">Loading…</div>
        ) : (
          <div className="settings-modal__section">
            <div className="settings-modal__section-label">Startup</div>
            <SettingsRow
              title="Start Mapper Listener on Boot"
              description="Registers Apollo Control to launch automatically when you log in. The main window stays hidden — only hotkey and MIDI mappings run silently via the tray icon. Click the tray icon to open the window."
              enabled={autostartEnabled}
              onToggle={handleAutostartToggle}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}

interface SettingsRowProps {
  title: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
}

/** A single settings row: label + description on the left, toggle on the right. */
function SettingsRow({ title, description, enabled, onToggle }: SettingsRowProps) {
  return (
    <div className="settings-row">
      <div className="settings-row__info">
        <div className="settings-row__title">{title}</div>
        <div className="settings-row__desc">{description}</div>
      </div>
      <button
        type="button"
        className={`settings-row__toggle${enabled ? " settings-row__toggle--on" : ""}`}
        onClick={onToggle}
        aria-pressed={enabled}
        title={enabled ? "Click to disable" : "Click to enable"}
      >
        <span className="settings-row__toggle-track">
          <span className="settings-row__toggle-thumb" />
        </span>
      </button>
    </div>
  );
}
