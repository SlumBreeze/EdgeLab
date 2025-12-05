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
  // Store scan results locally before adding to queue
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
    // We pass the edge data as part of the game object. 
    // The GameProvider spreads this into the QueuedGame object.
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
        <h1 className="text-2xl font-bold text-white mb-2">EdgeLab Scout</h1>
        <div className="flex overflow-x-auto space-x-2 pb-2 no-scrollbar">
          {Object.entries(SPORTS_CONFIG).map(([key, config]) => (
            <button
              key={key}
              onClick={() => setSelectedSport(key as Sport)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-full whitespace-nowrap transition-all ${
                selectedSport === key 
                  ? 'bg-amber-500 text-slate-900 font-bold' 
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
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
          className="w-full bg-slate-800 text-white p-3 rounded-lg border border-slate-700 focus:outline-none focus:border-amber-500"
        />
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-10 text-slate-500">Loading games...</div>
        ) : games.length === 0 ? (
          <div className="text-center py-10 text-slate-500">No games found for this date.</div>
        ) : (
          games.map(game => {
            const scan = scanResults[game.id];
            const isScanning = scanningIds.has(game.id);

            return (
              <div key={game.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg relative overflow-hidden">
                <div className="flex justify-between items-start mb-4">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {game.status}
                  </div>
                  <div className="text-xs text-slate-400">{game.odds?.details || 'No Lines'}</div>
                </div>
                
                <div className="flex justify-between items-center mb-6">
                  <div className="flex flex-col items-center w-1/3">
                    <img src={game.awayTeam.logo} alt={game.awayTeam.name} className="w-12 h-12 mb-2 object-contain" />
                    <span className="text-sm font-bold text-center leading-tight">{game.awayTeam.name}</span>
                    <span className="text-xs text-slate-500 mt-1">{game.awayTeam.record}</span>
                  </div>
                  
                  <div className="text-xl font-bold text-slate-600">AT</div>
                  
                  <div className="flex flex-col items-center w-1/3">
                    <img src={game.homeTeam.logo} alt={game.homeTeam.name} className="w-12 h-12 mb-2 object-contain" />
                    <span className="text-sm font-bold text-center leading-tight">{game.homeTeam.name}</span>
                    <span className="text-xs text-slate-500 mt-1">{game.homeTeam.record}</span>
                  </div>
                </div>

                {/* Scan Result Display */}
                {scan && (
                   <div className="mb-4 bg-slate-950/50 p-2 rounded border border-slate-800 flex items-start">
                     <span className="text-lg mr-2 mt-0.5">{getEdgeEmoji(scan.signal)}</span>
                     <span className="text-xs text-slate-300 leading-tight">{scan.description}</span>
                   </div>
                )}

                <div className="flex space-x-2">
                  <button 
                    onClick={() => handleQuickScan(game)}
                    disabled={isScanning || !!scan}
                    className={`flex-1 py-3 rounded-lg font-bold text-sm transition-colors ${
                      scan 
                       ? 'bg-slate-800 text-slate-500 cursor-default'
                       : 'bg-slate-800 hover:bg-slate-700 text-amber-500'
                    }`}
                  >
                    {isScanning ? (
                       <span className="animate-pulse">Scanning...</span>
                    ) : scan ? (
                       'Scanned'
                    ) : (
                       '⚡ Scan'
                    )}
                  </button>

                  <button
                    disabled={isInQueue(game.id)}
                    onClick={() => handleAddToQueue(game)}
                    className={`flex-[2] py-3 rounded-lg font-bold text-sm transition-colors ${
                      isInQueue(game.id)
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white'
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
