import React, { useEffect, useState } from "react";
import { useGameContext } from "../hooks/useGameContext";
import {
  HighHitAnalysis,
  QueuedGame,
  SportsbookAccount,
  AutoPickResult,
  BookLines,
} from "../types";
import { MAX_DAILY_PLAYS } from "../constants";
import {
  analyzeCard,
  CardAnalytics,
  DiversificationWarning,
  PLScenario,
} from "../utils/cardAnalytics";
import { useToast, createToastHelpers } from "../components/Toast";
import StickyCardSummary from "../components/StickyCardSummary";
import { isPremiumEdge } from "../utils/edgeUtils";
import { mapQueuedGameToDraftBet, DraftBet } from "../types/draftBet";
import { refreshAnalysisMathOnly } from "../services/geminiService";
import { calculateKellyWager } from "../utils/calculations";
import {
  fetchOddsForGame,
  getBookmakerLines,
  SOFT_BOOK_KEYS,
} from "../services/oddsService";
import {
  TIME_WINDOW_FILTERS,
  TimeWindowFilter,
  getTimeWindowLabel,
  isInTimeWindow,
} from "../utils/timeWindow";

type AlternativeBook = { bookName: string; odds: string; line?: string };
type AvailableBalanceLookup = (bookName: string) => number | null;

