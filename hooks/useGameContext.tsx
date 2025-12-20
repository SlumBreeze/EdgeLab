
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { QueuedGame, AnalysisState, Game, BookLines, DailyPlayTracker, SportsbookAccount } from '../types';
import { MAX_DAILY_PLAYS } from '../constants';
import { supabase } from '../services/supabaseClient';

const GameContext = createContext<AnalysisState | undefined>(undefined);

const getTodayKey = () => new Date().toISOString().split('T')[0];

const INITIAL_BOOKS: SportsbookAccount[] = [
  { name: 'DraftKings', balance: 0, color: 'bg-green-500' },
  { name: 'FanDuel', balance: 0, color: 'bg-blue-500' },
  { name: 'theScore Bet', balance: 0, color: 'bg-indigo-900' },
  { name: 'Fliff', balance: 0, color: 'bg-teal-500' },
  { name: 'BetOnline', balance: 0, color: 'bg-red-700' },
  { name: 'Bovada', balance: 0, color: 'bg-red-600' },
  { name: 'Other', balance: 0, color: 'bg-slate-700' },
];

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Logic to handle Daily Reset
  const today = getTodayKey();

  // State to track if cloud sync is healthy
  const [isSyncEnabled, setIsSyncEnabled] = useState(true);

  // User ID for Database Persistence
  const [userId] = useState(() => {
    try {
      let id = localStorage.getItem('edgelab_user_id');
      if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem('edgelab_user_id', id);
      }
      return id;
    } catch {
      return 'guest-user';
    }
  });

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

  // Bankroll State - Initialize from LocalStorage first (speed), then sync with Supabase
  const [bankroll, setBankroll] = useState<SportsbookAccount[]>(() => {
    try {
      const saved = localStorage.getItem('edgelab_bankroll');
      if (saved) {
        const parsed = JSON.parse(saved) as SportsbookAccount[];
        const unwanted = ['Bet365', 'BetMGM', 'Caesars'];
        const cleaned = parsed.filter(b => !unwanted.includes(b.name));

        const newOnes = ['BetOnline', 'Bovada'];
        newOnes.forEach(name => {
          if (!cleaned.some(b => b.name === name)) {
            const def = INITIAL_BOOKS.find(b => b.name === name);
            if (def) cleaned.push(def);
          }
        });
        return cleaned;
      }
      return INITIAL_BOOKS;
    } catch {
      return INITIAL_BOOKS;
    }
  });

  const [unitSizePercent, setUnitSizePercent] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('edgelab_unit_pct');
      return saved ? parseFloat(saved) : 2.0;
    } catch {
      return 2.0;
    }
  });

  // Slate State (Queue, Plays, Reference Lines)
  const [referenceLines, setReferenceLines] = useState<Record<string, { spreadLineA: string, spreadLineB: string }>>(() => {
    try {
      const saved = localStorage.getItem('edgelab_reference_lines');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [scanResults, setScanResults] = useState<Record<string, { signal: 'RED' | 'YELLOW' | 'WHITE', description: string }>>(() => {
    try {
      const saved = localStorage.getItem('edgelab_scan_results');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Load Bankroll from Supabase on Mount
  useEffect(() => {
    const fetchRemoteBankroll = async () => {
      if (!userId || !isSyncEnabled) return;

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        console.warn("[Supabase] Missing credentials in .env. Cloud sync disabled.");
        setIsSyncEnabled(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('bankrolls')
          .select('data')
          .eq('user_id', userId)
          .single();

        if (error) {
          if (error.message?.includes("Invalid API key") || error.code === 'PGRST301') {
            console.warn("[Supabase] Invalid API Key detected. Disabling cloud sync.");
            setIsSyncEnabled(false);
            return;
          }
          // Ignore "row not found" errors as that just means new user
          if (error.code !== 'PGRST116') {
            console.warn("[Supabase] Fetch error:", error.message);
          }
        }

        if (data && data.data) {
          console.log("[Supabase] Restored bankroll:", data.data);
          // Merge logic to ensure we don't lose structure if schema changed
          const remote = data.data as SportsbookAccount[];

          // Ensure mandatory fields exist
          const merged = [...remote];
          ['BetOnline', 'Bovada'].forEach(name => {
            if (!merged.some(b => b.name === name)) {
              const def = INITIAL_BOOKS.find(b => b.name === name);
              if (def) merged.push(def);
            }
          });

          setBankroll(merged);
        }
      } catch (err) {
        console.warn("[Supabase] Could not fetch bankroll (network/config issue).", err);
      }
    };
    fetchRemoteBankroll();

    const fetchRemoteSlate = async () => {
      if (!userId || !isSyncEnabled) return;
      try {
        const { data, error } = await supabase
          .from('daily_slates')
          .select('queue, daily_plays, reference_lines')
          .eq('user_id', userId)
          .eq('date', today)
          .single();

        if (error && error.code !== 'PGRST116') {
          console.warn("[Supabase] Fetch slate error:", error.message);
        }

        if (data) {
          if (data.queue) setQueue(data.queue);
          if (data.daily_plays) setDailyPlays(data.daily_plays);
          if (data.reference_lines) setReferenceLines(data.reference_lines);
          if (data.scan_results) setScanResults(data.scan_results);
        }
      } catch (err) {
        console.warn("[Supabase] Could not fetch slate (network/config issue).", err);
      }
    };
    fetchRemoteSlate();
  }, [userId, today]);

  // Sync Bankroll to Supabase (Debounced)
  useEffect(() => {
    const saveToSupabase = setTimeout(async () => {
      if (userId && bankroll.length > 0 && isSyncEnabled) {
        const { error } = await supabase
          .from('bankrolls')
          .upsert({ user_id: userId, data: bankroll });

        if (error) {
          console.error("[Supabase] Save failed:", error);
          // If authorization fails or table doesn't exist, disable sync to stop spamming
          if (error.message?.includes("Invalid API key") ||
            error.code === 'PGRST301' ||
            error.message?.includes("relation \"public.bankrolls\" does not exist")) {
            console.warn("[Supabase] Permanent error detected. Disabling cloud sync until reload.");
            setIsSyncEnabled(false);
          }
        } else {
          console.log("[Supabase] Bankroll saved.");
        }
      }
    }, 2000); // 2 second debounce to prevent spamming DB on slider/input changes

    // Also update LocalStorage immediately for responsiveness
    localStorage.setItem('edgelab_bankroll', JSON.stringify(bankroll));

    return () => clearTimeout(saveToSupabase);
  }, [bankroll, userId, isSyncEnabled]);

  // Sync Daily Slate to Supabase (Debounced)
  useEffect(() => {
    const saveSlate = setTimeout(async () => {
      if (userId && isSyncEnabled) {
        const { error } = await supabase
          .from('daily_slates')
          .upsert({
            user_id: userId,
            date: today,
            queue,
            daily_plays: dailyPlays,
            reference_lines: referenceLines,
            scan_results: scanResults
          });

        if (error) {
          console.error("[Supabase] Slate save failed:", error);
          if (error.message?.includes("relation \"public.daily_slates\" does not exist")) {
            setIsSyncEnabled(false);
          }
        }
      }
    }, 2000);

    localStorage.setItem('edgelab_reference_lines', JSON.stringify(referenceLines));
    localStorage.setItem('edgelab_scan_results', JSON.stringify(scanResults));
    return () => clearTimeout(saveSlate);
  }, [queue, dailyPlays, referenceLines, scanResults, userId, today, isSyncEnabled]);

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

  useEffect(() => {
    localStorage.setItem('edgelab_unit_pct', unitSizePercent.toString());
  }, [unitSizePercent]);

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
      const reset = prev.map(g => ({ ...g, cardSlot: undefined }));
      const playable = reset.filter(g => g.analysis?.decision === 'PLAYABLE');

      const validPlayable = playable.filter(g => {
        const oddsStr = g.analysis?.softBestOdds;
        if (!oddsStr) return false;
        const odds = parseFloat(oddsStr);
        if (isNaN(odds)) return false;
        if (odds < 0 && odds < -160) return false;
        return true;
      });

      validPlayable.sort((a, b) => {
        const aVal = a.analysis!;
        const bVal = b.analysis!;
        const aPts = aVal.lineValuePoints || 0;
        const bPts = bVal.lineValuePoints || 0;
        if (aPts !== bPts) return bPts - aPts;
        const parseOdds = (o?: string) => o ? parseFloat(o) : -9999;
        const aOdds = parseOdds(aVal.softBestOdds);
        const bOdds = parseOdds(bVal.softBestOdds);
        if (aOdds !== bOdds) return bOdds - aOdds;
        const aCents = aVal.lineValueCents || 0;
        const bCents = bVal.lineValueCents || 0;
        if (aCents !== bCents) return bCents - aCents;
        return a.id.localeCompare(b.id);
      });

      const top6Ids = validPlayable.slice(0, 6).map(g => g.id);
      return reset.map(g => {
        const slotIndex = top6Ids.indexOf(g.id);
        if (slotIndex !== -1) {
          return { ...g, cardSlot: slotIndex + 1 };
        }
        return g;
      });
    });
  };

  // Bankroll Functions
  const updateBankroll = (bookName: string, balance: number) => {
    setBankroll(prev => {
      const exists = prev.some(b => b.name === bookName);
      if (exists) {
        return prev.map(b => b.name === bookName ? { ...b, balance } : b);
      }
      return [...prev, { name: bookName, balance }];
    });
  };

  const totalBankroll = bankroll.reduce((sum, b) => sum + (b.balance || 0), 0);

  const setReferenceLine = (gameId: string, ref: { spreadLineA: string, spreadLineB: string }) => {
    setReferenceLines(prev => ({ ...prev, [gameId]: ref }));
  };

  const setScanResult = (gameId: string, result: { signal: 'RED' | 'YELLOW' | 'WHITE', description: string }) => {
    setScanResults(prev => ({ ...prev, [gameId]: result }));
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
      bankroll,
      updateBankroll,
      totalBankroll,
      unitSizePercent,
      setUnitSizePercent,
      referenceLines,
      setReferenceLine,
      scanResults,
      setScanResult
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
