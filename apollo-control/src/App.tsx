import { useState } from "react";
import "./App.css";
import { ControlPanel } from "./pages/ControlPanel/ControlPanel";
import { MappingList } from "./pages/MappingList/MappingList";

/** Root component — ControlPanel is primary; MappingList slides in as a drawer. */
function App() {
  const [showMappings, setShowMappings] = useState(false);

  return (
    <div className="app">
      <ControlPanel onShowMappings={() => setShowMappings(true)} />

      {showMappings && (
        <div className="app__drawer-overlay" onClick={() => setShowMappings(false)}>
          <div className="app__drawer" onClick={e => e.stopPropagation()}>
            <div className="app__drawer-header">
              <span>Mappings</span>
              <button className="app__drawer-close" onClick={() => setShowMappings(false)}>✕</button>
            </div>
            <MappingList />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