const parseNumber = (value?: string) => {
  if (!value) return null;
  const parsed = parseFloat(value.replace(/^[ou]/i, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

const parseAmericanOdds = (value?: string, fallback?: number) => {
  if (fallback !== undefined && Number.isFinite(fallback)) return fallback;
  if (!value) return null;
  const matches = value.match(/([+-]\d{2,4})/g);
  if (!matches || matches.length === 0) return null;
  const last = matches[matches.length - 1];
  const parsed = parseInt(last, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeBookName = (name: string) => name.trim().toLowerCase();

const findMatchingAccount = (
  bookName: string,
  bankroll: SportsbookAccount[],
) => {
  const target = normalizeBookName(bookName);
  return (
    bankroll.find((b) => {
      const name = normalizeBookName(b.name);
      return name.includes(target) || target.includes(name);
    }) || null
  );
};

// Helper: Find alternative book with funds and acceptable line/odds floors
const getAlternativeBook = (
  game: QueuedGame,
  analysis: HighHitAnalysis,
  wagerAmount: number,
  getAvailableBalance: AvailableBalanceLookup,
): AlternativeBook | null => {
  const { market, side, lineFloor, oddsFloor } = analysis;
  const currentBook = analysis.softBestBook;

  const floorLineVal = parseNumber(lineFloor);
  const floorOddsVal = parseNumber(oddsFloor);

  const candidates: Array<
    AlternativeBook & { lineScore: number; oddsVal: number }
  > = [];

  game.softLines.forEach((book) => {
    if (book.bookName === currentBook) return;
    const available = getAvailableBalance(book.bookName);
    if (available === null || available < wagerAmount) return;

    let odds = "";
    let line: string | undefined;
    let lineOk = true;

    if (market === "Moneyline") {
      odds = side === "AWAY" ? book.mlOddsA : book.mlOddsB;
    } else if (market === "Spread") {
      line = side === "AWAY" ? book.spreadLineA : book.spreadLineB;
      odds = side === "AWAY" ? book.spreadOddsA : book.spreadOddsB;
      const lineVal = parseNumber(line);
      lineOk =
        floorLineVal === null || (lineVal !== null && lineVal >= floorLineVal);
    } else if (market === "Total") {
      line = book.totalLine;
      odds = side === "OVER" ? book.totalOddsOver : book.totalOddsUnder;
      const lineVal = parseNumber(line);
      if (floorLineVal !== null && lineVal !== null) {
        lineOk =
          side === "OVER" ? lineVal <= floorLineVal : lineVal >= floorLineVal;
      }
    }

    const oddsVal = parseNumber(odds);
    if (!odds || odds === "N/A" || oddsVal === null || !lineOk) return;

    if (floorOddsVal !== null && oddsVal < floorOddsVal) return;

    const lineVal = line ? parseNumber(line) : null;
    let lineScore = 0;
    if (lineVal !== null && floorLineVal !== null) {
      if (market === "Total" && side === "OVER") {
        lineScore = floorLineVal - lineVal;
      } else {
        lineScore = lineVal - floorLineVal;
      }
    }

    candidates.push({
      bookName: book.bookName,
      odds,
      line,
      lineScore,
      oddsVal,
    });
  });

  candidates.sort((a, b) => {
    if (a.lineScore !== b.lineScore) return b.lineScore - a.lineScore;
    return b.oddsVal - a.oddsVal;
  });

  if (candidates.length === 0) return null;
  const { line, odds, bookName } = candidates[0];
  return { bookName, line, odds };
};

const getFactConfidenceStyle = (confidence?: string) => {
  if (confidence === "HIGH")
    return "bg-emerald-500/10 text-emerald-300 border-emerald-500/30";
  if (confidence === "MEDIUM")
    return "bg-amber-500/10 text-amber-300 border-amber-500/30";
  if (confidence === "LOW")
    return "bg-status-loss/10 text-status-loss border-status-loss/30";
  return "bg-ink-base text-ink-text/50 border-ink-gray";
};

export default function Card({
  onLogBet,
}: {
  onLogBet: (draft: DraftBet) => void;
}) {
  const {
    queue,
    autoPickBestGames,
    totalBankroll,
    unitSizePercent,
    bankroll,
    updateGame,
    activeBookNames,
    userId,
  } = useGameContext();
  const [lastPickResult, setLastPickResult] = useState<AutoPickResult | null>(
    null,
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedWindow, setSelectedWindow] = useState<TimeWindowFilter>("ALL");
  const [kellyFraction, setKellyFraction] = useState(0.25);

  // History State
  const [historyDate, setHistoryDate] = useState<string>("");
  const [isHistoryMode, setIsHistoryMode] = useState(false);
  const [historyQueue, setHistoryQueue] = useState<QueuedGame[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const [cardBankrollSnapshot, setCardBankrollSnapshot] = useState<
    number | null
  >(() => {
    try {
      const key = `edgelab_card_bankroll_${new Date().toLocaleDateString("en-CA")}`;
      const saved = localStorage.getItem(key);
      if (!saved) return null;
      const parsed = parseFloat(saved);
      return Number.isFinite(parsed) ? parsed : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (cardBankrollSnapshot !== null || totalBankroll <= 0) return;
    try {
      const key = `edgelab_card_bankroll_${new Date().toLocaleDateString("en-CA")}`;
      localStorage.setItem(key, totalBankroll.toString());
    } catch {
      // Ignore storage errors
    }
    setCardBankrollSnapshot(totalBankroll);
  }, [cardBankrollSnapshot, totalBankroll]);

  // Toast
  const { addToast } = useToast();
  const toast = createToastHelpers(addToast);

  // History Fetcher
  useEffect(() => {
    if (!isHistoryMode || !historyDate || !userId) return;

    const loadHistory = async () => {
      setIsLoadingHistory(true);
      // Dynamically import to separate context
      const { fetchDailySlate } = await import("../services/supabaseClient");
      const data = await fetchDailySlate(userId, historyDate);

      if (data && data.queue) {
        setHistoryQueue(data.queue);
        toast.showSuccess(`Loaded history for ${historyDate}`);
      } else {
        setHistoryQueue([]);
        toast.showInfo(`No data found for ${historyDate}`);
      }
      setIsLoadingHistory(false);
    };

    loadHistory();
  }, [historyDate, isHistoryMode, userId]);

  // Active Data Source (Current or History)
  const activeQueue = isHistoryMode ? historyQueue : queue;

  const windowQueue =
    selectedWindow === "ALL"
      ? activeQueue
      : activeQueue.filter((g) => isInTimeWindow(g.date, selectedWindow));

  const analyzedGames = windowQueue.filter((g) => g.analysis);
  const playable = analyzedGames.filter(
    (g) => g.analysis?.decision === "PLAYABLE",
  );
  const passed = analyzedGames.filter((g) => g.analysis?.decision === "PASS");

  const playableCount = playable.length;
  const overLimit = playableCount > MAX_DAILY_PLAYS;

  const hasAutoPicked = windowQueue.some((g) => g.cardSlot !== undefined);
  const pickCount = windowQueue.filter((g) => g.cardSlot !== undefined).length;
  const playableInDisplayOrder = hasAutoPicked
    ? [...playable].sort((a, b) => (a.cardSlot || 999) - (b.cardSlot || 999))
    : playable;

  // ANALYTICS COMPUTATION
  const bankrollForCard = cardBankrollSnapshot ?? totalBankroll;
  const analytics = analyzeCard(
    windowQueue,
    bankrollForCard,
    unitSizePercent,
    hasAutoPicked,
  );

  const targetCount = hasAutoPicked ? pickCount : playableCount;
  const windowCounts = TIME_WINDOW_FILTERS.map((window) => ({
    ...window,
    count: activeQueue.filter(
      (g) => g.analysis && isInTimeWindow(g.date, window.key),
    ).length,
  }));

  // Key Scenarios (P&L)
  const keyScenarios = analytics.plScenarios.filter((s) => {
    if (targetCount <= 3) return true;
    return (
      s.wins === targetCount ||
      s.wins === targetCount - 1 ||
      s.wins === Math.ceil(targetCount * 0.67) ||
      s.isBreakEven ||
      s.wins === Math.floor(targetCount * 0.33) ||
      s.wins === 1 ||
      s.wins === 0
    );
  });

  const refreshCardOdds = async () => {
    if (isHistoryMode) {
      toast.showInfo("Cannot refresh odds for historical cards.");
      return;
    }
    if (isRefreshing) return;
    const targets = windowQueue.filter((g) => g.analysis);
    if (targets.length === 0) {
      toast.showInfo("No analyzed games to refresh in this window.");
      return;
    }

    setIsRefreshing(true);
    let updated = 0;
    let playableUpdated = 0;
    let passedUpdated = 0;
    let failed = 0;

    for (const game of targets) {
      try {
        const data = await fetchOddsForGame(game.sport, game.id);
        if (!data) {
          failed += 1;
          continue;
        }

        const pinnacle = getBookmakerLines(data, "pinnacle");
        if (!pinnacle) {
          failed += 1;
          continue;
        }

        const matchedSoftLines: BookLines[] = [];
        SOFT_BOOK_KEYS.forEach((key) => {
          const lines = getBookmakerLines(data, key);
          if (!lines) return;
          const displayName = lines.bookName;
          const isActiveBook = activeBookNames.some(
            (name) =>
              name.toLowerCase().includes(displayName.toLowerCase()) ||
              displayName.toLowerCase().includes(name.toLowerCase()),
          );
          if (isActiveBook) matchedSoftLines.push(lines);
        });

        if (matchedSoftLines.length === 0) {
          failed += 1;
          continue;
        }

        const refreshedGame = {
          ...game,
          sharpLines: pinnacle,
          softLines: matchedSoftLines,
        };
        const result = refreshAnalysisMathOnly(refreshedGame);

        updateGame(game.id, {
          sharpLines: pinnacle,
          softLines: matchedSoftLines,
          analysis: result,
          analysisError: undefined,
        });
        updated += 1;
        if (result.decision === "PLAYABLE") playableUpdated += 1;
        else passedUpdated += 1;
      } catch (error) {
        console.error("Card refresh failed for game:", game.id, error);
        failed += 1;
      }
    }

    if (updated > 0) {
      const failureNote = failed > 0 ? ` (${failed} failed)` : "";
      toast.showSuccess(
        `Odds refreshed: ${updated} updated — ${playableUpdated} playable, ${passedUpdated} passed${failureNote}`,
      );
    } else {
      toast.showWarning(
        "No games refreshed. Check your active books or try again later.",
      );
    }

    setIsRefreshing(false);
  };

  const playableAllocations = (() => {
    if (isHistoryMode) return []; // No allocation calc for history

    const remainingByAccount = new Map<string, number>();
    bankroll.forEach((acc) => {
      remainingByAccount.set(normalizeBookName(acc.name), acc.balance);
    });

    const getAvailableBalance: AvailableBalanceLookup = (bookName: string) => {
      const acc = findMatchingAccount(bookName, bankroll);
      if (!acc) return null;
      const key = normalizeBookName(acc.name);
      return remainingByAccount.has(key)
        ? remainingByAccount.get(key)!
        : acc.balance;
    };

    const reserveBalance = (bookName: string, amount: number) => {
      const acc = findMatchingAccount(bookName, bankroll);
      if (!acc) return;
      const key = normalizeBookName(acc.name);
      const current = remainingByAccount.get(key);
      if (current === undefined) return;
      remainingByAccount.set(key, Math.max(0, current - amount));
    };

    const oneUnit = (bankrollForCard * unitSizePercent) / 100;

    return playableInDisplayOrder.map((game) => {
      const analysis = game.analysis!;
      const isWagerCalculated = totalBankroll > 0;
      let wagerUnits = 1.0;
      if (analysis.confidence === "HIGH") wagerUnits = 1.5;
      if (analysis.confidence === "LOW") wagerUnits = 0.5;
      const baseWagerAmount = oneUnit * wagerUnits;

      let selectedBook = analysis.softBestBook || "";
      let selectedAlt: AlternativeBook | null = null;
      let usedAlt = false;

      if (isWagerCalculated && selectedBook) {
        const recBalance = getAvailableBalance(selectedBook);
        const hasFullFunds =
          recBalance !== null && recBalance >= baseWagerAmount;
        if (!hasFullFunds) {
          const altFull = getAlternativeBook(
            game,
            analysis,
            baseWagerAmount,
            getAvailableBalance,
          );
          if (altFull) {
            selectedAlt = altFull;
            selectedBook = altFull.bookName;
            usedAlt = true;
          } else if (recBalance === null || recBalance <= 0) {
            const altPartial = getAlternativeBook(
              game,
              analysis,
              0.01,
              getAvailableBalance,
            );
            if (altPartial) {
              selectedAlt = altPartial;
              selectedBook = altPartial.bookName;
              usedAlt = true;
            }
          }
        }
      }

      const availableBalance = isWagerCalculated
        ? getAvailableBalance(selectedBook)
        : null;
      const isCapped =
        isWagerCalculated &&
        availableBalance !== null &&
        availableBalance < baseWagerAmount;
      const wagerAmount = isCapped
        ? Math.max(0, availableBalance)
        : baseWagerAmount;
      const effectiveWagerUnits =
        isWagerCalculated && oneUnit > 0
          ? Math.round((wagerAmount / oneUnit) * 100) / 100
          : wagerUnits;

      if (isWagerCalculated && availableBalance !== null) {
        reserveBalance(selectedBook, wagerAmount);
      }

      let displayRecLine = analysis.recLine || "";
      if (usedAlt && selectedAlt) {
        if (analysis.market === "Moneyline") {
          displayRecLine = selectedAlt.odds;
        } else {
          const altLine = selectedAlt.line || analysis.line;
          displayRecLine = altLine
            ? `${altLine} (${selectedAlt.odds})`
            : selectedAlt.odds;
        }
      }

      const overrideOdds =
        usedAlt && selectedAlt ? parseFloat(selectedAlt.odds) : undefined;

      return {
        gameId: game.id,
        wagerUnits: effectiveWagerUnits,
        wagerAmount,
        isWagerCalculated,
        displayBook: selectedBook,
        displayRecLine,
        usedAlt,
        isCapped,
        availableBalance,
        overrideBook: usedAlt && selectedAlt ? selectedAlt.bookName : undefined,
        overrideOdds,
      };
    });
  })();

  const handleSmartPick = () => {
    if (isHistoryMode) return;
    const result = autoPickBestGames(selectedWindow);
    setLastPickResult(result);
    // Toast logic...
    if (result.picked === 0) toast.showWarning(`No picks met thresholds`);
    else toast.showSuccess(`Smart Card: ${result.picked} picks`);
  };

  const generateClipboardText = () => {
    const dateStr = isHistoryMode
      ? new Date(historyDate).toLocaleDateString()
      : new Date().toLocaleDateString("en-US", {
          weekday: "long",
          month: "short",
          day: "numeric",
        });
    let output = `EDGELAB v3 — ${isHistoryMode ? "HISTORICAL" : "DAILY"} CARD\n${dateStr}\n${"=".repeat(35)}\n\n`;

    const sortedPlayable = hasAutoPicked
      ? [...playable].sort((a, b) => (a.cardSlot || 999) - (b.cardSlot || 999))
      : playable;

    // ... (rest of clipboard generation same as before)
    if (sortedPlayable.length > 0) {
      output += `✅ PLAYABLE\n`;
      sortedPlayable.forEach((g) => {
        const a = g.analysis!;
        if (g.cardSlot) output += `[SLOT #${g.cardSlot}] `;
        output += `\n${g.sport}: ${g.awayTeam.name} @ ${g.homeTeam.name}\n`;
        // ... (truncated for brevity, logic remains)
        const pickLabel =
          a.pick ||
          (a.recommendation && a.recommendation.length > 4
            ? a.recommendation
            : undefined);
        if (pickLabel)
          output += `PICK: ${pickLabel} ${a.recLine} @ ${a.softBestBook}\n`;
      });
    } else {
      output += `✅ PLAYABLE: None\n`;
    }
    output += `\n⛔ PASSED: ${passed.length} games\n`;
    return output;
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generateClipboardText());
    toast.showSuccess("Card copied to clipboard!");
  };

  const toggleHistory = () => {
    setIsHistoryMode(!isHistoryMode);
    if (!isHistoryMode) {
      // Reset to yesterday or empty
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      setHistoryDate(yesterday.toISOString().split("T")[0]);
    } else {
      setHistoryQueue([]);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="max-w-7xl mx-auto pb-24">
        {/* HEADER */}
        <header className="mb-6">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-ink-text">Daily Card</h1>
                {isHistoryMode && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/30">
                    HISTORY MODE
                  </span>
                )}
              </div>
              <p className="text-ink-text/60 text-sm">
                {isHistoryMode
                  ? `Viewing history for ${historyDate}`
                  : new Date().toLocaleDateString(undefined, {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    })}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {isHistoryMode ? (
                <input
                  type="date"
                  value={historyDate}
                  onChange={(e) => setHistoryDate(e.target.value)}
                  className="bg-ink-paper border border-ink-gray text-ink-text rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ink-accent"
                />
              ) : (
                <button
                  onClick={refreshCardOdds}
                  disabled={isRefreshing}
                  className={`px-3 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wide border shadow-sm transition-all ${
                    isRefreshing
                      ? "bg-ink-base text-ink-text/40 border-ink-gray cursor-not-allowed"
                      : "bg-ink-paper text-ink-text border-ink-gray hover:border-ink-text/40"
                  }`}
                >
                  {isRefreshing ? "Refreshing..." : "Refresh Odds"}
                </button>
              )}

              <button
                onClick={toggleHistory}
                className={`px-3 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wide border shadow-sm transition-all flex items-center gap-2 ${
                  isHistoryMode
                    ? "bg-purple-500 text-white border-purple-500"
                    : "bg-ink-paper text-ink-text border-ink-gray hover:bg-ink-base"
                }`}
              >
                <span>📜</span> {isHistoryMode ? "Exit History" : "History"}
              </button>
            </div>
          </div>

          {/* Window Tabs */}
          <div className="mt-4 flex overflow-x-auto space-x-2 pb-2 no-scrollbar">
            {windowCounts.map((window) => (
              <button
                key={window.key}
                onClick={() => setSelectedWindow(window.key)}
                className={`flex items-center gap-2 px-3 py-2 rounded-full whitespace-nowrap transition-all shadow-sm border ${
                  selectedWindow === window.key
                    ? "bg-ink-accent text-white font-bold border-ink-accent shadow-sm"
                    : "bg-ink-paper text-ink-text/70 hover:text-ink-text border-ink-gray"
                }`}
              >
                <span className="text-xs">{window.label}</span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full ${
                    selectedWindow === window.key
                      ? "bg-white/20 text-white"
                      : "bg-ink-base text-ink-text/60 border border-ink-gray"
                  }`}
                >
                  {window.count}
                </span>
              </button>
            ))}
          </div>
        </header>

        {/* --- DESKTOP GRID LAYOUT --- */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT SIDEBAR (Controls & Analytics) */}
          <div className="lg:col-span-4 space-y-6">
            {/* 1. Summary Card */}
            {analyzedGames.length > 0 && (
              <div className="bg-ink-paper rounded-2xl border border-ink-gray shadow-sm p-4">
                <h3 className="text-xs font-bold text-ink-text/40 uppercase mb-3">
                  Summary
                </h3>
                <div className="flex justify-between items-center mb-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-ink-text">
                      {targetCount}
                    </div>
                    <div className="text-[10px] text-ink-text/50 uppercase">
                      Playable
                    </div>
                  </div>
                  <div className="h-8 w-px bg-ink-gray"></div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-ink-text/60">
                      {passed.length}
                    </div>
                    <div className="text-[10px] text-ink-text/50 uppercase">
                      Passed
                    </div>
                  </div>
                  <div className="h-8 w-px bg-ink-gray"></div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-ink-text font-mono">
                      ${analytics.totalWagered.toFixed(0)}
                    </div>
                    <div className="text-[10px] text-ink-text/50 uppercase">
                      Risk
                    </div>
                  </div>
                </div>

                {/* Warnings */}
                {analytics.diversificationWarnings.length > 0 && (
                  <div className="mb-4 space-y-2">
                    {analytics.diversificationWarnings.map((w, i) => (
                      <div
                        key={i}
                        className="text-xs bg-amber-500/10 text-amber-300 p-2 rounded border border-amber-500/20"
                      >
                        ⚠️ {w.title}
                      </div>
                    ))}
                  </div>
                )}

                {!isHistoryMode && playable.length > 0 && (
                  <button
                    onClick={handleSmartPick}
                    className="w-full py-3 bg-ink-accent hover:bg-sky-500 text-white font-bold rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 mb-2"
                  >
                    <span>🎯</span> Generate Smart Card
                  </button>
                )}

                <button
                  onClick={copyToClipboard}
                  className="w-full py-3 bg-ink-base hover:bg-ink-paper border border-ink-gray text-ink-text font-bold rounded-xl shadow-sm transition-all"
                >
                  📋 Copy Card Text
                </button>
              </div>
            )}

            {/* 2. P&L Projections (if applicable) */}
            {!isHistoryMode && totalBankroll > 0 && playable.length >= 2 && (
              <div className="bg-ink-paper rounded-2xl border border-ink-gray shadow-sm overflow-hidden">
                <div className="px-4 py-3 bg-ink-base border-b border-ink-gray flex justify-between items-center">
                  <h3 className="font-bold text-ink-text text-sm">
                    📊 Projected Outcomes
                  </h3>
                </div>
                <div className="p-4 grid grid-cols-2 gap-2">
                  {keyScenarios.slice(0, 4).map((scenario) => (
                    <div
                      key={scenario.record}
                      className={`p-2 rounded-lg text-center ${
                        scenario.netPL > 0
                          ? "bg-status-win/10"
                          : scenario.isBreakEven
                            ? "bg-amber-500/10"
                            : "bg-status-loss/10"
                      }`}
                    >
                      <div className="text-[10px] text-ink-text/60">
                        {scenario.record}
                      </div>
                      <div
                        className={`font-bold font-mono text-sm ${scenario.netPL > 0 ? "text-status-win" : scenario.isBreakEven ? "text-amber-500" : "text-status-loss"}`}
                      >
                        {scenario.netPL >= 0 ? "+" : ""}
                        {scenario.netPL.toFixed(0)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 3. Discipline Quote */}
            <div className="text-center text-ink-text/40 text-xs italic p-4">
              "Passing is profitable."
            </div>
          </div>

          {/* RIGHT MAIN CONTENT (Lists) */}
          <div className="lg:col-span-8 space-y-6">
            {/* Discipline Warning */}
            {!isHistoryMode && overLimit && (
              <div className="p-4 bg-status-loss/10 border border-status-loss/30 rounded-2xl flex items-start gap-3">
                <span className="text-2xl">⚠️</span>
                <div>
                  <div className="font-bold text-status-loss">
                    DISCIPLINE WARNING
                  </div>
                  <p className="text-status-loss text-sm mt-1">
                    You have {playableCount} playable games but the limit is{" "}
                    {MAX_DAILY_PLAYS}. Stick to your best spots.
                  </p>
                </div>
              </div>
            )}

            {/* Loading State */}
            {isLoadingHistory && (
              <div className="py-20 text-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-ink-accent mx-auto mb-4"></div>
                <p className="text-ink-text/60">
                  Fetching history from database...
                </p>
              </div>
            )}

            {/* Empty State */}
            {!isLoadingHistory && analyzedGames.length === 0 && (
              <div className="text-center py-20 bg-ink-paper rounded-2xl border border-ink-gray shadow-sm">
                <p className="text-ink-text/60">
                  {isHistoryMode
                    ? `No data found for ${historyDate}`
                    : "No analyses completed yet."}
                </p>
                {!isHistoryMode && (
                  <p className="text-ink-text/50 text-sm mt-2">
                    Add games from Scout → Upload lines → Run analysis
                  </p>
                )}
              </div>
            )}

            {/* PLAYABLE GAMES */}
            {playable.length > 0 && (
              <section>
                <h2 className="text-ink-accent font-bold text-sm uppercase tracking-wider mb-3 flex items-center">
                  <span className="mr-2">✅</span> Playable ({playable.length})
                </h2>
                <div className="space-y-3">
                  {playableInDisplayOrder.map((g) => (
                    <PlayableCard
                      key={g.id}
                      game={g}
                      dim={hasAutoPicked && !g.cardSlot}
                      onLogBet={onLogBet}
                      kellyFraction={kellyFraction}
                      onKellyFractionChange={setKellyFraction}
                      bankrollForCard={bankrollForCard}
                      funding={playableAllocations.find(
                        (a) => a.gameId === g.id,
                      )}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* PASSED GAMES */}
            {passed.length > 0 && (
              <section>
                <h2 className="text-ink-text/60 font-bold text-sm uppercase tracking-wider mb-3 flex items-center">
                  <span className="mr-2">⛔</span> Passed ({passed.length})
                </h2>
                <div className="space-y-3">
                  {passed.map((g) => (
                    <PassedCard key={g.id} game={g} />
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const PlayableCard: React.FC<{
  game: QueuedGame;
  dim?: boolean;
  onLogBet: (draft: DraftBet) => void;
  kellyFraction: number;
  onKellyFractionChange: (value: number) => void;
  bankrollForCard: number;
  funding?: {
    gameId: string;
    wagerUnits: number;
    wagerAmount: number;
    isWagerCalculated: boolean;
    displayBook: string;
    displayRecLine: string;
    usedAlt: boolean;
    isCapped: boolean;
    availableBalance: number | null;
    overrideBook?: string;
    overrideOdds?: number;
  };
}> = ({
  game,
  dim,
  onLogBet,
  kellyFraction,
  onKellyFractionChange,
  bankrollForCard,
  funding,
}) => {
  if (!game.analysis) return null; // Defensive check
  const a = game.analysis;

  const hasCaution = !!a.caution;
  const hasFactConfidence = !!a.factConfidence;
  const isFactConfidenceHigh = a.factConfidence === "HIGH";
  const slot = game.cardSlot;
  const pickLabel =
    a.pick ||
    (a.recommendation && a.recommendation.length > 4
      ? a.recommendation
      : undefined);

  // Quality indicator for smart pick
  const linePoints = a.lineValuePoints || 0;
  const juiceCents = a.lineValueCents || 0;

  // UPDATED: Use shared utility
  const isPremium = isPremiumEdge(
    linePoints,
    juiceCents,
    a.confidence,
    game.sport,
    a.market,
  );

  const displayBook = funding?.displayBook || a.softBestBook;
  const displayRecLine = funding?.displayRecLine || a.recLine;

  const winProbPercent = a.recProbability ?? a.trueProbability ?? 0;
  const winProb = winProbPercent > 0 ? winProbPercent / 100 : 0;
  const oddsForKelly = parseAmericanOdds(
    displayRecLine || a.recLine,
    funding?.overrideOdds,
  );
  const kellyRaw =
    bankrollForCard > 0 && oddsForKelly !== null && winProb > 0
      ? calculateKellyWager(bankrollForCard, oddsForKelly, winProb, kellyFraction)
      : 0;
  const kellyCapped =
    funding?.availableBalance !== null && funding?.availableBalance !== undefined
      ? Math.min(kellyRaw, funding.availableBalance)
      : kellyRaw;
  const isKellyCapped =
    funding?.availableBalance !== null &&
    funding?.availableBalance !== undefined &&
    kellyRaw > funding.availableBalance;

  const handleLogClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  const suggestedWager =
      kellyCapped > 0 ? kellyCapped : 0;
  const draft = mapQueuedGameToDraftBet(game, {
      wager: suggestedWager,
      recLineOverride: displayRecLine,
      marketOverride: a.market,
    });

    if (funding?.overrideBook) draft.sportsbook = funding.overrideBook;
    if (funding?.overrideOdds !== undefined) draft.odds = funding.overrideOdds;

    onLogBet(draft);
  };

  return (
    <div
      className={`p-4 rounded-2xl shadow-sm relative transition-all border border-l-4 ${
        dim ? "opacity-50" : ""
      } ${slot ? "ring-1 ring-ink-accent" : ""} ${
        hasCaution
          ? "bg-ink-paper text-ink-text border-amber-500/40 border-l-amber-400"
          : "bg-ink-paper text-ink-text border-ink-gray border-l-ink-accent"
      } ${hasFactConfidence && !isFactConfidenceHigh ? "opacity-80" : ""}`}
    >
      {/* SLOT BADGE */}
      <div className="flex justify-between items-start mb-2">
        <span className="text-xs font-bold uppercase text-ink-text/60">
          {game.sport}
        </span>
        <div className="flex items-center gap-2">
          {/* Edge Quality Badge */}
          {(linePoints > 0 || juiceCents > 0) && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-ink-base text-ink-text/80 border border-ink-gray">
              {linePoints > 0 && `+${linePoints}pts`}
              {linePoints > 0 && juiceCents > 0 && " "}
              {juiceCents > 0 && `+${juiceCents}¢`}
            </span>
          )}
          {a.recProbability !== undefined && a.recProbability > 0 && (
            <span className="text-xs font-mono px-2 py-1 rounded-full bg-ink-base text-ink-text/80 border border-ink-gray">
              Fair: {a.recProbability.toFixed(1)}%
            </span>
          )}
        </div>
      </div>

      {/* THE PICK - BIG AND BOLD */}
      {pickLabel && (
        <div className="mb-4">
          <div className="flex justify-between items-start">
            <div className="text-2xl font-bold leading-tight">
              {pickLabel}{" "}
              <span className="text-ink-text/80">{displayRecLine}</span>
            </div>
            <button
              onClick={handleLogClick}
              className={`ml-4 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-tighter border transition-all active:scale-95 ${
                hasCaution
                  ? "bg-amber-500/10 text-amber-200 border-amber-500/40 hover:bg-amber-500/20"
                  : "bg-ink-accent text-white border-ink-accent hover:bg-sky-500"
              }`}
            >
              Log Bet 📊
            </button>
          </div>

          <div className="flex items-center gap-2 mt-1">
            <div className="text-sm flex items-center gap-1 text-ink-text/70">
              @ {displayBook}
              {funding?.usedAlt && (
                <span
                  className="bg-ink-base text-ink-text text-[9px] font-bold px-1.5 py-0.5 rounded border border-ink-gray ml-1"
                  title="Original book had insufficient funds"
                >
                  ↱ Swapped (Funds)
                </span>
              )}
            </div>
            {funding?.isCapped && (
              <div className="flex items-center gap-1 flex-wrap">
                <span className="bg-status-loss/10 text-status-loss text-[10px] font-bold px-1.5 py-0.5 rounded border border-status-loss/30">
                  Capped: ${funding.availableBalance?.toFixed(2)}
                </span>
              </div>
            )}
          </div>

          {/* Line Threshold Info (NEW) */}
          {(a.lineFloor || a.oddsFloor) && (
            <div className="flex items-center gap-2 text-xs mt-2 text-ink-text/70">
              <span>📉</span>
              <span>
                {/* Clean display for ML vs Spread */}
                {a.market === "Moneyline" ? (
                  <>
                    Still good to: <strong>{a.oddsFloor}</strong>
                  </>
                ) : (
                  <>
                    Still good to: <strong>{a.lineFloor}</strong> at{" "}
                    <strong>{a.oddsFloor}</strong>
                  </>
                )}
              </span>
            </div>
          )}
        </div>
      )}

      {/* KELLY RECOMMENDATION */}
      <div className="flex items-center justify-between p-3 rounded-xl mb-4 bg-ink-base border border-ink-gray">
        <div>
          <div className="text-[10px] uppercase font-bold tracking-wider text-ink-text/60">
            Kelly Suggestion
          </div>
          {kellyCapped > 0 ? (
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold font-mono">
                ${kellyCapped.toFixed(2)}
              </span>
              <span className="text-xs text-ink-text/70">
                {winProbPercent.toFixed(1)}%
              </span>
            </div>
          ) : (
            <div className="text-xs italic text-ink-text/50">
              No win prob or odds
            </div>
          )}
          {isKellyCapped && (
            <div className="text-[10px] text-amber-400 mt-1">
              Capped to {displayBook} balance
            </div>
          )}
        </div>
        <div className="text-right">
          <label className="text-[10px] uppercase font-bold tracking-wider text-ink-text/60 block mb-1">
            Multiplier
          </label>
          <select
            value={kellyFraction}
            onChange={(e) => onKellyFractionChange(Number(e.target.value))}
            className="bg-ink-paper border border-ink-gray rounded-lg px-2 py-1 text-xs font-mono text-ink-text focus:border-ink-accent outline-none"
          >
            <option value={0.25}>1/4 Kelly</option>
            <option value={0.5}>1/2 Kelly</option>
            <option value={1}>Full Kelly</option>
          </select>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase font-bold tracking-wider text-ink-text/60">
            Edge Strength
          </div>
          <div className="font-bold">{a.confidence || "MEDIUM"}</div>
        </div>
      </div>

      {/* Matchup context */}
      <div className="text-sm mb-3 text-ink-text/70">
        {game.awayTeam.name} @ {game.homeTeam.name}
      </div>

      {/* Line Value Badge */}
      {a.lineValueCents !== undefined && a.lineValueCents > 0 && (
        <div className="inline-block text-xs px-3 py-1 rounded-full mb-3 bg-ink-base text-ink-text/80 border border-ink-gray">
          +{a.lineValueCents}¢ vs sharp
        </div>
      )}

      {a.edgeNarrative && (
        <div className="text-sm mb-3 italic text-ink-text/70">
          "{a.edgeNarrative}"
        </div>
      )}

      <details className="text-xs border-t pt-2 text-ink-text/70 border-ink-gray">
        <summary className="cursor-pointer font-medium hover:text-ink-text">
          Research Summary
        </summary>
        <div className="mt-2 p-2 rounded-xl whitespace-pre-wrap bg-ink-base text-ink-text/70 border border-ink-gray">
          {a.researchSummary}
        </div>
      </details>
    </div>
  );
};

const PassedCard: React.FC<{ game: QueuedGame }> = ({ game }) => {
  const a = game.analysis!;

  return (
    <div className="p-4 rounded-2xl border border-ink-gray bg-ink-paper shadow-sm">
      <div className="flex justify-between items-start mb-2">
        <span className="text-xs font-bold text-ink-text/60 uppercase">
          {game.sport}
        </span>
        {a.vetoTriggered && (
          <span className="text-xs bg-status-loss/10 text-status-loss px-2 py-1 rounded-full font-medium border border-status-loss/30">
            VETO
          </span>
        )}
      </div>

      {a.factConfidence && (
        <div
          className={`mb-2 inline-flex px-2 py-1 rounded-lg text-[10px] font-bold uppercase border ${getFactConfidenceStyle(a.factConfidence)}`}
        >
          Fact Confidence: {a.factConfidence}
        </div>
      )}

      <div className="font-bold text-ink-text mb-2">
        {game.awayTeam.name} @ {game.homeTeam.name}
      </div>

      {a.vetoReason && (
        <div className="text-xs text-status-loss mb-2">{a.vetoReason}</div>
      )}

      <details className="text-xs text-ink-text/60">
        <summary className="cursor-pointer hover:text-ink-text">
          Research Summary
        </summary>
        <div className="mt-2 p-2 bg-ink-base rounded-xl whitespace-pre-wrap text-ink-text/60 border border-ink-gray">
          {a.researchSummary}
        </div>
      </details>
    </div>
  );
};
