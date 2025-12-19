
import React, { createContext, useContext, useState, useEffect } from 'react';
import { QueuedGame, AnalysisState, Game, BookLines, DailyPlayTracker } from '../types';
import { MAX_DAILY_PLAYS } from '../constants';

const GameContext = createContext<AnalysisState | undefined>(undefined);

const getTodayKey = () => new Date().toISOString().split('T')[0];

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Logic to handle Daily Reset
  const today = getTodayKey();
  
  const [queue, setQueue] = useState<QueuedGame[]>(() => {
    try {
      const lastDate = localStorage.getItem('edgelab_last_date');
      const savedQueue = localStorage.getItem('edgelab_queue_v2');
      
      // If date has rolled over, start with an empty queue
      if (lastDate && lastDate !== today) {
        console.log("[GameContext] New day detected. Clearing queue...");
        return [];
      }
      
      return savedQueue ? JSON.parse(savedQueue) : [];
    } catch {
      return [];
    }
  });

  const [dailyPlays, setDailyPlays] = useState<DailyPlayTracker>(() => {
    try {
      const saved = localStorage.getItem('edgelab_daily_plays');
      const parsed = saved ? JSON.parse(saved) : { date: today, playCount: 0, gameIds: [] };
      
      // Reset if it's a new day
      if (parsed.date !== today) {
        console.log("[GameContext] New day detected. Resetting daily plays...");
        return { date: today, playCount: 0, gameIds: [] };
      }
      return parsed;
    } catch {
      return { date: today, playCount: 0, gameIds: [] };
    }
  });

  // Keep track of the last date we were active
  useEffect(() => {
    localStorage.setItem('edgelab_last_date', today);
  }, [today]);

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
        const aPts = aVal.lineValuePoints || 0;
        const bPts = bVal.lineValuePoints || 0;
        if (aPts !== bPts) return bPts - aPts;
        
        // Secondary: Odds / Payout (Desc)
        const parseOdds = (o?: string) => o ? parseFloat(o) : -9999;
        const aOdds = parseOdds(aVal.softBestOdds);
        const bOdds = parseOdds(bVal.softBestOdds);
        if (aOdds !== bOdds) return bOdds - aOdds;
        
        // Tertiary: Line Value Cents (Desc)
        const aCents = aVal.lineValueCents || 0;
        const bCents = bVal.lineValueCents || 0;
        if (aCents !== bCents) return bCents - aCents;

        // Quaternary: Game ID
        return a.id.localeCompare(b.id);
      });
      
      // 5. Take top 6 IDs
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
      dailyPlays,
      getPlayableCount,
      canAddMorePlays,
      markAsPlayed,
      autoPickBestGames,
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
