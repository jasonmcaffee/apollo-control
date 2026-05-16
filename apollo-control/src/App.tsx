import { useState } from "react";
import "./App.css";
import { ControlPanel } from "./pages/ControlPanel/ControlPanel";
import { MappingList } from "./pages/MappingList/MappingList";
import { Modal } from "./components/common/Modal/Modal";

/** Root component — ControlPanel is primary; MappingList slides in as a drawer. */
function App() {
  const [showMappings, setShowMappings] = useState(false);

  return (
    <div className="app">
      <ControlPanel onShowMappings={() => setShowMappings(true)} />

      {showMappings && (
        <Modal
          variant="drawer"
          onClose={() => setShowMappings(false)}
          title="Mappings"
        >
          <MappingList />
        </Modal>
      )}
    </div>
  );
}

export default App;
