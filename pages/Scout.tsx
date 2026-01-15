import React, { useState, useEffect } from 'react';

import { Sport, Game, BookLines } from '../types';
import { SPORTS_CONFIG } from '../constants';
import { fetchOddsForSport, getBookmakerLines, fetchAllSportsOdds } from '../services/oddsService';
import { quickScanGame } from '../services/geminiService';
import { useGameContext } from '../hooks/useGameContext';
import { useToast, createToastHelpers } from '../components/Toast';
import ScoutGameCard from '../components/ScoutGameCard';

export default function Scout() {
  const [selectedSport, setSelectedSport] = useState<Sport>('NBA');
  // Fixed: Use local date string to match user's day, not UTC (which is tomorrow in evenings)
  const [selectedDate, setSelectedDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [loading, setLoading] = useState(false);
  
  // Toast Context
  const { addToast } = useToast();
  const toast = createToastHelpers(addToast);
  
  // Use Context for Data Persistence
  const { 
    addToQueue,
    addAllToQueue,
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
      toast.showSuccess(`Loaded slates for ${Object.keys(allData).length} sports`);
    } catch (e) {
      console.error("Failed to load slates:", e);
      toast.showError("Failed to load slates. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    try {
      const allData = await fetchAllSportsOdds(true); // Force refresh to check for movement
      loadSlates(allData);
      toast.showSuccess("Refreshed slates & Checked for movement");
    } catch (e) {
      console.error("Refresh failed:", e);
      toast.showError("Failed to refresh slates");
    }
  };

  useEffect(() => {
    if (!slatesLoaded || !allSportsData[selectedSport]) {
      setApiGames([]);
      return;
    }
    const data = allSportsData[selectedSport];
    const filtered = data.filter((g: any) => {
      // Filter logic matches the default date format now
      const gameDate = new Date(g.commence_time).toLocaleDateString('en-CA');
      return gameDate === selectedDate;
    });
    setApiGames(filtered);
  }, [selectedSport, selectedDate, allSportsData, slatesLoaded]);

  // Auto-fetch if selected sport is missing data (e.g. new sport added like NCAAB)
  useEffect(() => {
    if (slatesLoaded && !allSportsData[selectedSport] && !loading) {
      console.log(`[Scout] Missing data for ${selectedSport}, auto-fetching...`);
      handleLoadSlates();
    }
  }, [selectedSport, slatesLoaded, allSportsData, loading]);

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

    try {
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
      toast.showSuccess(`Batch scan complete for ${count} games`);
    } finally {
      setBatchScanning(false);
      setProgressText('');
    }
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
    toast.showInfo(`Added ${game.awayTeam.name} vs ${game.homeTeam.name} to Queue`);
  };

  const getMovementAnalysis = (currentA: string, refA: string, homeName: string, awayName: string) => {
    const curr = parseFloat(currentA);
    const ref = parseFloat(refA);
    if (isNaN(curr) || isNaN(ref)) return null;
    if (Math.abs(curr - ref) < 0.1) return { icon: '➡️', text: '', color: 'text-ink-text/40' };
    if (curr > ref) return { icon: '⬆️', text: `Sharps on ${homeName.split(' ').pop()}`, color: 'text-ink-accent' };
    if (curr < ref) return { icon: '⬇️', text: `Sharps on ${awayName.split(' ').pop()}`, color: 'text-ink-accent' };
    return null;
  };

  const isInQueue = (id: string) => queue.some(g => g.id === id);
  const getSignalWeight = (id: string) => {
    const s = scanResults[id]?.signal;
    return s === 'RED' ? 3 : s === 'YELLOW' ? 2 : s === 'WHITE' ? 1 : 0;
  };

  const sortedGames = [...apiGames].sort((a, b) => getSignalWeight(b.id) - getSignalWeight(a.id));

  // Count how many valid scanned games can be added
  const scannedCount = apiGames.filter(g => scanResults[g.id] && !isInQueue(g.id)).length;

  // If slates are NOT loaded, show the initial state (centered)
  if (!slatesLoaded) {
    return (
      <div className="h-full overflow-y-auto p-4 max-w-lg mx-auto flex flex-col">
        <header className="mb-4 shrink-0">
          <h1 className="text-2xl font-bold text-ink-text mb-4">EdgeLab Scout</h1>
          <button
            onClick={handleLoadSlates}
            disabled={loading}
            className="w-full mb-4 py-3 bg-ink-accent text-white font-bold rounded-xl shadow-sm hover:bg-sky-500 transition-all disabled:opacity-50"
          >
            {loading ? <span className="flex items-center justify-center gap-2"><span className="animate-spin">🔄</span> Loading All Slates...</span> : <span>📊 Load Today's Slates</span>}
          </button>
        </header>

        <div className="flex-1 flex flex-col justify-center items-center text-ink-text/60 bg-ink-paper rounded-2xl border border-ink-gray p-8 shadow-sm border-dashed">
          <p className="text-4xl mb-3">📊</p>
          <p className="font-medium text-center">Click "Load Today's Slates"<br/>to fetch fresh lines for all sports</p>
        </div>
      </div>
    );
  }

  // If slates loaded, show Fixed Header + Pull-to-Refresh List
  return (
    <div className="h-full flex flex-col">
      {/* Fixed Header Section */}
      <div className="shrink-0 p-4 pb-2 max-w-lg mx-auto w-full">
        <h1 className="text-2xl font-bold text-ink-text mb-4">EdgeLab Scout</h1>
        
        {/* Sport Selector */}
        <div className="flex overflow-x-auto space-x-2 pb-2 no-scrollbar mb-2">
          {Object.entries(SPORTS_CONFIG).map(([key, config]) => (
            <button
              key={key}
              onClick={() => setSelectedSport(key as Sport)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-full whitespace-nowrap transition-all shadow-sm border ${
                selectedSport === key ? 'bg-ink-accent text-white font-bold border-ink-accent shadow-sm' : 'bg-ink-paper text-ink-text/70 hover:text-ink-text border-ink-gray'
              }`}
            >
              <span>{config.icon}</span>
              <span>{config.label}</span>
            </button>
          ))}
        </div>

        {/* Date & Scan Controls */}
        <div className="flex gap-2 mb-2">
          <input 
            type="date" 
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="flex-1 bg-ink-paper text-ink-text p-3 rounded-xl border border-ink-gray focus:outline-none focus:border-ink-accent focus:ring-2 focus:ring-ink-accent/20 shadow-sm"
          />
          {apiGames.length > 0 && (
            <>
              <button
                onClick={handleScanAll}
                disabled={batchScanning}
                className={`flex-1 px-4 rounded-xl font-bold text-sm shadow-sm transition-all whitespace-nowrap ${batchScanning ? 'bg-ink-base text-ink-text/40' : 'bg-ink-accent hover:bg-sky-500 text-white'}`}
              >
                {batchScanning ? <span className="flex items-center justify-center gap-2"><span className="animate-spin text-xs">⚡</span> {progressText}</span> : '⚡ Scan All'}
              </button>
              
              <button
                onClick={handleAddAllScanned}
                disabled={scannedCount === 0}
                className={`flex-1 px-4 rounded-xl font-bold text-sm shadow-sm transition-all whitespace-nowrap border ${scannedCount > 0 ? 'bg-ink-paper text-ink-accent border-ink-accent hover:bg-ink-accent/10' : 'bg-ink-base text-ink-text/40 border-ink-gray'}`}
              >
                + Add Scanned ({scannedCount})
              </button>

              <button
                onClick={handleRefresh}
                disabled={loading || batchScanning}
                className="px-4 bg-ink-paper text-ink-text/70 border border-ink-gray hover:text-ink-text rounded-xl font-bold shadow-sm transition-all text-xl"
                title="Refresh Slates"
              >
                🔄
              </button>
            </>
          )}
        </div>
      </div>

      {/* Scrollable List */}
      <div className="flex-1 overflow-y-auto min-h-0 relative">
          <div className="p-4 pt-2 max-w-lg mx-auto space-y-3 pb-24">
            
            {loading ? (
              <div className="text-center py-10 text-ink-text/60">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ink-accent mx-auto mb-3"></div>
                Searching lines...
              </div>
            ) : apiGames.length === 0 ? (
              <div className="text-center py-10 text-ink-text/60 bg-ink-paper rounded-2xl border border-ink-gray">
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

                return (
                  <ScoutGameCard
                    key={game.id}
                    game={game}
                    pinnLines={pinnLines}
                    referenceLines={ref}
                    scanResult={scan}
                    isScanning={isScanning}
                    isBatchScanning={batchScanning}
                    inQueue={inQueue}
                    movement={movement}
                    onQuickScan={handleQuickScan}
                    onAddToQueue={handleAddToQueue}
                    mapToGameObject={mapToGameObject}
                  />
                );
              })
            )}
          </div>
      </div>
    </div>
  );
}
