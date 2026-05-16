import { useEffect, useState } from "react";
import { KeyCombo } from "../../models/types";
import { eventToKeyCombo } from "../../utils/keyTranslation";
import "./KeyCapture.css";

interface KeyCaptureProps {
  value: KeyCombo | null;
  onChange: (combo: KeyCombo) => void;
}

/** Click-to-capture keyboard shortcut widget. Listens for keydown in the browser window. */
export function KeyCapture({ value, onChange }: KeyCaptureProps) {
  const [capturing, setCapturing] = useState(false);
  const [error] = useState<string | null>(null);

  useEffect(() => {
    if (!capturing) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.code === "Escape") { setCapturing(false); return; }
      const combo = eventToKeyCombo(e);
      if (!combo) return;
      onChange(combo);
      setCapturing(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [capturing, onChange]);

  const handleClick = () => setCapturing(true);

  const displayCombo = value
    ? [...value.modifiers, value.key].filter(Boolean).join(" + ")
    : "Click to capture…";

  return (
    <div className="key-capture">
      <button
        className={`key-capture__btn${capturing ? " key-capture__btn--active" : ""}`}
        onClick={handleClick}
        type="button"
      >
        {capturing ? "Press a key combo…" : displayCombo}
      </button>
      {error && <span className="key-capture__error">{error}</span>}
    </div>
  );
}
