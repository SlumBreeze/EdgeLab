
import React, { createContext, useContext, useState, useEffect, useRef, useMemo } from 'react';
import { QueuedGame, AnalysisState, Game, BookLines, DailyPlayTracker, SportsbookAccount, ScanResult, ReferenceLineData } from '../types';
import { MAX_DAILY_PLAYS } from '../constants';
import { supabase, isSupabaseConfigured } from '../services/supabaseClient';

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
  const today = getTodayKey();
  // UPDATED: Initialize sync based on whether keys exist
  const [isSyncEnabled, setIsSyncEnabled] = useState(isSupabaseConfigured);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // User ID for Database Persistence
  const [userId, setUserIdState] = useState(() => {
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

  const setUserIdManual = (newId: string) => {
    if (!newId || newId.length < 5) return;
    setUserIdState(newId);
    localStorage.setItem('edgelab_user_id', newId);
    console.log("[Auth] Switched to User ID:", newId);
  };

  // State
  const [queue, setQueue] = useState<QueuedGame[]>([]);
  const [dailyPlays, setDailyPlays] = useState<DailyPlayTracker>({ date: today, playCount: 0, gameIds: [] });
  const [bankroll, setBankroll] = useState<SportsbookAccount[]>(INITIAL_BOOKS);
  const [unitSizePercent, setUnitSizePercent] = useState<number>(2.0);
  const [scanResults, setScanResults] = useState<Record<string, ScanResult>>({});
  const [referenceLines, setReferenceLines] = useState<Record<string, ReferenceLineData>>({});
  
  // NEW: Raw Slate Persistence
  const [allSportsData, setAllSportsData] = useState<Record<string, any[]>>(() => {
    try {
      const saved = localStorage.getItem('edgelab_raw_slate');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Derived: Active Books (balance > 0)
  const activeBookNames = useMemo(() => {
    return bankroll
      .filter(account => account.balance > 0)
      .map(account => account.name);
  }, [bankroll]);

  // 1. Initial Load from Supabase & LocalStorage
  useEffect(() => {
    const initData = async () => {
      setSyncStatus('saving'); 
      try {
        const lastDate = localStorage.getItem('edgelab_last_date');
        const savedQueue = localStorage.getItem('edgelab_queue_v2');
        const savedPlays = localStorage.getItem('edgelab_daily_plays');
        const savedBankroll = localStorage.getItem('edgelab_bankroll');
        const savedUnit = localStorage.getItem('edgelab_unit_pct');
        const savedScans = localStorage.getItem(`edgelab_scan_results_${today}`);
        const savedRefs = localStorage.getItem(`edgelab_reference_lines_${today}`);

        if (savedUnit) setUnitSizePercent(parseFloat(savedUnit));
        
        if (savedBankroll && !bankroll.some(b => b.balance > 0)) {
          const parsed = JSON.parse(savedBankroll);
          if (parsed && parsed.length > 0) setBankroll(parsed);
        }

        if (lastDate === today) {
          if (savedQueue) setQueue(JSON.parse(savedQueue));
          if (savedPlays) setDailyPlays(JSON.parse(savedPlays));
          if (savedScans) setScanResults(JSON.parse(savedScans));
          if (savedRefs) setReferenceLines(JSON.parse(savedRefs));
        } else {
          console.log("[GameContext] New day detected. Resetting slate...");
          setQueue([]);
          setDailyPlays({ date: today, playCount: 0, gameIds: [] });
          setScanResults({});
          setReferenceLines({});
          setAllSportsData({});
          localStorage.removeItem('edgelab_raw_slate');
        }
      } catch (err) {
        console.warn("[Context] Error loading from local storage", err);
      }

      if (!isSyncEnabled || !userId) {
          setSyncStatus('idle');
          return;
      }

      try {
        console.log("[Supabase] Fetching data for user:", userId);
        
        const { data: bData, error: bError } = await supabase
          .from('bankrolls')
          .select('data')
          .eq('user_id', userId)
          .single();
          
        if (bError && bError.code !== 'PGRST116') { // PGRST116 is "Row not found", which is fine
           console.error("[Supabase] Bankroll fetch error:", bError);
        }

        if (bData?.data) {
          setBankroll(bData.data);
          localStorage.setItem('edgelab_bankroll', JSON.stringify(bData.data));
        }

        const { data: sData, error: sError } = await supabase
          .from('daily_slates')
          .select('queue, daily_plays, scan_results, reference_lines')
          .eq('user_id', userId)
          .eq('date', today)
          .single();

        if (sError && sError.code !== 'PGRST116') {
             console.error("[Supabase] Slate fetch error:", sError);
             throw sError;
        }

        if (sData) {
          if (sData.queue) setQueue(sData.queue);
          if (sData.daily_plays) setDailyPlays(sData.daily_plays);
          if (sData.scan_results) setScanResults(sData.scan_results);
          if (sData.reference_lines) setReferenceLines(sData.reference_lines);
          
          localStorage.setItem('edgelab_queue_v2', JSON.stringify(sData.queue));
          localStorage.setItem(`edgelab_scan_results_${today}`, JSON.stringify(sData.scan_results));
        }
        
        setSyncStatus('saved');
      } catch (err) {
        console.warn("[Context] Supabase init failed", err);
        setSyncStatus('error');
      }
    };

    initData();
  }, [userId, today]);

  // 2. Persist Bankroll (Instant Local, Debounced Cloud)
  useEffect(() => {
    localStorage.setItem('edgelab_bankroll', JSON.stringify(bankroll));
    localStorage.setItem('edgelab_unit_pct', unitSizePercent.toString());

    if (!isSyncEnabled) {
      setSyncStatus('idle');
      return;
    }

    setSyncStatus('saving');
    const timer = setTimeout(async () => {
      if (!userId) {
        setSyncStatus('idle');
        return;
      }
      
      const { error } = await supabase
        .from('bankrolls')
        .upsert({ user_id: userId, data: bankroll });
      
      if (error) {
         console.error("[Supabase] Bankroll save error:", error);
         setSyncStatus('error');
         if (error.message.includes("Invalid API key") || error.message.includes("configuration")) setIsSyncEnabled(false);
      } else {
         setSyncStatus('saved');
      }
    }, 2500);
    return () => clearTimeout(timer);
  }, [bankroll, unitSizePercent, userId, isSyncEnabled]);

  // 3. Persist Daily Slate (Instant Local, Debounced Cloud)
  useEffect(() => {
    localStorage.setItem('edgelab_last_date', today);
    localStorage.setItem('edgelab_queue_v2', JSON.stringify(queue));
    localStorage.setItem('edgelab_daily_plays', JSON.stringify(dailyPlays));
    localStorage.setItem(`edgelab_scan_results_${today}`, JSON.stringify(scanResults));
    localStorage.setItem(`edgelab_reference_lines_${today}`, JSON.stringify(referenceLines));

    if (!isSyncEnabled) {
        setSyncStatus('idle');
        return;
    }

    setSyncStatus('saving');
    const timer = setTimeout(async () => {
      if (!userId) {
        setSyncStatus('idle');
        return;
      }

      const { error } = await supabase
        .from('daily_slates')
        .upsert({ 
          user_id: userId, 
          date: today, 
          queue: queue, 
          daily_plays: dailyPlays,
          scan_results: scanResults,
          reference_lines: referenceLines
        });
      
      if (error) {
        console.error("[Supabase] Slate save error:", error);
        setSyncStatus('error');
      } else {
        setSyncStatus('saved');
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [queue, dailyPlays, scanResults, referenceLines, userId, today, isSyncEnabled]);

  // Actions
  const addToQueue = (game: Game) => {
    setQueue(prev => {
      if (prev.some(g => g.id === game.id)) return prev;
      return [...prev, { ...game, visibleId: (prev.length + 1).toString(), addedAt: Date.now(), softLines: [] }];
    });
  };

  const removeFromQueue = (gameId: string) => {
    setQueue(prev => prev.filter(g => g.id !== gameId));
  };

  const updateGame = (gameId: string, updates: Partial<QueuedGame>) => {
    setQueue(prev => prev.map(g => g.id === gameId ? { ...g, ...updates } : g));
  };

  const addSoftLines = (gameId: string, lines: BookLines) => {
    setQueue(prev => prev.map(g => g.id === gameId ? { ...g, softLines: [...g.softLines, lines] } : g));
  };

  const updateSoftLineBook = (gameId: string, index: number, newBookName: string) => {
    setQueue(prev => prev.map(g => {
      if (g.id !== gameId) return g;
      const next = [...g.softLines];
      if (next[index]) next[index] = { ...next[index], bookName: newBookName };
      return { ...g, softLines: next };
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

  const autoPickBestGames = (limit: number = 6) => {
    setQueue(prev => {
      const reset = prev.map(g => ({ ...g, cardSlot: undefined }));
      
      const playable = reset.filter(g => {
        if (g.analysis?.decision !== 'PLAYABLE') return false;
        if (!g.analysis.softBestOdds) return false;
        
        // AUTO-PICK FILTER: JUICE VETO
        // Parse odds string like "+110" or "-150"
        const oddsStr = g.analysis.softBestOdds;
        const oddsVal = parseFloat(oddsStr);
        
        // Check if odds are worse than -160 (e.g. -170, -200)
        // Since -170 < -160 mathematically, we require odds >= -160
        if (!isNaN(oddsVal) && oddsVal < -160) {
            return false;
        }
        
        return true;
      });
      
      playable.sort((a, b) => {
        const ap = a.analysis!;
        const bp = b.analysis!;
        return (bp.lineValuePoints || 0) - (ap.lineValuePoints || 0) || 
               (bp.lineValueCents || 0) - (ap.lineValueCents || 0) ||
               a.id.localeCompare(b.id); // FIXED: Deterministic tiebreaker
      });

      const topPicks = playable.slice(0, limit).map(g => g.id);
      return reset.map(g => ({ ...g, cardSlot: topPicks.includes(g.id) ? topPicks.indexOf(g.id) + 1 : undefined }));
    });
  };

  const updateBankroll = (bookName: string, balance: number) => {
    setBankroll(prev => prev.map(b => b.name === bookName ? { ...b, balance } : b));
  };

  const setScanResult = (gameId: string, result: ScanResult) => {
    setScanResults(prev => ({ ...prev, [gameId]: result }));
  };

  const setReferenceLine = (gameId: string, data: ReferenceLineData) => {
    setReferenceLines(prev => ({ ...prev, [gameId]: data }));
  };

  const loadSlates = (data: Record<string, any[]>) => {
    setAllSportsData(data);
    localStorage.setItem('edgelab_raw_slate', JSON.stringify(data));
  };

  return (
    <GameContext.Provider value={{
      queue, addToQueue, removeFromQueue, updateGame, addSoftLines, updateSoftLineBook, setSharpLines,
      dailyPlays, getPlayableCount: () => queue.filter(g => g.analysis?.decision === 'PLAYABLE').length,
      canAddMorePlays: () => queue.filter(g => g.analysis?.decision === 'PLAYABLE').length < MAX_DAILY_PLAYS,
      markAsPlayed, autoPickBestGames, bankroll, updateBankroll, totalBankroll: bankroll.reduce((s, b) => s + b.balance, 0),
      unitSizePercent, setUnitSizePercent, scanResults, setScanResult, referenceLines, setReferenceLine,
      allSportsData, loadSlates, syncStatus,
      userId, setUserId: setUserIdManual,
      activeBookNames
    }}>
      {children}
    </GameContext.Provider>
  );
};

export const useGameContext = () => {
  const context = useContext(GameContext);
  if (!context) throw new Error('useGameContext must be used within GameProvider');
  return context;
};
