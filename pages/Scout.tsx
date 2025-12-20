
import React, { useState, useEffect } from 'react';
import { Sport, Game, BookLines } from '../types';
import { SPORTS_CONFIG } from '../constants';
import { fetchOddsForSport, getBookmakerLines, fetchAllSportsOdds } from '../services/oddsService';
import { quickScanGame } from '../services/geminiService';
import { useGameContext } from '../hooks/useGameContext';

export default function Scout() {
  const [selectedSport, setSelectedSport] = useState<Sport>('NBA');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  
  // Use Context for Data Persistence
  const { 
    addToQueue, 
    queue, 
    scanResults, 
    setScanResult, 
    referenceLines, 
    setReferenceLine,
    allSportsData,
    loadSlates 
  } = useGameContext();

  const [apiGames, setApiGames] = useState<any[]>([]);
  const [scanningIds, setScanningIds] = useState<Set<string>>(new Set());
  const [batchScanning, setBatchScanning] = useState(false);
  const [progressText, setProgressText] = useState('');

  const slatesLoaded = Object.keys(allSportsData).length > 0;

  const handleLoadSlates = async () => {
    setLoading(true);
    try {
      const allData = await fetchAllSportsOdds();
      loadSlates(allData); // Save to Context & LocalStorage
    } catch (e) {
      console.error("Failed to load slates:", e);
      alert("Failed to load slates. Try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!slatesLoaded || !allSportsData[selectedSport]) {
      setApiGames([]);
      return;
    }
    const data = allSportsData[selectedSport];
    const filtered = data.filter((g: any) => {
      const gameDate = new Date(g.commence_time).toLocaleDateString('en-CA');
      return gameDate === selectedDate;
    });
    setApiGames(filtered);
  }, [selectedSport, selectedDate, allSportsData, slatesLoaded]);

  // Synchronize reference lines when new games are loaded
  useEffect(() => {
    if (slatesLoaded) {
      apiGames.forEach(g => {
        if (!referenceLines[g.id]) {
          const pinn = getBookmakerLines(g, 'pinnacle');
          if (pinn) {
            setReferenceLine(g.id, { spreadLineA: pinn.spreadLineA, spreadLineB: pinn.spreadLineB });
          }
        }
      });
    }
  }, [apiGames, slatesLoaded, referenceLines]);

  const mapToGameObject = (apiGame: any, pinnLines: BookLines | null): Game => {
    return {
      id: apiGame.id,
      sport: selectedSport,
      date: apiGame.commence_time,
      status: 'Scheduled',
      homeTeam: { name: apiGame.home_team },
      awayTeam: { name: apiGame.away_team },
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
    setScanResult(game.id, result);
    setScanningIds(prev => {
      const next = new Set(prev);
      next.delete(game.id);
      return next;
    });
  };

  const handleScanAll = async () => {
    setBatchScanning(true);
    const gamesToScan = apiGames.filter(g => !scanResults[g.id]);
    let count = 0;

    for (const apiGame of gamesToScan) {
      count++;
      setProgressText(`Scanning ${count}/${gamesToScan.length}...`);
      const gameObj = mapToGameObject(apiGame, null);
      try {
        const result = await quickScanGame(gameObj);
        setScanResult(apiGame.id, result);
      } catch (e) {
        console.error(e);
      }
      await new Promise(r => setTimeout(r, 600));
    }
    setBatchScanning(false);
    setProgressText('');
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
    if (curr > ref) return { icon: '⬆️', text: `Sharps on ${homeName.split(' ').pop()}`, color: 'text-emerald-600' };
    if (curr < ref) return { icon: '⬇️', text: `Sharps on ${awayName.split(' ').pop()}`, color: 'text-emerald-600' };
    return null;
  };

  const isInQueue = (id: string) => queue.some(g => g.id === id);
  const getEdgeEmoji = (signal: string) => signal === 'RED' ? '🔴' : signal === 'YELLOW' ? '🟡' : '⚪';
  const getSignalWeight = (id: string) => {
    const s = scanResults[id]?.signal;
    return s === 'RED' ? 3 : s === 'YELLOW' ? 2 : s === 'WHITE' ? 1 : 0;
  };

  const sortedGames = [...apiGames].sort((a, b) => getSignalWeight(b.id) - getSignalWeight(a.id));

  return (
    <div className="p-4 max-w-lg mx-auto">
      <header className="mb-4">
        <h1 className="text-2xl font-bold text-slate-800 mb-4">EdgeLab Scout</h1>
        {!slatesLoaded ? (
          <button
            onClick={handleLoadSlates}
            disabled={loading}
            className="w-full mb-4 py-3 bg-gradient-to-r from-coral-500 to-orange-500 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50"
          >
            {loading ? <span className="flex items-center justify-center gap-2"><span className="animate-spin">🔄</span> Loading All Slates...</span> : <span>📊 Load Today's Slates</span>}
          </button>
        ) : (
          <button
            onClick={handleLoadSlates}
            disabled={loading}
            className="w-full mb-4 py-2 bg-slate-100 text-slate-600 font-medium rounded-xl text-sm hover:bg-slate-200 transition-colors disabled:opacity-50"
          >
            {loading ? 'Refreshing...' : '🔄 Refresh All Slates'}
          </button>
        )}
        
        {slatesLoaded && (
          <div className="flex overflow-x-auto space-x-2 pb-2 no-scrollbar">
            {Object.entries(SPORTS_CONFIG).map(([key, config]) => (
              <button
                key={key}
                onClick={() => setSelectedSport(key as Sport)}
                className={`flex items-center space-x-2 px-4 py-2 rounded-full whitespace-nowrap transition-all shadow-sm ${
                  selectedSport === key ? 'bg-gradient-to-r from-coral-500 to-orange-500 text-white font-bold shadow-md' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <span>{config.icon}</span>
                <span>{config.label}</span>
              </button>
            ))}
          </div>
        )}
      </header>

      {slatesLoaded && (
        <div className="mb-6 flex gap-2">
          <input 
            type="date" 
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="flex-1 bg-white text-slate-800 p-3 rounded-xl border border-slate-200 focus:outline-none focus:border-coral-400 focus:ring-2 focus:ring-coral-100 shadow-sm"
          />
          {apiGames.length > 0 && (
            <button
              onClick={handleScanAll}
              disabled={batchScanning}
              className={`px-4 rounded-xl font-bold text-sm shadow-sm transition-all whitespace-nowrap ${batchScanning ? 'bg-slate-100 text-slate-400' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}
            >
              {batchScanning ? <span className="flex items-center gap-2"><span className="animate-spin text-xs">⚡</span> {progressText}</span> : '⚡ Scan All'}
            </button>
          )}
        </div>
      )}

      <div className="space-y-3">
        {!slatesLoaded ? (
          <div className="text-center py-10 text-slate-400 bg-white rounded-2xl border border-slate-200">
            <p className="text-4xl mb-3">📊</p>
            <p className="font-medium">Click "Load Today's Slates" to fetch lines</p>
          </div>
        ) : loading ? (
          <div className="text-center py-10 text-slate-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-coral-500 mx-auto mb-3"></div>
            Searching lines...
          </div>
        ) : apiGames.length === 0 ? (
          <div className="text-center py-10 text-slate-400 bg-white rounded-2xl border border-slate-200">
            No {selectedSport} games found for {selectedDate}.
          </div>
        ) : (
          sortedGames.map(game => {
            const pinnLines = getBookmakerLines(game, 'pinnacle');
            const ref = referenceLines[game.id];
            const movement = (pinnLines && ref) ? getMovementAnalysis(pinnLines.spreadLineA, ref.spreadLineA, game.home_team, game.away_team) : null;
            const scan = scanResults[game.id];
            const isScanning = scanningIds.has(game.id);
            const inQueue = isInQueue(game.id);
            const gameObj = mapToGameObject(game, pinnLines);

            return (
              <div key={game.id} className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
                {scan && <div className={`absolute top-0 left-0 bottom-0 w-1.5 ${scan.signal === 'RED' ? 'bg-red-500' : scan.signal === 'YELLOW' ? 'bg-amber-400' : 'bg-slate-200'}`} />}
                <div className="flex justify-between items-center mb-2 pl-2">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{new Date(game.commence_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                  <button onClick={() => handleAddToQueue(game, pinnLines)} disabled={inQueue} className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${inQueue ? 'bg-slate-100 text-slate-400' : 'bg-teal-50 text-teal-600 hover:bg-teal-100'}`}>{inQueue ? '✓ Queue' : '+ Add'}</button>
                </div>
                <div className="mb-2 pl-2">
                  <div className="grid grid-cols-[2fr_1fr_1fr_2fr] gap-1 mb-1 text-[9px] text-slate-400 uppercase font-bold tracking-wider"><div>Team</div><div className="text-center">Ref</div><div className="text-center">Curr</div><div className="text-center">Move</div></div>
                  <div className="grid grid-cols-[2fr_1fr_1fr_2fr] gap-1 items-center py-1 border-b border-slate-50">
                    <div className="font-bold text-slate-700 truncate text-xs">{game.away_team}</div>
                    <div className="text-center text-slate-400 text-[10px] font-mono">{ref?.spreadLineA || '-'}</div>
                    <div className="text-center font-bold text-slate-800 bg-slate-50 rounded py-0.5 text-[10px] font-mono">{pinnLines?.spreadLineA || '-'}</div>
                    <div className="row-span-2 flex flex-col items-center justify-center h-full">{movement && <><span className="text-sm leading-none mb-0.5">{movement.icon}</span><span className={`text-[8px] font-bold leading-none text-center ${movement.color}`}>{movement.text}</span></>}</div>
                  </div>
                  <div className="grid grid-cols-[2fr_1fr_1fr_2fr] gap-1 items-center py-1"><div className="font-bold text-slate-700 truncate text-xs">{game.home_team}</div><div className="text-center text-slate-400 text-[10px] font-mono">{ref?.spreadLineB || '-'}</div><div className="text-center font-bold text-slate-800 bg-slate-50 rounded py-0.5 text-[10px] font-mono">{pinnLines?.spreadLineB || '-'}</div></div>
                </div>
                <div className="pl-2">
                  {scan ? (
                    <div className={`p-2 rounded-lg flex items-start gap-2 ${scan.signal === 'RED' ? 'bg-red-50 border border-red-100' : scan.signal === 'YELLOW' ? 'bg-amber-50 border border-amber-100' : 'bg-slate-50 border border-slate-100'}`}><span className="text-sm">{getEdgeEmoji(scan.signal)}</span><span className="text-[10px] text-slate-600 leading-tight font-medium">{scan.description}</span></div>
                  ) : (
                    <button onClick={() => handleQuickScan(gameObj)} disabled={isScanning || batchScanning} className="w-full py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-700 rounded-lg text-[10px] font-bold transition-colors flex items-center justify-center gap-1">{isScanning ? <span className="animate-pulse">Scanning...</span> : <><span className="text-[10px]">⚡</span> Scan Injuries</>}</button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
