import React, { useState } from "react";
import { ToastProvider } from "./components/Toast";
import WnbaDashboard from "./pages/WnbaDashboard";
import type { BackendSport } from "./services/backendApi";
import { useAuth } from "./components/AuthContext";
import Login from "./pages/Login";

export default function App() {
  const {
    authRequired,
    configurationError,
    loading,
    session,
    signOut,
    user,
  } = useAuth();
  const [sport, setSport] = useState<BackendSport>("WNBA");

  if (authRequired && configurationError) {
    return (
      <main className="auth-shell">
        <section className="auth-card" role="alert">
          <p className="auth-eyebrow">Private access locked</p>
          <h1>Authentication is not configured</h1>
          <p>{configurationError}</p>
          <p className="auth-note">
            Configure the documented Supabase publishable settings and rebuild
            the frontend. EdgeLab will not open while required auth is missing.
          </p>
        </section>
      </main>
    );
  }

  if (authRequired && loading) {
    return (
      <main className="auth-shell">
        <section className="auth-card" aria-live="polite">
          <p className="auth-eyebrow">EdgeLab</p>
          <h1>Verifying session</h1>
        </section>
      </main>
    );
  }

  if (authRequired && (!session || !user)) {
    return <Login />;
  }

  return (
    <ToastProvider>
      <div className="app-shell">
        <div className="app-access-bar">
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
          {authRequired && (
            <button
              className="auth-sign-out"
              type="button"
              onClick={() => void signOut()}
            >
              Sign out
            </button>
          )}
        </div>
        <WnbaDashboard sport={sport} />
      </div>
    </ToastProvider>
  );
}
