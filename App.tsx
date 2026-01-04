import React, { useState } from 'react';
import { GameProvider, useGameContext } from './hooks/useGameContext';
import { ToastProvider } from './components/Toast';
import Scout from './pages/Scout';
import Queue from './pages/Queue';
import Card from './pages/Card';
import { BankrollModal } from './components/BankrollModal';

const HeaderActions: React.FC<{ onOpenBankroll: () => void }> = ({ onOpenBankroll }) => {
  const { syncStatus } = useGameContext();
  
  // Dynamic styles for the glowing cloud effect
  let containerStyles = "bg-white/90 border-2 transition-all duration-700 shadow-sm";
  let iconColor = "text-slate-300";
  
  if (syncStatus === 'saving') {
    // Pulsing Blue Cloud
    containerStyles = "bg-white border-blue-400 shadow-[0_0_15px_rgba(96,165,250,0.6)]";
    iconColor = "text-blue-500 animate-pulse";
  } else if (syncStatus === 'saved') {
    // Glowing Green Cloud
    containerStyles = "bg-white border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.5)]";
    iconColor = "text-emerald-500";
  } else if (syncStatus === 'error') {
    // Glowing Red Cloud
    containerStyles = "bg-white border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.5)]";
    iconColor = "text-red-500";
  } else {
    // Idle Slate Cloud
    containerStyles = "bg-white/80 border-slate-200";
    iconColor = "text-slate-400";
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
            className="bg-white/90 backdrop-blur shadow-md border border-slate-200 rounded-full w-10 h-10 flex items-center justify-center hover:scale-105 transition-all text-xl"
        >
            💰
        </button>
    </div>
  );
};

const AppContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'scout' | 'queue' | 'card'>('scout');
  const [isBankrollOpen, setIsBankrollOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
      
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
          <Card />
        </div>
      </main>

      <BankrollModal isOpen={isBankrollOpen} onClose={() => setIsBankrollOpen(false)} />

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-50 shadow-lg">
        <div className="flex justify-around items-center h-16 max-w-lg mx-auto">
          <button 
            onClick={() => setActiveTab('scout')}
            className={`flex flex-col items-center justify-center w-full h-full transition-colors ${
              activeTab === 'scout' ? 'text-coral-500' : 'text-slate-400'
            }`}
          >
            <span className="text-2xl mb-1">🔍</span>
            <span className="text-xs font-medium">Scout</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('queue')}
            className={`flex flex-col items-center justify-center w-full h-full transition-colors ${
              activeTab === 'queue' ? 'text-coral-500' : 'text-slate-400'
            }`}
          >
            <span className="text-2xl mb-1">📋</span>
            <span className="text-xs font-medium">Queue</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('card')}
            className={`flex flex-col items-center justify-center w-full h-full transition-colors ${
              activeTab === 'card' ? 'text-coral-500' : 'text-slate-400'
            }`}
          >
            <span className="text-2xl mb-1">🏆</span>
            <span className="text-xs font-medium">Card</span>
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