
import React, { useState } from 'react';
import { GameProvider } from './hooks/useGameContext';
import Scout from './pages/Scout';
import Queue from './pages/Queue';
import Card from './pages/Card';
import { BankrollModal } from './components/BankrollModal';

const AppContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'scout' | 'queue' | 'card'>('scout');
  const [isBankrollOpen, setIsBankrollOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
      {/* Top Header for Wallet Access */}
      <div className="fixed top-0 right-0 p-4 z-40">
        <button 
            onClick={() => setIsBankrollOpen(true)}
            className="bg-white/90 backdrop-blur shadow-md border border-slate-200 rounded-full w-10 h-10 flex items-center justify-center hover:scale-105 transition-all text-xl"
        >
            💰
        </button>
      </div>

      <main className="flex-1 pb-20 pt-4">
        {activeTab === 'scout' && <Scout />}
        {activeTab === 'queue' && <Queue />}
        {activeTab === 'card' && <Card />}
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
      <AppContent />
    </GameProvider>
  );
}
