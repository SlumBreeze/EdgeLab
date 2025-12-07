import React, { useState, useEffect } from 'react';
import { Sport, Game } from '../types';
import { SPORTS_CONFIG } from '../constants';
import { fetchGames } from '../services/espnService';
import { quickScanGame } from '../services/geminiService';
import { useGameContext } from '../hooks/useGameContext';

export default function Scout() {
  const [selectedSport, setSelectedSport] = useState<Sport>('NBA');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanningIds, setScanningIds] = useState<Set<string>>(new Set());
  const [scanResults, setScanResults] = useState<Record<string, { signal: 'RED'|'YELLOW'|'WHITE', description: string }>>({});
  
  const { addToQueue, queue } = useGameContext();

  useEffect(() => {
    const loadGames = async () => {
      setLoading(true);
      const data = await fetchGames(selectedSport, selectedDate);
      setGames(data);
      setLoading(false);
    };
    loadGames();
  }, [selectedSport, selectedDate]);

  const handleQuickScan = async (game: Game) => {
    if (scanningIds.has(game.id)) return;
    setScanningIds(prev => new Set(prev).add(game.id));
    
    const result = await quickScanGame(game);
    setScanResults(prev => ({
      ...prev,
      [game.id]: { signal: result.signal, description: result.description }
    }));
    
    setScanningIds(prev => {
      const next = new Set(prev);
      next.delete(game.id);
      return next;
    });
  };

  const handleAddToQueue = (game: Game) => {
    const scanData = scanResults[game.id];
    const gameWithScan = scanData ? { 
      ...game, 
      edgeSignal: scanData.signal, 
      edgeDescription: scanData.description 
    } : game;
    
    addToQueue(gameWithScan);
  };

  const isInQueue = (id: string) => queue.some(g => g.id === id);

  const getEdgeEmoji = (signal: string) => {
    switch(signal) {
      case 'RED': return '🔴';
      case 'YELLOW': return '🟡';
      default: return '⚪';
    }
  };

  return (
    <div className="p-4 max-w-lg mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800 mb-4">EdgeLab Scout</h1>
        <div className="flex overflow-x-auto space-x-2 pb-2 no-scrollbar">
          {Object.entries(SPORTS_CONFIG).map(([key, config]) => (
            <button
              key={key}
              onClick={() => setSelectedSport(key as Sport)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-full whitespace-nowrap transition-all shadow-sm ${
                selectedSport === key 
                  ? 'bg-gradient-to-r from-coral-500 to-orange-500 text-white font-bold shadow-md' 
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <span>{config.icon}</span>
              <span>{config.label}</span>
            </button>
          ))}
        </div>
      </header>

      <div className="mb-6">
        <input 
          type="date" 
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="w-full bg-white text-slate-800 p-3 rounded-xl border border-slate-200 focus:outline-none focus:border-coral-400 focus:ring-2 focus:ring-coral-100 shadow-sm"
        />
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-10 text-slate-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-coral-500 mx-auto mb-3"></div>
            Loading games...
          </div>
        ) : games.length === 0 ? (
          <div className="text-center py-10 text-slate-400 bg-white rounded-2xl border border-slate-200">
            No games found for this date.
          </div>
        ) : (
          games.map(game => {
            const scan = scanResults[game.id];
            const isScanning = scanningIds.has(game.id);

            return (
              <div key={game.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-4">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {game.status}
                  </div>
                  <div className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded-full">
                    {game.odds?.details || 'No Lines'}
                  </div>
                </div>
                
                <div className="flex justify-between items-center mb-6">
                  <div className="flex flex-col items-center w-1/3">
                    <img src={game.awayTeam.logo} alt={game.awayTeam.name} className="w-14 h-14 mb-2 object-contain" />
                    <span className="text-sm font-bold text-slate-800 text-center leading-tight">{game.awayTeam.name}</span>
                    <span className="text-xs text-slate-400 mt-1">{game.awayTeam.record}</span>
                  </div>
                  
                  <div className="text-lg font-bold text-slate-300">@</div>
                  
                  <div className="flex flex-col items-center w-1/3">
                    <img src={game.homeTeam.logo} alt={game.homeTeam.name} className="w-14 h-14 mb-2 object-contain" />
                    <span className="text-sm font-bold text-slate-800 text-center leading-tight">{game.homeTeam.name}</span>
                    <span className="text-xs text-slate-400 mt-1">{game.homeTeam.record}</span>
                  </div>
                </div>

                {/* Scan Result Display */}
                {scan && (
                  <div className={`mb-4 p-3 rounded-xl flex items-start gap-2 ${
                    scan.signal === 'RED' ? 'bg-red-50 border border-red-200' :
                    scan.signal === 'YELLOW' ? 'bg-amber-50 border border-amber-200' :
                    'bg-slate-50 border border-slate-200'
                  }`}>
                    <span className="text-lg">{getEdgeEmoji(scan.signal)}</span>
                    <span className="text-xs text-slate-600 leading-tight">{scan.description}</span>
                  </div>
                )}

                <div className="flex space-x-2">
                  <button 
                    onClick={() => handleQuickScan(game)}
                    disabled={isScanning || !!scan}
                    className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${
                      scan 
                        ? 'bg-slate-100 text-slate-400 cursor-default'
                        : 'bg-slate-100 hover:bg-slate-200 text-teal-600'
                    }`}
                  >
                    {isScanning ? (
                      <span className="animate-pulse">Scanning...</span>
                    ) : scan ? (
                      '✓ Scanned'
                    ) : (
                      '⚡ Scan'
                    )}
                  </button>

                  <button
                    disabled={isInQueue(game.id)}
                    onClick={() => handleAddToQueue(game)}
                    className={`flex-[2] py-3 rounded-xl font-bold text-sm transition-all ${
                      isInQueue(game.id)
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        : 'bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-white shadow-md hover:shadow-lg'
                    }`}
                  >
                    {isInQueue(game.id) ? '✓ In Queue' : 'Add to Queue'}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}