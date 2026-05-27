import React, { useState, useEffect } from "react";
import { useGameContext } from "../hooks/useGameContext";
import {
  extractLinesFromScreenshot,
  quickScanGame,
  analyzeGame,
  isTimeoutError,
} from "../services/geminiService";
import { sportsDbService } from "../services/sportsDbService";
import QueuedGameCard from "../components/QueuedGameCard";
import SwipeableCard from "../components/SwipeableCard";
import {
  fetchOddsForGame,
  getBookmakerLines,
  SOFT_BOOK_KEYS,
} from "../services/oddsService";
import { BookLines } from "../types";
import { ANALYSIS_QUEUE_DELAY_MS } from "../constants";
import { useToast, createToastHelpers } from "../components/Toast";
import {
  TIME_WINDOW_FILTERS,
  TimeWindowFilter,
  getTimeWindowLabel,
  isInTimeWindow,
} from "../utils/timeWindow";

export default function Queue() {
  const {
    queue,
    removeFromQueue,
    removeGames,
    restoreGames,
    updateGame,
    addSoftLines,
    updateSoftLineBook,
    setSharpLines,
    activeBookNames,
    persona,
    bookBalances,
    autoPickBestGames,
  } = useGameContext();
  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set());
  const [selectedWindow, setSelectedWindow] = useState<TimeWindowFilter>("ALL");

  // Toast
  const { addToast } = useToast();
  const toast = createToastHelpers(addToast);

  // Sequential Queue State
  const [analysisQueue, setAnalysisQueue] = useState<string[]>([]);
  const [activeAnalysisId, setActiveAnalysisId] = useState<string | null>(null);
  const [analysisStartTime, setAnalysisStartTime] = useState<number | null>(
    null,
  );
  const analysisRetryCounts = React.useRef<Record<string, number>>({});
  const MAX_ANALYSIS_RETRIES = 2;
  const RETRY_DELAY_MS = 5000;

  // Queue Processor
  useEffect(() => {
    // Only proceed if nothing is actively analyzing and there are queued items
    if (activeAnalysisId || analysisQueue.length === 0) {
      return;
    }

    // Calculate how long to wait before starting the next analysis
    let delay = 0;
    if (analysisStartTime) {
      const elapsed = Date.now() - analysisStartTime;
      delay = Math.max(0, ANALYSIS_QUEUE_DELAY_MS - elapsed);
    }

    const timerId = setTimeout(() => {
      const nextGameId = analysisQueue[0];
      setAnalysisQueue((prev) => prev.slice(1));
      processAnalysis(nextGameId);
    }, delay);

    return () => clearTimeout(timerId);
  }, [activeAnalysisId, analysisQueue, analysisStartTime]);

  useEffect(() => {
    const autoIds = queue
      .filter(
        (g) =>
          g.autoAnalyze &&
          !g.analysis &&
          !g.analysisError &&
          !analysisQueue.includes(g.id) &&
          activeAnalysisId !== g.id,
      )
      .map((g) => g.id);

    if (autoIds.length === 0) return;

    setAnalysisQueue((prev) => {
      const next = new Set(prev);
      autoIds.forEach((id) => next.add(id));
      return Array.from(next);
    });
  }, [queue, analysisQueue, activeAnalysisId]);

  const processAnalysis = async (gameId: string) => {
    const game = queue.find((g) => g.id === gameId);
    if (!game) return;

    setActiveAnalysisId(gameId);
    setAnalysisStartTime(Date.now());

    try {
      // Step 1: Fetch lines from API
      const data = await fetchOddsForGame(game.sport, game.id);
      if (!data) {
        throw new Error("Could not fetch lines for this game.");
      }

      // Step 2: Extract and set sharp lines (Pinnacle)
      const pinnacle = getBookmakerLines(data, "pinnacle");
      if (!pinnacle) {
        throw new Error(
          "Pinnacle lines not available. Cannot analyze without sharp reference.",
        );
      }
      setSharpLines(game.id, pinnacle);

      // Step 3: Auto-select soft books matching active bankroll
      const matchedSoftLines: BookLines[] = [];
      SOFT_BOOK_KEYS.forEach((key) => {
        const lines = getBookmakerLines(data, key);
        if (lines) {
          const displayName = lines.bookName;
          const isActiveBook = activeBookNames.length === 0 || activeBookNames.some(
            (name) =>
              name.toLowerCase().includes(displayName.toLowerCase()) ||
              displayName.toLowerCase().includes(name.toLowerCase()),
          );
          if (isActiveBook) {
            matchedSoftLines.push(lines);
          }
        }
      });

      if (matchedSoftLines.length === 0) {
        throw new Error(
          "None of your active sportsbooks have lines for this game.",
        );
      }

      // Step 4: Update game with sharp and soft lines
      updateGame(game.id, {
        sharpLines: pinnacle,
        softLines: matchedSoftLines,
      });

      // Step 5: Fetch Ground Truth (Rosters) - Parallelized
      const [awayRosterData, homeRosterData] = await Promise.all([
        sportsDbService.getRosterByTeamName(game.awayTeam.name),
        sportsDbService.getRosterByTeamName(game.homeTeam.name)
      ]);
      
      const awayRoster = awayRosterData?.players || [];
      const homeRoster = homeRosterData?.players || [];

      // Step 6: Run v3 analysis
      const result = await analyzeGame({
        ...game,
        sharpLines: pinnacle,
        softLines: matchedSoftLines,
      }, persona, bookBalances, {
        awayRoster,
        homeRoster
      });

      updateGame(game.id, {
        analysis: result,
        analysisError: undefined,
        autoAnalyze: false,
      });

      if (result.decision === "PLAYABLE") {
        toast.showSuccess(
          `Analysis Complete: PLAYABLE (${game.awayTeam.name})`,
        );
      } else {
        toast.showInfo(`Analysis Complete: PASS (${game.awayTeam.name})`);
      }

      // Auto-Pilot: Finalize promotion to Card immediately
      autoPickBestGames();
    } catch (error) {
      console.error(`Analysis failed for game ${gameId}:`, error);
      if (isTimeoutError(error)) {
        const current = analysisRetryCounts.current[gameId] || 0;
        if (current < MAX_ANALYSIS_RETRIES) {
          analysisRetryCounts.current[gameId] = current + 1;
          toast.showWarning(`AI timeout. Retrying (${current + 1}/${MAX_ANALYSIS_RETRIES})...`);
          setTimeout(() => {
            setAnalysisQueue((prev) =>
              prev.includes(gameId) ? prev : [...prev, gameId],
            );
          }, RETRY_DELAY_MS);
        } else {
          updateGame(game.id, {
            analysisError: "AI timeout after retries. Try manual flow.",
            autoAnalyze: false,
          });
          toast.showError("AI timeout after retries.");
        }
      } else {
        // Update game with error state so the card can display the failure
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Analysis failed. Try manual flow.";
        updateGame(game.id, { analysisError: errorMessage, autoAnalyze: false });
        toast.showError(`Analysis failed: ${errorMessage}`);
      }
    } finally {
      setActiveAnalysisId(null);
      // Note: Don't clear analysisStartTime here - the effect needs it to calculate next delay
    }
  };

  const handleQuickAnalyze = (gameId: string) => {
    // Don't allow duplicate entries in queue
    if (analysisQueue.includes(gameId) || activeAnalysisId === gameId) {
      return;
    }

    // Check if game already has analysis
    const game = queue.find((g) => g.id === gameId);
    if (game?.analysis) {
      return;
    }

    if (activeAnalysisId) {
      // Another analysis is running — add to queue
      setAnalysisQueue((prev) => [...prev, gameId]);
      toast.showInfo("Added to analysis queue");
    } else {
      // Nothing running — start immediately
      processAnalysis(gameId);
    }
  };

  const queueGamesForAnalysis = (gamesToAnalyze: typeof queue, rerun = false) => {
    if (gamesToAnalyze.length === 0) {
      toast.showInfo(rerun ? "No games available to re-analyze." : "No eligible games to analyze.");
      return;
    }

    if (rerun) {
      gamesToAnalyze.forEach((game) => {
        updateGame(game.id, {
          analysis: undefined,
          analysisError: undefined,
          autoAnalyze: false,
        });
      });
    }

    const ids = gamesToAnalyze.map((g) => g.id);
    setAnalysisQueue((prev) => Array.from(new Set([...prev, ...ids])));
    toast.showSuccess(`${rerun ? "Re-queued" : "Queued"} ${ids.length} games for analysis.`);
  };

  const getPendingGames = (games: typeof queue) =>
    games.filter(
      (g) =>
        !g.analysis &&
        !g.analysisError &&
        !analysisQueue.includes(g.id) &&
        activeAnalysisId !== g.id,
    );

  const getRerunGames = (games: typeof queue) =>
    games.filter((g) => !analysisQueue.includes(g.id) && activeAnalysisId !== g.id);

  const handleAnalyzeAll = () => {
    queueGamesForAnalysis(getPendingGames(queue));
  };

  const handleReanalyzeAll = () => {
    queueGamesForAnalysis(getRerunGames(queue), true);
  };

  const filteredQueue =
    selectedWindow === "ALL"
      ? queue
      : queue.filter((g) => isInTimeWindow(g.date, selectedWindow));

  const windowCounts = TIME_WINDOW_FILTERS.map((window) => ({
    ...window,
    count: queue.filter((g) => isInTimeWindow(g.date, window.key)).length,
  }));

  const pendingCountAll = getPendingGames(queue).length;
  const pendingCountWindow = getPendingGames(filteredQueue).length;
  const rerunCountAll = getRerunGames(queue).length;
  const rerunCountWindow = getRerunGames(filteredQueue).length;

  const handleAnalyzeWindow = () => {
    if (selectedWindow === "ALL") return;
    const gamesToAnalyze = getPendingGames(filteredQueue);

    if (gamesToAnalyze.length === 0) {
      toast.showInfo("No eligible games to analyze in this window.");
      return;
    }

    queueGamesForAnalysis(gamesToAnalyze);
  };

  const handleReanalyzeWindow = () => {
    if (selectedWindow === "ALL") return;
    queueGamesForAnalysis(getRerunGames(filteredQueue), true);
  };

  const handleRemoveFromQueue = (gameId: string) => {
    setAnalysisQueue((prev) => prev.filter((id) => id !== gameId));
    toast.showInfo("Removed from analysis queue");
  };

  const handleReanalyzeGame = (gameId: string) => {
    const game = queue.find((g) => g.id === gameId);
    if (!game || analysisQueue.includes(gameId) || activeAnalysisId === gameId) return;

    updateGame(gameId, {
      analysis: undefined,
      analysisError: undefined,
      autoAnalyze: false,
    });
    setAnalysisQueue((prev) => Array.from(new Set([...prev, gameId])));
    toast.showInfo("Game re-queued for fresh analysis.");
  };

  const handleManualRemove = (gameId: string) => {
    removeFromQueue(gameId);
    toast.showInfo("Removed from queue");
  };

  const handleClearAll = () => {
    const gamesToRemove = filteredQueue;
    if (gamesToRemove.length === 0) return;

    const ids = gamesToRemove.map((g) => g.id);
    const windowLabel = getTimeWindowLabel(selectedWindow);

    removeGames(ids);

    addToast({
      id: `clear-${Date.now()}`,
      message: `Cleared ${gamesToRemove.length} games from ${windowLabel}`,
      type: "info",
      action: {
        label: "Undo",
        onClick: () => restoreGames(gamesToRemove),
      },
    });
  };

  const handleScan = async (gameId: string) => {
    const game = queue.find((g) => g.id === gameId);
    if (!game) return;

    // If already has a signal, clear it (Reset)
    if (game.edgeSignal) {
      updateGame(gameId, {
        edgeSignal: undefined,
        edgeDescription: undefined,
        scanResult: undefined,
        analysis: undefined,
        analysisError: undefined
      });
      toast.showInfo("Audit data reset.");
      return;
    }

    setAnalyzingIds((prev) => new Set(prev).add(gameId));
    
    // Fetch Ground Truth (Rosters)
    const [awayData, homeData] = await Promise.all([
      sportsDbService.getRosterByTeamName(game.awayTeam.name),
      sportsDbService.getRosterByTeamName(game.homeTeam.name)
    ]);
    const awayRoster = awayData?.players || [];
    const homeRoster = homeData?.players || [];

    const result = await quickScanGame(game, { awayRoster, homeRoster });
    if (result.deferred) {
      toast.showWarning("Scan deferred (AI timeout).");
      setAnalyzingIds((prev) => {
        const next = new Set(prev);
        next.delete(gameId);
        return next;
      });
      return;
    }
    updateGame(gameId, {
      edgeSignal: result.signal,
      edgeDescription: result.description,
      scanResult: result,
    });
    setAnalyzingIds((prev) => {
      const next = new Set(prev);
      next.delete(gameId);
      return next;
    });
  };

  const handleAnalyze = async (gameId: string) => {
    const game = queue.find((g) => g.id === gameId);
    if (!game) return;

    setAnalyzingIds((prev) => new Set(prev).add(gameId));
    try {
      // Fetch Ground Truth (Rosters)
      const [awayData, homeData] = await Promise.all([
        sportsDbService.getRosterByTeamName(game.awayTeam.name),
        sportsDbService.getRosterByTeamName(game.homeTeam.name)
      ]);
      const awayRoster = awayData?.players || [];
      const homeRoster = homeData?.players || [];

      const result = await analyzeGame(game, persona, bookBalances, {
        awayRoster,
        homeRoster
      });
      updateGame(gameId, { analysis: result });

      if (result.decision === "PLAYABLE") {
        toast.showSuccess("Analysis: PLAYABLE");
      } else {
        toast.showInfo("Analysis: PASS");
      }
    } catch (e) {
      console.error(e);
      toast.showError("Analysis failed. Please check inputs.");
    } finally {
      setAnalyzingIds((prev) => {
        const next = new Set(prev);
        next.delete(gameId);
        return next;
      });
    }
  };

  const handleFileUpload = async (
    gameId: string,
    type: "SHARP" | "SOFT",
    file: File,
  ) => {
    try {
      setAnalyzingIds((prev) => new Set(prev).add(gameId + type));
      const lines = await extractLinesFromScreenshot(file);

      if (type === "SHARP") {
        setSharpLines(gameId, lines);
      } else {
        addSoftLines(gameId, lines);
      }
      toast.showSuccess(`Lines extracted from ${type} screenshot`);
    } catch (error) {
      console.error(error);
      toast.showError("Failed to extract lines. Try a clearer image.");
    } finally {
      setAnalyzingIds((prev) => {
        const next = new Set(prev);
        next.delete(gameId + type);
        return next;
      });
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="max-w-7xl mx-auto pb-24">
        <header className="mb-6 flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-ink-text">Analysis Queue</h1>
            <span className="bg-ink-base text-ink-text/90 text-xs px-3 py-1.5 rounded-full font-bold border border-ink-gray">
              {queue.length} Games
            </span>
          </div>

          {(pendingCountAll > 0 || rerunCountAll > 0) && (
            <div className="flex flex-col gap-2">
              {pendingCountAll > 0 ? (
                <button
                  onClick={handleAnalyzeAll}
                  className="w-full py-3 bg-ink-accent hover:bg-sky-500 text-white rounded-xl font-bold shadow-sm transition-all flex items-center justify-center gap-2"
                >
                  <span className="animate-pulse">⚡</span>
                  {analysisQueue.length > 0
                    ? `Queued (${analysisQueue.length}) — Add ${pendingCountAll} More`
                    : `Analyze Remaining (${pendingCountAll})`}
                </button>
              ) : (
                <button
                  onClick={handleReanalyzeAll}
                  className="w-full py-3 bg-ink-paper hover:bg-ink-base text-ink-accent border border-ink-accent rounded-xl font-bold shadow-sm transition-all flex items-center justify-center gap-2"
                >
                  <span>🔄</span>
                  Re-analyze All ({rerunCountAll})
                </button>
              )}
              {selectedWindow !== "ALL" && pendingCountWindow > 0 && (
                <button
                  onClick={handleAnalyzeWindow}
                  className="w-full py-2 bg-ink-paper text-ink-accent border border-ink-accent hover:bg-ink-accent/10 rounded-xl font-bold text-sm shadow-sm transition-all"
                >
                  Analyze {getTimeWindowLabel(selectedWindow)} Window (
                  {pendingCountWindow})
                </button>
              )}
              {selectedWindow !== "ALL" && pendingCountWindow === 0 && rerunCountWindow > 0 && (
                <button
                  onClick={handleReanalyzeWindow}
                  className="w-full py-2 bg-ink-paper text-ink-accent border border-ink-accent hover:bg-ink-accent/10 rounded-xl font-bold text-sm shadow-sm transition-all"
                >
                  Re-analyze {getTimeWindowLabel(selectedWindow)} Window (
                  {rerunCountWindow})
                </button>
              )}
            </div>
          )}
        </header>

        {queue.length > 0 && (
          <div className="mb-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex overflow-x-auto space-x-2 pb-2 no-scrollbar">
                {windowCounts.map((window) => (
                  <button
                    key={window.key}
                    onClick={() => setSelectedWindow(window.key)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-full whitespace-nowrap transition-all shadow-sm border ${
                      selectedWindow === window.key
                        ? "bg-ink-accent text-white font-bold border-ink-accent shadow-sm"
                        : "bg-ink-paper text-ink-text/90 hover:text-ink-text border-ink-gray"
                    }`}
                  >
                    <span className="text-xs">{window.label}</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full ${
                        selectedWindow === window.key
                          ? "bg-white/20 text-white"
                          : "bg-ink-base text-ink-text/80 border border-ink-gray"
                      }`}
                    >
                      {window.count}
                    </span>
                  </button>
                ))}
              </div>

              <button
                onClick={handleClearAll}
                disabled={filteredQueue.length === 0}
                className={`flex items-center gap-2 px-4 py-2 rounded-full whitespace-nowrap transition-all shadow-sm border ${
                  filteredQueue.length > 0
                    ? "bg-ink-panel text-ink-text/80 hover:text-red-400 border-ink-gray hover:border-red-400/30"
                    : "bg-ink-base text-ink-text/40 border-ink-gray/50 cursor-not-allowed"
                }`}
                title={`Clear all ${getTimeWindowLabel(selectedWindow)} games`}
              >
                <span className="text-[10px] font-bold uppercase tracking-wider">
                  🗑️ Clear {selectedWindow === "ALL" ? "Slate" : getTimeWindowLabel(selectedWindow)}
                </span>
              </button>
            </div>
            {selectedWindow !== "ALL" && (
              <div className="text-[10px] text-ink-text/90">
                Showing {getTimeWindowLabel(selectedWindow)} window —{" "}
                {filteredQueue.length} of {queue.length}
              </div>
            )}
            <div className="mt-2 p-3 bg-ink-paper/70 rounded-xl border border-ink-gray text-[11px] text-ink-text/90">
              <div className="font-semibold text-ink-text/80 mb-1">
                Scan cadence (ET)
              </div>
              <div className="flex flex-wrap gap-3">
                <span>First pass: 90m pre-start</span>
                <span>Second pass: 45-60m pre-start</span>
                <span>Final lock: 20-30m pre-start</span>
              </div>
            </div>
          </div>
        )}

        {/* Swipe Hint */}
        {queue.length > 0 && (
          <div className="text-center text-[10px] text-ink-text/90 italic mb-2 animate-pulse">
            ← Swipe left on cards to remove
          </div>
        )}

        {queue.length === 0 ? (
          <div className="text-center py-20 bg-ink-paper rounded-2xl border border-ink-gray shadow-sm">
            <p className="mb-2 text-5xl">📋</p>
            <p className="text-ink-text/90 font-medium">Your queue is empty.</p>
            <p className="text-sm text-ink-text/90 mt-1">
              Go to Scout to add games.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {filteredQueue.map((game) => (
              <div key={game.id}>
                <SwipeableCard
                  onSwipeLeft={() => handleManualRemove(game.id)}
                  leftAction={{
                    label: "Remove",
                    icon: "🗑️",
                    color: "bg-red-500",
                  }}
                  disabled={
                    activeAnalysisId === game.id ||
                    analysisQueue.includes(game.id) ||
                    analyzingIds.has(game.id) ||
                    analyzingIds.has(game.id + "SHARP") ||
                    analyzingIds.has(game.id + "SOFT")
                  }
                >
                  <QueuedGameCard
                    game={game}
                    queuePosition={analysisQueue.indexOf(game.id)}
                    isAnalyzing={activeAnalysisId === game.id}
                    onQuickAnalyze={() => handleQuickAnalyze(game.id)}
                    onReanalyze={() => handleReanalyzeGame(game.id)}
                    onRemoveFromQueue={() => handleRemoveFromQueue(game.id)}
                    loading={
                      analyzingIds.has(game.id) ||
                      analyzingIds.has(game.id + "SHARP") ||
                      analyzingIds.has(game.id + "SOFT")
                    }
                    onRemove={() => handleManualRemove(game.id)}
                    onScan={() => handleScan(game.id)}
                    onAnalyze={() => handleAnalyze(game.id)}
                    onUploadSharp={(f) => handleFileUpload(game.id, "SHARP", f)}
                    onUploadSoft={(f) => handleFileUpload(game.id, "SOFT", f)}
                    onUpdateSoftBook={(idx, name) =>
                      updateSoftLineBook(game.id, idx, name)
                    }
                  />
                </SwipeableCard>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
