
import React, { createContext, useContext, useState, useEffect } from 'react';
import { QueuedGame, AnalysisState, Game, BookLines, DailyPlayTracker } from '../types';
import { MAX_DAILY_PLAYS } from '../constants';

const GameContext = createContext<AnalysisState | undefined>(undefined);

const getTodayKey = () => new Date().toISOString().split('T')[0];

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [queue, setQueue] = useState<QueuedGame[]>(() => {
    try {
      const saved = localStorage.getItem('edgelab_queue_v2');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [dailyPlays, setDailyPlays] = useState<DailyPlayTracker>(() => {
    try {
      const saved = localStorage.getItem('edgelab_daily_plays');
      const parsed = saved ? JSON.parse(saved) : { date: getTodayKey(), playCount: 0, gameIds: [] };
      // Reset if it's a new day
      if (parsed.date !== getTodayKey()) {
        return { date: getTodayKey(), playCount: 0, gameIds: [] };
      }
      return parsed;
    } catch {
      return { date: getTodayKey(), playCount: 0, gameIds: [] };
    }
  });

  useEffect(() => {
    localStorage.setItem('edgelab_queue_v2', JSON.stringify(queue));
  }, [queue]);

  useEffect(() => {
    localStorage.setItem('edgelab_daily_plays', JSON.stringify(dailyPlays));
  }, [dailyPlays]);

  // Calculate current playable count
  const getPlayableCount = () => {
    return queue.filter(g => g.analysis?.decision === 'PLAYABLE').length;
  };

  const canAddMorePlays = () => {
    return getPlayableCount() < MAX_DAILY_PLAYS;
  };

  const addToQueue = (game: Game) => {
    setQueue((prev) => {
      if (prev.some(g => g.id === game.id)) return prev;
      const newGame: QueuedGame = {
        ...game,
        visibleId: (prev.length + 1).toString(),
        addedAt: Date.now(),
        softLines: [],
      };
      return [...prev, newGame];
    });
  };

  const removeFromQueue = (gameId: string) => {
    setQueue(prev => prev.filter(g => g.id !== gameId));
  };

  const updateGame = (gameId: string, updates: Partial<QueuedGame>) => {
    setQueue(prev => prev.map(g => g.id === gameId ? { ...g, ...updates } : g));
  };

  const addSoftLines = (gameId: string, lines: BookLines) => {
    setQueue(prev => prev.map(g => {
      if (g.id !== gameId) return g;
      return { ...g, softLines: [...g.softLines, lines] };
    }));
  };

  const updateSoftLineBook = (gameId: string, index: number, newBookName: string) => {
    setQueue(prev => prev.map(g => {
      if (g.id !== gameId) return g;
      const newSoftLines = [...g.softLines];
      if (newSoftLines[index]) {
        newSoftLines[index] = { ...newSoftLines[index], bookName: newBookName };
      }
      return { ...g, softLines: newSoftLines };
    }));
  };

  const setSharpLines = (gameId: string, lines: BookLines) => {
    updateGame(gameId, { sharpLines: lines });
  };

  const markAsPlayed = (gameId: string) => {
    setDailyPlays(prev => ({
      ...prev,
      playCount: prev.playCount + 1,
      gameIds: [...prev.gameIds, gameId]
    }));
  };

  const autoPickBestGames = () => {
    setQueue(prev => {
      // 1. Reset all card slots
      const reset = prev.map(g => ({ ...g, cardSlot: undefined }));
      
      // 2. Identify Playable games
      const playable = reset.filter(g => g.analysis?.decision === 'PLAYABLE');
      
      // 3. Strict Price Veto Filter (-160 Limit)
      const validPlayable = playable.filter(g => {
        const oddsStr = g.analysis?.softBestOdds;
        if (!oddsStr) return false;
        
        const odds = parseFloat(oddsStr);
        if (isNaN(odds)) return false;

        // If odds are negative and worse than -160 (e.g. -165, -200), exclude
        if (odds < 0 && odds < -160) return false;
        
        return true;
      });

      // 4. Sort strictly by value + payout
      validPlayable.sort((a, b) => {
        const aVal = a.analysis!;
        const bVal = b.analysis!;
        
        // Primary: Line Value Points (Desc)
        // Getting +4.5 when sharp is +3.5 (1.0 diff) is the strongest signal
        const aPts = aVal.lineValuePoints || 0;
        const bPts = bVal.lineValuePoints || 0;
        if (aPts !== bPts) return bPts - aPts;
        
        // Secondary: Odds / Payout (Desc)
        // Prioritize Plus Money (+105 > -110)
        const parseOdds = (o?: string) => o ? parseFloat(o) : -9999;
        const aOdds = parseOdds(aVal.softBestOdds);
        const bOdds = parseOdds(bVal.softBestOdds);
        if (aOdds !== bOdds) return bOdds - aOdds;
        
        // Tertiary: Line Value Cents (Desc)
        // Difference between Sharp and Soft price (e.g. +15 cents edge)
        const aCents = aVal.lineValueCents || 0;
        const bCents = bVal.lineValueCents || 0;
        if (aCents !== bCents) return bCents - aCents;

        // Quaternary: Game ID (Deterministic tiebreaker)
        return a.id.localeCompare(b.id);
      });
      
      // 5. Take top 6 IDs (Increased from 4)
      const top6Ids = validPlayable.slice(0, 6).map(g => g.id);
      
      // 6. Update queue with slots
      return reset.map(g => {
        const slotIndex = top6Ids.indexOf(g.id);
        if (slotIndex !== -1) {
          return { ...g, cardSlot: slotIndex + 1 };
        }
        return g;
      });
    });
  };

  return (
    <GameContext.Provider value={{
      queue,
      addToQueue,
      removeFromQueue,
      updateGame,
      addSoftLines,
      updateSoftLineBook,
      setSharpLines,
      // New v2.1 additions
      dailyPlays,
      getPlayableCount,
      canAddMorePlays,
      markAsPlayed,
      autoPickBestGames, // Renamed from autoPickBest4
    }}>
      {children}
    </GameContext.Provider>
  );
};

export const useGameContext = () => {
  const context = useContext(GameContext);
  if (context === undefined) {
    throw new Error('useGameContext must be used within a GameProvider');
  }
  return context;
};