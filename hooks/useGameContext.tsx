import React, { createContext, useContext, useState, useEffect, useRef, useMemo } from 'react';
import { QueuedGame, AnalysisState, Game, BookLines, DailyPlayTracker, SportsbookAccount, ScanResult, ReferenceLineData, AutoPickResult, BookBalanceDisplay } from '../types';
import { MAX_DAILY_PLAYS, SPORTSBOOK_THEME } from '../constants';
import { supabase, isSupabaseConfigured } from '../services/supabaseClient';
import { isPremiumEdge, isStandardEdge } from '../utils/edgeUtils';
import { useBankroll } from './useBankroll';

const GameContext = createContext<AnalysisState | undefined>(undefined);

const getTodayKey = () => new Date().toLocaleDateString('en-CA');

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const today = getTodayKey();
  const [isSyncEnabled, setIsSyncEnabled] = useState(isSupabaseConfigured);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // NEW: Integrate useBankroll hook
  const { 
    bookBalances, 
    totalBankroll: hookTotalBankroll, 
    updateBookDeposit,
    addBet,
    updateBetStatus,
    updateBet,
    deleteBet,
    refresh: refreshBankroll,
    loading: bankrollLoading,
    error: bankrollError,
    bets,
    bankrollState
  } = useBankroll();

  // Mapping Layer: Convert BookBalanceDisplay[] to SportsbookAccount[]
  const mappedBankroll: SportsbookAccount[] = useMemo(() => {
    return bookBalances.map((b: BookBalanceDisplay) => {
      const theme = SPORTSBOOK_THEME[b.sportsbook] || SPORTSBOOK_THEME['Other'];
      return {
        name: b.sportsbook,
        balance: b.currentBalance,
        color: theme.bg // Using bg color for UI visualization
      };
    });
  }, [bookBalances]);

  // Compatibility Layer: updateBankroll wrapper
  const updateBankrollCompat = async (bookName: string, balance: number) => {
    // In legacy, we set balance directly. In new system, we update deposit.
    // New Balance = Deposited + Profit
    // We want to set New Balance. So we need to calculate implied New Deposit.
    // New Deposit = New Balance - Profit
    // Profit = Current Balance - Deposited
    
    const account = bookBalances.find(b => b.sportsbook === bookName);
    if (account) {
        const currentProfit = account.currentBalance - account.deposited;
        const newDeposit = balance - currentProfit;
        await updateBookDeposit(bookName, newDeposit);
    } else {
        // If not found (rare), assume 0 profit
        await updateBookDeposit(bookName, balance);
    }
  };

  // User ID for Database Persistence (Legacy Auth)
  const [userId, setUserIdState] = useState(() => {
    try {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const urlId = params.get('uid');
        if (urlId && urlId.length > 5) {
           localStorage.setItem('edgelab_user_id', urlId);
           window.history.replaceState({}, document.title, window.location.pathname);
           return urlId;
        }
      }
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
  // Removed local bankroll state
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
    return mappedBankroll
      .filter(account => account.balance > 0)
      .map(account => account.name);
  }, [mappedBankroll]);

  // 1. Initial Load from Supabase & LocalStorage (Legacy Slate only)
  useEffect(() => {
    const initData = async () => {
      setSyncStatus('saving'); 
      try {
        const lastDate = localStorage.getItem('edgelab_last_date');
        const savedQueue = localStorage.getItem('edgelab_queue_v2');
        const savedPlays = localStorage.getItem('edgelab_daily_plays');
        // Removed savedBankroll load
        const savedUnit = localStorage.getItem('edgelab_unit_pct');
        const savedScans = localStorage.getItem(`edgelab_scan_results_${today}`);
        const savedRefs = localStorage.getItem(`edgelab_reference_lines_${today}`);

        if (savedUnit) setUnitSizePercent(parseFloat(savedUnit));
        
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
        const { data: sData, error: sError } = await supabase
          .from('daily_slates')
          .select('queue, daily_plays, scan_results, reference_lines')
          .eq('user_id', userId)
          .eq('date', today)
          .single();

        if (sError && sError.code !== 'PGRST116') {
             console.error("[Supabase] Slate fetch error:", sError);
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

  // 2. Persist Slate (Instant Local, Debounced Cloud)
  useEffect(() => {
    localStorage.setItem('edgelab_unit_pct', unitSizePercent.toString());

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
  }, [queue, dailyPlays, scanResults, referenceLines, userId, today, isSyncEnabled, unitSizePercent]);

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

  // UPDATED: Smart auto-pick based on quality thresholds, not arbitrary limits
  const autoPickBestGames = (): AutoPickResult => {
    let pickedCount = 0;
    let skippedCount = 0;
    const skipReasons: string[] = [];
    
    setQueue(prev => {
      const reset = prev.map(g => ({ ...g, cardSlot: undefined }));
      
      // STEP 1: Filter to PLAYABLE with basic requirements
      const playable = reset.filter(g => {
        if (g.analysis?.decision !== 'PLAYABLE') return false;
        if (!g.analysis.softBestOdds) return false;
        
        // JUICE VETO: Skip odds worse than -160
        const oddsStr = g.analysis.softBestOdds;
        const oddsVal = parseFloat(oddsStr);
        if (!isNaN(oddsVal) && oddsVal < -160) {
            return false;
        }
        
        return true;
      });
      
      // STEP 2: Quality-based selection - only pick games that meet thresholds
      const qualityPicks: QueuedGame[] = [];
      const skippedPicks: QueuedGame[] = [];
      
      playable.forEach(g => {
        const a = g.analysis!;
        const linePoints = a.lineValuePoints || 0;
        const juiceCents = a.lineValueCents || 0;
        const confidence = a.confidence || 'MEDIUM';
        
        // Use shared logic from edgeUtils
        const isPremium = isPremiumEdge(linePoints, juiceCents, confidence, g.sport, g.analysis?.market);
        const isStandard = isStandardEdge(linePoints, juiceCents, g.sport, g.analysis?.market);
        
        // Only auto-pick if it meets at least STANDARD threshold
        if (isPremium || isStandard) {
          qualityPicks.push(g);
        } else {
          skippedPicks.push(g);
          const teamName = g.awayTeam.name;
          skipReasons.push(`${teamName}: No meaningful edge (${linePoints} pts, ${juiceCents}¢)`);
        }
      });
      
      skippedCount = skippedPicks.length;
      
      // STEP 3: Sort by quality (best first)
      qualityPicks.sort((a, b) => {
        const ap = a.analysis!;
        const bp = b.analysis!;
        
        // Premium picks first (HIGH confidence or big edges)
        const aPremium = isPremiumEdge(ap.lineValuePoints, ap.lineValueCents, ap.confidence, a.sport, ap.market);
        const bPremium = isPremiumEdge(bp.lineValuePoints, bp.lineValueCents, bp.confidence, b.sport, bp.market);
        
        if (aPremium !== bPremium) return bPremium ? 1 : -1;
        
        // Then by line value points
        const pointDiff = (bp.lineValuePoints || 0) - (ap.lineValuePoints || 0);
        if (pointDiff !== 0) return pointDiff;
        
        // Then by juice cents
        const juiceDiff = (bp.lineValueCents || 0) - (ap.lineValueCents || 0);
        if (juiceDiff !== 0) return juiceDiff;
        
        // Deterministic tiebreaker
        return a.id.localeCompare(b.id);
      });

      // STEP 4: Cap at MAX_DAILY_PLAYS for safety (but don't fill to it)
      const finalPicks = qualityPicks.slice(0, MAX_DAILY_PLAYS).map(g => g.id);
      pickedCount = finalPicks.length;
      
      return reset.map(g => ({ 
        ...g, 
        cardSlot: finalPicks.includes(g.id) ? finalPicks.indexOf(g.id) + 1 : undefined 
      }));
    });
    
    return { picked: pickedCount, skipped: skippedCount, reasons: skipReasons };
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
      markAsPlayed, autoPickBestGames, 
      bankroll: mappedBankroll, 
      updateBankroll: updateBankrollCompat, 
      totalBankroll: hookTotalBankroll,
      bookBalances,
      updateBookDeposit,
      bets,
      bankrollState,
      bankrollLoading,
      addBet,
      updateBetStatus,
      updateBet,
      deleteBet,
      refreshBankroll,
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