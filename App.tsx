import React, { useState } from 'react';
import { GameProvider, useGameContext } from './hooks/useGameContext';
import { ToastProvider } from './components/Toast';
import Scout from './pages/Scout';
import Queue from './pages/Queue';
import Card from './pages/Card';
import Tracker from './pages/Tracker';
import TrackerNewBet from './pages/TrackerNewBet';
import { BankrollModal } from './components/BankrollModal';
import { DraftBet } from './types/draftBet';
import { Bet } from './types';

const HeaderActions: React.FC<{ onOpenBankroll: () => void }> = ({ onOpenBankroll }) => {
  const { syncStatus } = useGameContext();
  
  // Dynamic styles for the glowing cloud effect
  let containerStyles = "bg-ink-paper border-2 transition-all duration-700 shadow-sm";
  let iconColor = "text-ink-gray";
  
  if (syncStatus === 'saving') {
    // Pulsing Blue Cloud
    containerStyles = "bg-ink-paper border-ink-accent shadow-[0_0_15px_rgba(56,189,248,0.4)]";
    iconColor = "text-ink-accent animate-pulse";
  } else if (syncStatus === 'saved') {
    // Glowing Green Cloud
    containerStyles = "bg-ink-paper border-status-win shadow-[0_0_20px_rgba(16,185,129,0.3)]";
    iconColor = "text-status-win";
  } else if (syncStatus === 'error') {
    // Glowing Red Cloud
    containerStyles = "bg-ink-paper border-status-loss shadow-[0_0_20px_rgba(239,68,68,0.3)]";
    iconColor = "text-status-loss";
  } else {
    // Idle Slate Cloud
    containerStyles = "bg-ink-paper/80 border-ink-gray";
    iconColor = "text-ink-gray";
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
        >
            💰
        </button>
    </div>
  );
};

const AppContent: React.FC = () => {
  const { addBet } = useGameContext();
  const [activeTab, setActiveTab] = useState<'scout' | 'queue' | 'card' | 'tracker' | 'tracker-new'>('scout');
  const [isBankrollOpen, setIsBankrollOpen] = useState(false);
  const [draftBet, setDraftBet] = useState<DraftBet | null>(null);

  const handleLogBet = (draft: DraftBet) => {
    setDraftBet(draft);
    setActiveTab('tracker-new');
  };

  const handleBetAdded = async (bet: Bet) => {
    // Persist to Supabase via unified hook
    await addBet(bet);
    setActiveTab('tracker');
    setDraftBet(null);
  };

  return (
    <div className="min-h-screen bg-ink-base text-ink-text flex flex-col font-sans">
      
      <HeaderActions onOpenBankroll={() => setIsBankrollOpen(true)} />

      {/* Main Content - All tabs stay mounted to preserve analysis queue state */}
      <main className="flex-1 pb-20 pt-4 relative">
        <div className={activeTab === 'scout' ? 'block h-full' : 'hidden h-full'}>
          <Scout />
        </div>
        <div className={activeTab === 'queue' ? 'block h-full' : 'hidden h-full'}>
          <Queue />
        </div>
        <div className={activeTab === 'card' ? 'block h-full' : 'hidden h-full'}>
          <Card onLogBet={handleLogBet} />
        </div>
        <div className={activeTab === 'tracker' ? 'block h-full' : 'hidden h-full'}>
          <Tracker />
        </div>
        <div className={activeTab === 'tracker-new' ? 'block h-full' : 'hidden h-full'}>
          <TrackerNewBet 
            draftBet={draftBet} 
            onBack={() => setActiveTab('card')} 
            onBetAdded={handleBetAdded}
          />
        </div>
      </main>

      <BankrollModal isOpen={isBankrollOpen} onClose={() => setIsBankrollOpen(false)} />

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-ink-paper border-t border-ink-gray z-50 shadow-lg">
        <div className="flex justify-around items-center h-16 max-w-lg mx-auto">
          <button 
            onClick={() => setActiveTab('scout')}
            className={`flex flex-col items-center justify-center w-full h-full transition-colors ${
              activeTab === 'scout' ? 'text-ink-accent' : 'text-ink-text opacity-40'
            }`}
          >
            <span className="text-2xl mb-1">🔍</span>
            <span className="text-xs font-medium">Scout</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('queue')}
            className={`flex flex-col items-center justify-center w-full h-full transition-colors ${
              activeTab === 'queue' ? 'text-ink-accent' : 'text-ink-text opacity-40'
            }`}
          >
            <span className="text-2xl mb-1">📋</span>
            <span className="text-xs font-medium">Queue</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('card')}
            className={`flex flex-col items-center justify-center w-full h-full transition-colors ${
              activeTab === 'card' ? 'text-ink-accent' : 'text-ink-text opacity-40'
            }`}
          >
            <span className="text-2xl mb-1">🏆</span>
            <span className="text-xs font-medium">Card</span>
          </button>

          <button 
            onClick={() => setActiveTab('tracker')}
            className={`flex flex-col items-center justify-center w-full h-full transition-colors ${
              activeTab === 'tracker' ? 'text-ink-accent' : 'text-ink-text opacity-40'
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

export default function App() {
  return (
    <GameProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </GameProvider>
  );
}