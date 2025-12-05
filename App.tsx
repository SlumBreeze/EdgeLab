import React, { useState } from 'react';
import { GameProvider } from './hooks/useGameContext';
import Scout from './pages/Scout';
import Queue from './pages/Queue';
import Card from './pages/Card';

const AppContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'scout' | 'queue' | 'card'>('scout');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <main className="flex-1 pb-20">
        {activeTab === 'scout' && <Scout />}
        {activeTab === 'queue' && <Queue />}
        {activeTab === 'card' && <Card />}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 z-50 safe-area-pb">
        <div className="flex justify-around items-center h-16 max-w-lg mx-auto">
          <button 
            onClick={() => setActiveTab('scout')}
            className={`flex flex-col items-center justify-center w-full h-full ${activeTab === 'scout' ? 'text-amber-500' : 'text-slate-500'}`}
          >
            <span className="text-2xl mb-1">🔍</span>
            <span className="text-xs font-medium">Scout</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('queue')}
            className={`flex flex-col items-center justify-center w-full h-full ${activeTab === 'queue' ? 'text-amber-500' : 'text-slate-500'}`}
          >
            <span className="text-2xl mb-1">📋</span>
            <span className="text-xs font-medium">Queue</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('card')}
            className={`flex flex-col items-center justify-center w-full h-full ${activeTab === 'card' ? 'text-amber-500' : 'text-slate-500'}`}
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
