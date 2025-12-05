import React, { createContext, useContext, useState, useEffect } from 'react';
import { QueuedGame, AnalysisState, Game, BookLines } from '../types';

const GameContext = createContext<AnalysisState | undefined>(undefined);

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [queue, setQueue] = useState<QueuedGame[]>(() => {
    try {
      const saved = localStorage.getItem('edgelab_queue');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('edgelab_queue', JSON.stringify(queue));
  }, [queue]);

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

  return (
    <GameContext.Provider value={{
      queue,
      addToQueue,
      removeFromQueue,
      updateGame,
      addSoftLines,
      updateSoftLineBook,
      setSharpLines
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
