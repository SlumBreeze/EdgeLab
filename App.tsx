import React, { useState } from "react";
import { ToastProvider } from "./components/Toast";
import WnbaDashboard from "./pages/WnbaDashboard";
import type { BackendSport } from "./services/backendApi";

export default function App() {
  const [sport, setSport] = useState<BackendSport>("WNBA");

  return (
    <ToastProvider>
      <div className="app-shell">
        <nav className="sport-switcher" aria-label="Dashboard sport">
          {(["WNBA", "MLB"] as BackendSport[]).map((nextSport) => (
            <button
              key={nextSport}
              type="button"
              onClick={() => setSport(nextSport)}
              className={sport === nextSport ? "active" : ""}
            >
              {nextSport}
            </button>
          ))}
        </nav>
        <WnbaDashboard sport={sport} />
      </div>
    </ToastProvider>
  );
}
