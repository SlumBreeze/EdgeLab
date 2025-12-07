import React, { useState, useEffect } from 'react';
import { Sport, Game, BookLines } from '../types';
import { SPORTS_CONFIG } from '../constants';
import { fetchOddsForSport, getBookmakerLines } from '../services/oddsService';
import { quickScanGame } from '../services/geminiService';
import { useGameContext } from '../hooks/useGameContext';

// Helper to get/set reference lines from localStorage
// Returns the reference lines for comparison
const getOrSetReferenceLines = (gameId: string, currentLines: BookLines | null) => {
  if (!currentLines) return null;
  
  const key = `edgelab_reference_${gameId}`;
  const stored = localStorage.getItem(key);
  
  if (stored) {
    try {
      return JSON.parse(stored) as { spreadLineA: string, spreadLineB: string };
    } catch {
      // Fall through to set if parse fails
    }
  }

  // Initial save of the first lines we see
  const ref = {
    spreadLineA: currentLines.spreadLineA,
    spreadLineB: currentLines.spreadLineB
  };
  localStorage.setItem(key, JSON.stringify(ref));
  return ref;
};

export default function Scout() {
  const [selectedSport, setSelectedSport] = useState<Sport>('NBA');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [apiGames, setApiGames] = useState<any[]>([]);
  
  // Scanning state
  const [scanningIds, setScanningIds] = useState<Set<string>>(new Set());
  const [scanResults, setScanResults] = useState<Record<string, { signal: 'RED'|'YELLOW'|'WHITE', description: string }>>({});
  
  const { addToQueue, queue } = useGameContext();

  useEffect(() => {
    const loadGames = async () => {
      setLoading(true);
      const data = await fetchOddsForSport(selectedSport);
      
      // Filter to show games on or after selected date
      const filtered = data.filter((g: any) => {
        const gameDate = new Date(g.commence_time).toLocaleDateString('en-CA');
        return gameDate >= selectedDate;
      });
      
      setApiGames(filtered);
      setLoading(false);
    };
    loadGames();
  }, [selectedSport, selectedDate]);

  const mapToGameObject = (apiGame: any, pinnLines: BookLines | null): Game => {
    return {
      id: apiGame.id,
      sport: selectedSport,
      date: apiGame.commence_time,
      status: 'Scheduled',
      homeTeam: { 
        name: apiGame.home_team,
        // Logo and record not available from Odds API, UI handles missing logo gracefully
      },
      awayTeam: { 
        name: apiGame.away_team,
      },
      odds: pinnLines ? {
        details: `${pinnLines.spreadLineA} / ${pinnLines.spreadLineB}`,
        spread: pinnLines.spreadLineA,
        total: parseFloat(pinnLines.totalLine) || undefined
      } : undefined
    };
  };

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

  const handleAddToQueue = (apiGame: any, pinnLines: BookLines | null) => {
    const game = mapToGameObject(apiGame, pinnLines);
    
    const scanData = scanResults[game.id];
    const gameWithScan = scanData ? { 
      ...game, 
      edgeSignal: scanData.signal, 
      edgeDescription: scanData.description 
    } : game;
    
    addToQueue(gameWithScan);
  };

  const getMovementAnalysis = (currentA: string, refA: string, homeName: string, awayName: string) => {
    const curr = parseFloat(currentA);
    const ref = parseFloat(refA);
    
    if (isNaN(curr) || isNaN(ref)) return null;
    if (Math.abs(curr - ref) < 0.1) return { icon: '➡️', text: '', color: 'text-slate-300' };

    // If spread for Away increases (e.g. +4.5 -> +5.5), Away is getting more points (weaker).
    // Market is moving towards HOME.
    if (curr > ref) {
      return { 
        icon: '⬆️', 
        text: `Sharps on ${homeName.split(' ').pop()}`, // Use last name for brevity
        color: 'text-emerald-600'
      };
    }
    
    // If spread for Away decreases (e.g. +4.5 -> +3.5), Away is getting fewer points (stronger).
    // Market is moving towards AWAY.
    if (curr < ref) {
      return { 
        icon: '⬇️', 
        text: `Sharps on ${awayName.split(' ').pop()}`,
        color: 'text-emerald-600'
      };
    }
    
    return null;
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
            Searching lines...
          </div>
        ) : apiGames.length === 0 ? (
          <div className="text-center py-10 text-slate-400 bg-white rounded-2xl border border-slate-200">
            No games found for this date.
          </div>
        ) : (
          apiGames.map(game => {
            const pinnLines = getBookmakerLines(game, 'pinnacle');
            const refLines = getOrSetReferenceLines(game.id, pinnLines);
            
            // Movement calculated based on Away spread drift
            const movement = (pinnLines && refLines) 
              ? getMovementAnalysis(pinnLines.spreadLineA, refLines.spreadLineA, game.home_team, game.away_team)
              : null;

            const scan = scanResults[game.id];
            const isScanning = scanningIds.has(game.id);
            const inQueue = isInQueue(game.id);
            const gameObj = mapToGameObject(game, pinnLines);

            return (
              <div key={game.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
                
                {/* Header: Time & Add Button */}
                <div className="flex justify-between items-center mb-4">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    {new Date(game.commence_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <button 
                    onClick={() => handleAddToQueue(game, pinnLines)}
                    disabled={inQueue}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      inQueue 
                        ? 'bg-slate-100 text-slate-400' 
                        : 'bg-teal-50 text-teal-600 hover:bg-teal-100'
                    }`}
                  >
                    {inQueue ? '✓ In Queue' : '+ Add to Queue'}
                  </button>
                </div>

                {/* Odds Table */}
                <div className="mb-4">
                  <div className="grid grid-cols-[2fr_1fr_1fr_2fr] gap-2 mb-2 text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                    <div>Team</div>
                    <div className="text-center">Ref</div>
                    <div className="text-center">Current</div>
                    <div className="text-center">Movement</div>
                  </div>

                  {/* Away Row */}
                  <div className="grid grid-cols-[2fr_1fr_1fr_2fr] gap-2 items-center py-1.5 border-b border-slate-50">
                    <div className="font-bold text-slate-700 truncate text-sm">{game.away_team}</div>
                    <div className="text-center text-slate-400 text-xs font-mono">{refLines?.spreadLineA || '-'}</div>
                    <div className="text-center font-bold text-slate-800 bg-slate-50 rounded py-1 text-xs font-mono">
                      {pinnLines?.spreadLineA || '-'}
                    </div>
                    
                    {/* Movement Indicator (Spans 2 rows via Flex placement logic in grid) */}
                    <div className="row-span-2 flex flex-col items-center justify-center h-full">
                      {movement && (
                        <>
                          <span className="text-lg leading-none mb-1">{movement.icon}</span>
                          <span className={`text-[9px] font-bold leading-none text-center ${movement.color}`}>
                            {movement.text}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Home Row */}
                  <div className="grid grid-cols-[2fr_1fr_1fr_2fr] gap-2 items-center py-1.5">
                    <div className="font-bold text-slate-700 truncate text-sm">{game.home_team}</div>
                    <div className="text-center text-slate-400 text-xs font-mono">{refLines?.spreadLineB || '-'}</div>
                    <div className="text-center font-bold text-slate-800 bg-slate-50 rounded py-1 text-xs font-mono">
                      {pinnLines?.spreadLineB || '-'}
                    </div>
                    {/* Empty cell for movement col (handled by span above implicitly or just blank) */}
                    <div></div> 
                  </div>
                </div>

                {/* Scan Result */}
                {scan && (
                  <div className={`mb-3 p-3 rounded-xl flex items-start gap-2 ${
                    scan.signal === 'RED' ? 'bg-red-50 border border-red-200' :
                    scan.signal === 'YELLOW' ? 'bg-amber-50 border border-amber-200' :
                    'bg-slate-50 border border-slate-200'
                  }`}>
                    <span className="text-lg">{getEdgeEmoji(scan.signal)}</span>
                    <span className="text-xs text-slate-600 leading-tight font-medium">{scan.description}</span>
                  </div>
                )}

                {/* Scan Button */}
                {!scan && (
                  <button 
                    onClick={() => handleQuickScan(gameObj)}
                    disabled={isScanning}
                    className="w-full py-2 bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-700 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2"
                  >
                    {isScanning ? (
                      <span className="animate-pulse">Scanning Injuries...</span>
                    ) : (
                      <>
                        <span>⚡</span> Run Injury Scan
                      </>
                    )}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}