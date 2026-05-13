import React, { useState } from "react";
import { GameProvider, useGameContext } from "./hooks/useGameContext";
import { ToastProvider } from "./components/Toast";
import Main from "./pages/Main";
import Tracker from "./pages/Tracker";
import TrackerNewBet from "./pages/TrackerNewBet";
import { BankrollModal } from "./components/BankrollModal";
import { PersonaEditor } from "./components/PersonaEditor";
import { DraftBet } from "./types/draftBet";
import { Bet } from "./types";
import { AuthProvider, useAuth } from "./components/AuthContext";
import Login from "./pages/Login";

const HeaderActions: React.FC<{ 
  onOpenBankroll: () => void;
  onOpenPersona: () => void;
}> = ({
  onOpenBankroll,
  onOpenPersona,
}) => {
  const { syncStatus } = useGameContext();

  // Dynamic styles for the glowing cloud effect
  let containerStyles =
    "bg-ink-paper border-2 transition-all duration-700 shadow-sm";
  let iconColor = "text-ink-muted";

  if (syncStatus === "saving") {
    // Pulsing Blue Cloud
    containerStyles =
      "bg-ink-paper border-ink-accent shadow-[0_0_15px_rgba(56,189,248,0.4)]";
    iconColor = "text-ink-accent animate-pulse";
  } else if (syncStatus === "saved") {
    // Glowing Green Cloud
    containerStyles =
      "bg-ink-paper border-status-win shadow-[0_0_20px_rgba(16,185,129,0.3)]";
    iconColor = "text-status-win";
  } else if (syncStatus === "error") {
    // Glowing Red Cloud
    containerStyles =
      "bg-ink-paper border-status-loss shadow-[0_0_20px_rgba(239,68,68,0.3)]";
    iconColor = "text-status-loss";
  } else {
    // Idle Slate Cloud
    containerStyles = "bg-ink-paper/80 border-ink-gray";
    iconColor = "text-ink-muted";
  }

  return (
    <div className="fixed top-0 right-0 p-4 z-40 flex items-center gap-3">
      {/* Sync Status Indicator (Glowing Cloud) */}
      <div
        className={`w-10 h-10 flex items-center justify-center rounded-full backdrop-blur-md ${containerStyles}`}
        title={`Cloud Status: ${syncStatus.toUpperCase()}`}
      >
        <svg
          className={`w-6 h-6 ${iconColor} transition-colors duration-500`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 15a4 4 0 0 0 4 4h9a5 5 0 1 0-.1-9.999 5.002 5.002 0 1 0-9.78 2.096A4.001 4.001 0 0 0 3 15z" />
        </svg>
      </div>

      {/* Wallet Button */}
      <button
        onClick={onOpenBankroll}
        className="bg-ink-paper backdrop-blur shadow-md border border-ink-gray rounded-full w-10 h-10 flex items-center justify-center hover:scale-105 transition-all text-xl"
        title="Bankroll Manager"
      >
        💰
      </button>

      {/* Persona Button */}
      <button
        onClick={onOpenPersona}
        className="bg-ink-paper backdrop-blur shadow-md border border-ink-gray rounded-full w-10 h-10 flex items-center justify-center hover:scale-105 transition-all text-xl"
        title="AI Persona Configuration"
      >
        👤
      </button>
    </div>
  );
};

const AppContent: React.FC = () => {
  const { addBet } = useGameContext();
  const [activeTab, setActiveTab] = useState<"main" | "tracker" | "tracker-new">("main");
  const [isBankrollOpen, setIsBankrollOpen] = useState(false);
  const [isPersonaOpen, setIsPersonaOpen] = useState(false);
  const [draftBet, setDraftBet] = useState<DraftBet | null>(null);

  const handleLogBet = (draft: DraftBet) => {
    setDraftBet(draft);
    setActiveTab("tracker-new");
  };

  const handleBetAdded = async (bet: Bet) => {
    // Persist to Supabase via unified hook
    await addBet(bet);
    setActiveTab("main"); // Return to Main page after logging bet
    setDraftBet(null);
  };

  return (
    <div className="min-h-screen bg-ink-base text-ink-text flex flex-col font-sans">
      <HeaderActions 
        onOpenBankroll={() => setIsBankrollOpen(true)} 
        onOpenPersona={() => setIsPersonaOpen(true)}
      />

      {/* Main Content - All tabs stay mounted to preserve analysis queue state */}
      <main className="flex-1 pb-20 pt-20 relative">
        <div
          className={activeTab === "main" ? "block h-full" : "hidden h-full"}
        >
          <Main onLogBet={handleLogBet} />
        </div>
        <div
          className={activeTab === "tracker" ? "block h-full" : "hidden h-full"}
        >
          <Tracker />
        </div>
        <div
          className={
            activeTab === "tracker-new" ? "block h-full" : "hidden h-full"
          }
        >
          <TrackerNewBet
            draftBet={draftBet}
            onBack={() => setActiveTab("main")}
            onBetAdded={handleBetAdded}
          />
        </div>
      </main>

      <BankrollModal
        isOpen={isBankrollOpen}
        onClose={() => setIsBankrollOpen(false)}
      />

      <PersonaEditor
        isOpen={isPersonaOpen}
        onClose={() => setIsPersonaOpen(false)}
      />

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-ink-panel border-t border-ink-gray z-50 shadow-lg">
        <div className="flex justify-center items-center gap-2 h-16 max-w-lg mx-auto">
          <button
            onClick={() => setActiveTab("main")}
            className={`flex flex-col items-center justify-center w-28 h-full transition-colors ${
              activeTab === "main"
                ? "text-ink-accent"
                : "text-ink-text opacity-60"
            }`}
          >
            <span className="text-2xl mb-1">🔍</span>
            <span className="text-xs font-medium">Main</span>
          </button>

          <button
            onClick={() => setActiveTab("tracker")}
            className={`flex flex-col items-center justify-center w-28 h-full transition-colors ${
              activeTab === "tracker"
                ? "text-ink-accent"
                : "text-ink-text opacity-60"
            }`}
          >
            <span className="text-2xl mb-1">📊</span>
            <span className="text-xs font-medium">Tracker</span>
          </button>
        </div>
      </nav>
    </div>
  );
};

// Auth bypassed — Supabase not configured, run as single-user local app
const AppShell: React.FC = () => {
  return <AppContent />;
};

export default function App() {
  return (
    <AuthProvider>
      <GameProvider>
        <ToastProvider>
          <AppShell />
        </ToastProvider>
      </GameProvider>
    </AuthProvider>
  );
}
