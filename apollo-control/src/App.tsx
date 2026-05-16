import "./App.css";
import { ControlPanel } from "./pages/ControlPanel/ControlPanel";

/** Root component — the Apollo Control surface. */
function App() {
  return (
    <div className="app">
      <ControlPanel />
    </div>
  );
}

export default App;
