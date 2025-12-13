
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

  const autoPickBest4 = () => {
    setQueue(prev => {
      // 1. Reset all card slots
      const reset = prev.map(g => ({ ...g, cardSlot: undefined }));
      
      // 2. Identify Playable games
      const playable = reset.filter(g => g.analysis?.decision === 'PLAYABLE');
      
      // 3. Sort strictly by value
      playable.sort((a, b) => {
        const aVal = a.analysis!;
        const bVal = b.analysis!;
        
        // Primary: Line Value Points (Desc)
        const aPts = aVal.lineValuePoints || 0;
        const bPts = bVal.lineValuePoints || 0;
        if (aPts !== bPts) return bPts - aPts;
        
        // Secondary: Line Value Cents (Desc)
        const aCents = aVal.lineValueCents || 0;
        const bCents = bVal.lineValueCents || 0;
        if (aCents !== bCents) return bCents - aCents;
        
        // Tertiary: Soft Odds (Desc - higher payout is better)
        const parseOdds = (o?: string) => o ? parseFloat(o) : -9999;
        return parseOdds(bVal.softBestOdds) - parseOdds(aVal.softBestOdds);
      });
      
      // 4. Take top 4 IDs
      const top4Ids = playable.slice(0, 4).map(g => g.id);
      
      // 5. Update queue with slots
      return reset.map(g => {
        const slotIndex = top4Ids.indexOf(g.id);
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
      autoPickBest4,
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
