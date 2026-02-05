import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useMemo,
} from "react";
import {
  QueuedGame,
  AnalysisState,
  Game,
  BookLines,
  DailyPlayTracker,
  SportsbookAccount,
  ScanResult,
  ReferenceLineData,
  AutoPickResult,
  BookBalanceDisplay,
  TimeWindowFilter,
  UserPersona,
  BatchProgress,
  Bet,
} from "../types";
import { MAX_DAILY_PLAYS, SPORTSBOOK_THEME } from "../constants";
import { supabase, isSupabaseConfigured } from "../services/supabaseClient";
import { isPremiumEdge, isStandardEdge } from "../utils/edgeUtils";
import { useBankroll } from "./useBankroll";
import { isInTimeWindow } from "../utils/timeWindow";
import { personaService } from "../services/personaService";
import { useAuth } from "../components/AuthContext";
import { getCadenceStatus } from "../utils/cadence";
import { calculateCLV } from "../utils/clvUtils";

const GameContext = createContext<AnalysisState | undefined>(undefined);

const getTodayKey = () => new Date().toLocaleDateString("en-CA");
const formatEtDate = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

const slateHasEtDate = (data: Record<string, any[]>, etDate: string) => {
  if (!data || Object.keys(data).length === 0) return false;
  for (const sportKey of Object.keys(data)) {
    const games = data[sportKey] || [];
    for (const g of games) {
      if (!g?.commence_time) continue;
      const d = new Date(g.commence_time);
      if (!Number.isFinite(d.getTime())) continue;
      if (formatEtDate(d) === etDate) return true;
    }
  }
  return false;
};

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const today = getTodayKey();
  const etToday = formatEtDate(new Date());
  const { user } = useAuth();
  const [isSyncEnabled, setIsSyncEnabled] = useState(isSupabaseConfigured);
  const [syncStatus, setSyncStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const legacyUserIdRef = useRef<string | null>(null);

  // NEW: Integrate useBankroll hook
  const {
    bookBalances,
    totalBankroll: hookTotalBankroll,
    updateBookBalance,
    addBet,
    updateBetStatus,
    updateBet,
    deleteBet,
    refresh: refreshBankroll,
    loading: bankrollLoading,
    error: bankrollError,
    bets,
    bankrollState,
  } = useBankroll();

  // Mapping Layer: Convert BookBalanceDisplay[] to SportsbookAccount[]
  const mappedBankroll: SportsbookAccount[] = useMemo(() => {
    return bookBalances.map((b: BookBalanceDisplay) => {
      const theme = SPORTSBOOK_THEME[b.sportsbook] || SPORTSBOOK_THEME["Other"];
      return {
        name: b.sportsbook,
        balance: b.currentBalance,
        color: theme.bg, // Using bg color for UI visualization
      };
    });
  }, [bookBalances]);

  // User ID for Database Persistence
  const [userId, setUserIdState] = useState(user?.id || "");

  useEffect(() => {
    if (user?.id) {
      setUserIdState(user.id);
      localStorage.setItem("edgelab_user_id", user.id);
    }
  }, [user]);

  // Compatibility Layer: updateBankroll wrapper
  const updateBankrollCompat = async (bookName: string, balance: number) => {
    const account = bookBalances.find((b) => b.sportsbook === bookName);
    if (account) {
      const delta = balance - account.currentBalance;
      const newDeposit = account.deposited + delta;
      await updateBookBalance(bookName, { deposited: newDeposit });
    } else {
      await updateBookBalance(bookName, { deposited: balance });
    }
  };

  const setUserIdManual = (newId: string) => {
    if (!newId || newId.length < 5) return;
    setUserIdState(newId);
    localStorage.setItem("edgelab_user_id", newId);
  };

  // State
  const [queue, setQueue] = useState<QueuedGame[]>([]);
  const [persona, setPersonaState] = useState<UserPersona | undefined>(() => {
    try {
      const saved = localStorage.getItem("edgelab_persona");
      return saved ? JSON.parse(saved) : undefined;
    } catch {
      return undefined;
    }
  });

  const setPersona = (newPersona: UserPersona) => {
    setPersonaState(newPersona);
    localStorage.setItem("edgelab_persona", JSON.stringify(newPersona));
  };

  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState<BatchProgress>({
    total: 0,
    current: 0,
    phase: "IDLE",
    statusText: "",
  });

  const [dailyPlays, setDailyPlays] = useState<DailyPlayTracker>({
    date: today,
    playCount: 0,
    gameIds: [],
  });
  // Removed local bankroll state
  const [unitSizePercent, setUnitSizePercent] = useState<number>(2.0);
  const [scanResults, setScanResults] = useState<Record<string, ScanResult>>(
    {},
  );
  const [referenceLines, setReferenceLines] = useState<
    Record<string, ReferenceLineData>
  >({});

  // NEW: Raw Slate Persistence
  const [allSportsData, setAllSportsData] = useState<Record<string, any[]>>(
    () => {
      try {
        const saved = localStorage.getItem("edgelab_raw_slate");
        if (!saved) return {};
        const parsed = JSON.parse(saved);
        if (!slateHasEtDate(parsed, etToday)) {
          localStorage.removeItem("edgelab_raw_slate");
          return {};
        }
        return parsed;
      } catch {
        return {};
      }
    },
  );

  // Derived: Active Books (balance > 0)
  const activeBookNames = useMemo(() => {
    return mappedBankroll
      .filter((account) => account.balance > 0)
      .map((account) => account.name);
  }, [mappedBankroll]);

  // 1. Initial Load from Supabase & LocalStorage (Legacy Slate only)
  useEffect(() => {
    const initData = async () => {
      setSyncStatus("saving");
      try {
        const lastDate = localStorage.getItem("edgelab_last_date");
        const savedQueue = localStorage.getItem("edgelab_queue_v2");
        const savedPlays = localStorage.getItem("edgelab_daily_plays");
        // Removed savedBankroll load
        const savedUnit = localStorage.getItem("edgelab_unit_pct");
        const savedScans = localStorage.getItem(
          `edgelab_scan_results_${today}`,
        );
        const savedRefs = localStorage.getItem(
          `edgelab_reference_lines_${today}`,
        );

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
          localStorage.removeItem("edgelab_raw_slate");
        }
      } catch (err) {
        console.warn("[Context] Error loading from local storage", err);
      }

      if (!isSyncEnabled || !userId) {
        setSyncStatus("idle");
        return;
      }

      try {
        // Fetch Persona
        const remotePersona = await personaService.getPersona(userId);
        if (remotePersona) {
          // Fixup: Ensure SOCCER is in active_sports if missing
          if (!remotePersona.active_sports.map(s => s.toUpperCase()).includes('SOCCER')) {
            remotePersona.active_sports.push('SOCCER');
            await personaService.savePersona(remotePersona);
          }
          setPersona(remotePersona);
        }

        const { data: sData, error: sError } = await supabase
          .from("daily_slates")
          .select(
            "queue, daily_plays, scan_results, reference_lines, all_sports_data",
          )
          .eq("user_id", userId)
          .eq("date", today)
          .single();

        if (sError) {
          // Handle missing table (404/406) or no row found (PGRST116)
          if (sError.code === "PGRST116") {
            // No row found, but table exists. Valid state (new day).
            console.log("[Supabase] No slate found for today (new day).");
          } else if (
            sError.code === "42P01" ||
            sError.code === "PGRST205" ||
            sError.message.includes("404")
          ) {
            // 42P01 is PostgreSQL "undefined_table". PGRST205 is schema cache miss. 404 is HTTP Not Found.
            console.warn(
              "[Supabase] 'daily_slates' table missing. Falling back to local storage.",
              sError,
            );
            setSyncStatus("idle"); // Treat as local-only, not error
            setIsSyncEnabled(false); // Disable further sync attempts for this session
            return;
          } else {
            console.error("[Supabase] Slate fetch error:", sError);
            setSyncStatus("error");
            return;
          }
        }

        let finalData = sData || null;

        if (
          !finalData &&
          sError &&
          sError.code === "PGRST116" &&
          legacyUserIdRef.current
        ) {
          try {
            const legacyId = legacyUserIdRef.current;
            const { data: legacyData, error: legacyError } = await supabase
              .from("daily_slates")
              .select(
                "queue, daily_plays, scan_results, reference_lines, all_sports_data",
              )
              .eq("user_id", legacyId)
              .eq("date", today)
              .single();

            if (!legacyError && legacyData) {
              await supabase.from("daily_slates").upsert(
                {
                  user_id: userId,
                  date: today,
                  queue: legacyData.queue,
                  daily_plays: legacyData.daily_plays,
                  scan_results: legacyData.scan_results,
                  reference_lines: legacyData.reference_lines,
                  all_sports_data: legacyData.all_sports_data,
                },
                { onConflict: "user_id, date" },
              );
              finalData = legacyData;
            }
          } finally {
            legacyUserIdRef.current = null;
          }
        }

        if (finalData) {
          if (finalData.queue) setQueue(finalData.queue);
          if (finalData.daily_plays) setDailyPlays(finalData.daily_plays);
          if (finalData.scan_results) setScanResults(finalData.scan_results);
          if (finalData.reference_lines)
            setReferenceLines(finalData.reference_lines);
          if (finalData.all_sports_data) {
            if (slateHasEtDate(finalData.all_sports_data, etToday)) {
              setAllSportsData(finalData.all_sports_data);
              localStorage.setItem(
                "edgelab_raw_slate",
                JSON.stringify(finalData.all_sports_data),
              );
            } else {
              console.warn(
                "[Supabase] Stale slate detected. Ignoring all_sports_data for today.",
              );
              localStorage.removeItem("edgelab_raw_slate");
              setAllSportsData({});
            }
          }

          localStorage.setItem(
            "edgelab_queue_v2",
            JSON.stringify(finalData.queue),
          );
          localStorage.setItem(
            `edgelab_scan_results_${today}`,
            JSON.stringify(finalData.scan_results),
          );
        }

        setSyncStatus("saved");
      } catch (err: any) {
        // Catch network 404s that might throw instead of returning { error }
        if (
          err.message &&
          (err.message.includes("404") || err.status === 404)
        ) {
          console.warn(
            "[Supabase] 'daily_slates' table missing (Catch). Falling back to local storage.",
          );
          setSyncStatus("idle");
        } else {
          console.warn("[Context] Supabase init failed", err);
          setSyncStatus("error");
        }
      }
    };

    initData();
  }, [userId, today]);

  // 2a. Main Sync Loop (Frequent, Lightweight)
  useEffect(() => {
    localStorage.setItem("edgelab_unit_pct", unitSizePercent.toString());
    localStorage.setItem("edgelab_last_date", today);
    localStorage.setItem("edgelab_queue_v2", JSON.stringify(queue));
    localStorage.setItem("edgelab_daily_plays", JSON.stringify(dailyPlays));
    localStorage.setItem(
      `edgelab_scan_results_${today}`,
      JSON.stringify(scanResults),
    );
    localStorage.setItem(
      `edgelab_reference_lines_${today}`,
      JSON.stringify(referenceLines),
    );

    if (!isSyncEnabled) {
      setSyncStatus("idle");
      return;
    }

    setSyncStatus("saving");
    const timer = setTimeout(async () => {
      if (!userId) {
        setSyncStatus("idle");
        return;
      }

      // Upsert light payload ONLY
      const { error } = await supabase.from("daily_slates").upsert(
        {
          user_id: userId,
          date: today,
          queue: queue,
          daily_plays: dailyPlays,
          scan_results: scanResults,
          reference_lines: referenceLines,
        },
        { onConflict: "user_id, date" },
      );

      if (error) {
        if (
          error.code === "42P01" ||
          error.code === "PGRST205" ||
          error.message.includes("404")
        ) {
          console.warn(
            "[Supabase] 'daily_slates' table missing during save. Falling back to local storage.",
          );
          setSyncStatus("idle");
        } else {
          console.error("[Supabase] Main sync error:", error);
          setSyncStatus("error");
        }
      } else {
        setSyncStatus("saved");
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [
    queue,
    dailyPlays,
    scanResults,
    referenceLines,
    userId,
    today,
    isSyncEnabled,
    unitSizePercent,
  ]);

  // 2b. Heavy Sync Loop (Infrequent, Heavy)
  useEffect(() => {
    // DO NOT sync if empty (prevents wiping DB on fresh load)
    if (Object.keys(allSportsData).length === 0) return;
    if (!slateHasEtDate(allSportsData, etToday)) return;

    // Always update local storage
    localStorage.setItem("edgelab_raw_slate", JSON.stringify(allSportsData));

    if (!isSyncEnabled || !userId) return;

    // Use a longer debounce for heavy payload
    const timer = setTimeout(async () => {
      console.log("[Sync] Uploading heavy slate data...");
      const { error } = await supabase.from("daily_slates").upsert(
        {
          user_id: userId,
          date: today,
          all_sports_data: allSportsData,
        },
        { onConflict: "user_id, date" },
      );

      if (error) {
        console.warn("[Supabase] Heavy sync error:", error);
      } else {
        console.log("[Sync] Heavy slate data uploaded.");
      }
    }, 5000);

    return () => clearTimeout(timer);
  }, [allSportsData, userId, today, isSyncEnabled]);

  // v2.9 Auto-Snapshot Closing Lines
  useEffect(() => {
    if (Object.keys(allSportsData).length === 0) return;

    const interval = setInterval(() => {
      queue.forEach(game => {
        const status = getCadenceStatus(game.date, game.sport);
        // If in LOCK window and we haven't snapshotted yet
        if (status === 'LOCK' && game.sharpLines) {
          const snapshotKey = `edgelab_clv_snap_${game.id}`;
          if (!localStorage.getItem(snapshotKey)) {
            const closingOdds = parseFloat(game.sharpLines.mlOddsA); // Simplified for now
            // Actually we need the odds for the SPECIFIC side picked.
            // But since addBet happens later, we just snapshot ALL sharp lines.
            localStorage.setItem(snapshotKey, JSON.stringify(game.sharpLines));
            console.log(`[CLV] Snapshotted closing lines for ${game.id}`);
          }
        }
      });
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [queue, allSportsData]);

  // Actions
  const addToQueue = (game: Game & Partial<QueuedGame>) => {
    setQueue((prev) => {
      if (prev.some((g) => g.id === game.id)) return prev;
      return [
        ...prev,
        {
          ...game,
          visibleId: (prev.length + 1).toString(),
          addedAt: Date.now(),
          softLines: [],
        },
      ];
    });
  };

  const addAllToQueue = (games: Array<Game & Partial<QueuedGame>>) => {
    if (!games.length) return;
    setQueue((prev) => {
      const existingIds = new Set(prev.map((g) => g.id));
      const newGames = games.filter((g) => !existingIds.has(g.id));
      if (!newGames.length) return prev;

      const next = [...prev];
      const startIndex = prev.length;
      const baseTimestamp = Date.now();

      newGames.forEach((game, index) => {
        next.push({
          ...game,
          visibleId: (startIndex + index + 1).toString(),
          addedAt: baseTimestamp + index,
          softLines: [],
        });
      });

      return next;
    });
  };

  const removeFromQueue = (gameId: string) => {
    setQueue((prev) => prev.filter((g) => g.id !== gameId));
  };

  const removeGames = (gameIds: string[]) => {
    const ids = new Set(gameIds);
    setQueue((prev) => prev.filter((g) => !ids.has(g.id)));
  };

  const restoreGames = (games: QueuedGame[]) => {
    setQueue((prev) => {
      const existingIds = new Set(prev.map((g) => g.id));
      const toAdd = games.filter((g) => !existingIds.has(g.id));
      return [...prev, ...toAdd];
    });
  };

  const updateGame = (gameId: string, updates: Partial<QueuedGame>) => {
    setQueue((prev) =>
      prev.map((g) => (g.id === gameId ? { ...g, ...updates } : g)),
    );
  };

  const addSoftLines = (gameId: string, lines: BookLines) => {
    setQueue((prev) =>
      prev.map((g) =>
        g.id === gameId ? { ...g, softLines: [...g.softLines, lines] } : g,
      ),
    );
  };

  const updateSoftLineBook = (
    gameId: string,
    index: number,
    newBookName: string,
  ) => {
    setQueue((prev) =>
      prev.map((g) => {
        if (g.id !== gameId) return g;
        const next = [...g.softLines];
        if (next[index])
          next[index] = { ...next[index], bookName: newBookName };
        return { ...g, softLines: next };
      }),
    );
  };

  const setSharpLines = (gameId: string, lines: BookLines) => {
    updateGame(gameId, { sharpLines: lines });
  };

  const markAsPlayed = (gameId: string) => {
    setDailyPlays((prev) => ({
      ...prev,
      playCount: prev.playCount + 1,
      gameIds: [...prev.gameIds, gameId],
    }));
  };

  // UPDATED: Smart auto-pick based on quality thresholds, not arbitrary limits
  const autoPickBestGames = (
    window: TimeWindowFilter = "ALL",
  ): AutoPickResult => {
    let pickedCount = 0;
    let skippedCount = 0;
    const skipReasons: string[] = [];

    setQueue((prev) => {
      const reset = prev.map((g) =>
        isInTimeWindow(g.date, window) ? { ...g, cardSlot: undefined } : g,
      );

      // STEP 1: Filter to PLAYABLE with basic requirements
      const playable = reset.filter((g) => {
        if (!isInTimeWindow(g.date, window)) return false;
        if (g.analysis?.decision !== "PLAYABLE") return false;
        if (!g.analysis.softBestOdds) return false;

        // JUICE VETO: Use persona limit or fallback to -160
        const oddsLimit = persona?.max_odds_american ?? -160;
        const oddsStr = g.analysis.softBestOdds;
        const oddsVal = parseFloat(oddsStr);
        if (!isNaN(oddsVal) && oddsVal < oddsLimit) {
          return false;
        }

        return true;
      });

      // STEP 2: Quality-based selection - only pick games that meet thresholds
      const qualityPicks: QueuedGame[] = [];
      const skippedPicks: QueuedGame[] = [];

      playable.forEach((g) => {
        const a = g.analysis!;
        const linePoints = a.lineValuePoints || 0;
        const juiceCents = a.lineValueCents || 0;
        const confidence = a.confidence || "MEDIUM";

        // Use shared logic from edgeUtils
        const isPremium = isPremiumEdge(
          linePoints,
          juiceCents,
          confidence,
          g.sport,
          g.analysis?.market,
        );
        const isStandard = isStandardEdge(
          linePoints,
          juiceCents,
          g.sport,
          g.analysis?.market,
        );

        // Only auto-pick if it meets at least STANDARD threshold
        if (isPremium || isStandard) {
          qualityPicks.push(g);
        } else {
          skippedPicks.push(g);
          const teamName = g.awayTeam.name;
          skipReasons.push(
            `${teamName}: No meaningful edge (${linePoints} pts, ${juiceCents}¢)`,
          );
        }
      });

      skippedCount = skippedPicks.length;

      // STEP 3: Market-aware sort (best first)
      qualityPicks.sort((a, b) => {
        const ap = a.analysis!;
        const bp = b.analysis!;

        // 1) Line value points (CLV priority)
        const pointDiff =
          (bp.lineValuePoints || 0) - (ap.lineValuePoints || 0);
        if (pointDiff !== 0) return pointDiff;

        // 2) Price value (juice cents)
        const juiceDiff = (bp.lineValueCents || 0) - (ap.lineValueCents || 0);
        if (juiceDiff !== 0) return juiceDiff;

        // 3) Edge % (tie-breaker)
        const edgeDiff = (bp.edge || 0) - (ap.edge || 0);
        if (edgeDiff !== 0) return edgeDiff;

        // Deterministic tiebreaker
        return a.id.localeCompare(b.id);
      });

      // STEP 4: Cap at MAX_DAILY_PLAYS for safety (but don't fill to it)
      const finalPicks = qualityPicks
        .slice(0, MAX_DAILY_PLAYS)
        .map((g) => g.id);
      pickedCount = finalPicks.length;

      return reset.map((g) => ({
        ...g,
        cardSlot: finalPicks.includes(g.id)
          ? finalPicks.indexOf(g.id) + 1
          : g.cardSlot,
      }));
    });

    return { picked: pickedCount, skipped: skippedCount, reasons: skipReasons };
  };

  const addBetWithCLV = async (betData: Bet) => {
    // Attempt to attach auto-snapshotted closing line
    const snapshotKey = `edgelab_clv_snap_${betData.id}`;
    const snapshotStr = localStorage.getItem(snapshotKey);
    
    let updatedBet = { ...betData };
    
    if (snapshotStr) {
      try {
        const game = queue.find(g => g.id === betData.id);
        if (game?.analysis?.oddsFloor) {
           const closing = parseFloat(game.analysis.oddsFloor.replace('+', ''));
           updatedBet.closing_odds_sharp = closing;
           updatedBet.clv_percent = calculateCLV(betData.odds, closing);
        }
      } catch (e) {
        console.error("[CLV] Failed to apply snapshot", e);
      }
    }

    // Call underlying bankroll service
    await addBet(updatedBet);
  };

  const setScanResult = (gameId: string, result: ScanResult) => {
    setScanResults((prev) => ({ ...prev, [gameId]: result }));
  };

  const clearScanResults = (gameIds: string[]) => {
    setScanResults((prev) => {
      const next = { ...prev };
      gameIds.forEach((id) => delete next[id]);
      return next;
    });
  };

  const setReferenceLine = (gameId: string, data: ReferenceLineData) => {
    setReferenceLines((prev) => ({ ...prev, [gameId]: data }));
  };

  const loadSlates = (data: Record<string, any[]>) => {
    setAllSportsData(data);
    localStorage.setItem("edgelab_raw_slate", JSON.stringify(data));
  };

  return (
    <GameContext.Provider
      value={{
        queue,
        addToQueue,
        addAllToQueue,
        removeFromQueue,
        removeGames,
        restoreGames,
        updateGame,
        addSoftLines,
        updateSoftLineBook,
        setSharpLines,
        dailyPlays,
        getPlayableCount: () =>
          queue.filter((g) => g.analysis?.decision === "PLAYABLE").length,
        canAddMorePlays: () =>
          queue.filter((g) => g.analysis?.decision === "PLAYABLE").length <
          MAX_DAILY_PLAYS,
        markAsPlayed,
        autoPickBestGames,
        bankroll: mappedBankroll,
        updateBankroll: updateBankrollCompat,
        totalBankroll: hookTotalBankroll,
        bookBalances,
        updateBookBalance,
        bets,
        bankrollState,
            bankrollLoading,
            addBet: addBetWithCLV,
            updateBetStatus,
        
        updateBet,
        deleteBet,
        refreshBankroll,
        unitSizePercent,
        setUnitSizePercent,
        scanResults,
        setScanResult,
        clearScanResults,
        referenceLines,
        setReferenceLine,
        allSportsData,
        loadSlates,
        syncStatus,
        userId,
        setUserId: setUserIdManual,
        activeBookNames,
        persona,
        setPersona,
        isBatchProcessing,
        batchProgress,
        setIsBatchProcessing,
        setBatchProgress,
      }}
    >
      {children}
    </GameContext.Provider>
  );
};

export const useGameContext = () => {
  const context = useContext(GameContext);
  if (!context)
    throw new Error("useGameContext must be used within GameProvider");
  return context;
};
