import React, { useState, useEffect } from "react";

import { Sport, Game, BookLines } from "../types";
import { SPORTS_CONFIG } from "../constants";
import {
  getBookmakerLines,
  fetchAllSportsOdds,
} from "../services/oddsService";
import { quickScanGame } from "../services/geminiService";
import { useGameContext } from "../hooks/useGameContext";
import { useToast, createToastHelpers } from "../components/Toast";
import ScoutGameCard from "../components/ScoutGameCard";
import {
  TIME_WINDOW_FILTERS,
  TimeWindowFilter,
  getTimeWindowLabel,
  isInTimeWindow,
} from "../utils/timeWindow";
import { 
  getCadenceStatus, 
  isScanWindowActive, 
  SPORT_CADENCE_OFFSETS 
} from "../utils/cadence";

export default function Scout() {
  // Fixed: Use local date string to match user's day, not UTC (which is tomorrow in evenings)
  const [selectedDate, setSelectedDate] = useState(() =>
    new Date().toLocaleDateString("en-CA"),
  );
  const [loading, setLoading] = useState(false);
  const [selectedWindow, setSelectedWindow] = useState<TimeWindowFilter>("ALL");

  // Toast Context
  const { addToast } = useToast();
  const toast = createToastHelpers(addToast);

  // Use Context for Data Persistence
  const {
    addToQueue,
    addAllToQueue,
    queue,
    scanResults,
    setScanResult,
    clearScanResults,
    referenceLines,
    setReferenceLine,
    allSportsData,
    loadSlates,
  } = useGameContext();

  const [scanningIds, setScanningIds] = useState<Set<string>>(new Set());
  const [batchScanning, setBatchScanning] = useState(false);
  const [progressText, setProgressText] = useState("");

  const slatesLoaded = Object.keys(allSportsData).length > 0;

  const handleLoadSlates = async () => {
    setLoading(true);
    try {
      const allData = await fetchAllSportsOdds();
      loadSlates(allData); // Save to Context & LocalStorage
      toast.showSuccess(
        `Loaded slates for ${Object.keys(allData).length} sports`,
      );
    } catch (e) {
      console.error("Failed to load slates:", e);
      toast.showError("Failed to load slates. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    try {
      const allData = await fetchAllSportsOdds(true); // Force refresh to check for movement
      loadSlates(allData);
      toast.showSuccess("Refreshed slates & Checked for movement");
    } catch (e) {
      console.error("Refresh failed:", e);
      toast.showError("Failed to refresh slates");
    }
  };

  const getGamesForSport = (sport: Sport) => {
    if (!slatesLoaded || !allSportsData[sport]) return [];
    return allSportsData[sport]
      .filter((g: any) => {
        const gameDate = new Date(g.commence_time).toLocaleDateString("en-CA");
        return gameDate === selectedDate;
      })
      .map((g: any) => ({ ...g, _sport: sport }));
  };

  const allGames = Object.keys(SPORTS_CONFIG).flatMap((sportKey) =>
    getGamesForSport(sportKey as Sport),
  );

  // Synchronize reference lines when new games are loaded
  useEffect(() => {
    if (slatesLoaded) {
      allGames.forEach((g) => {
        if (!referenceLines[g.id]) {
          const pinn = getBookmakerLines(g, "pinnacle");
          if (pinn) {
            setReferenceLine(g.id, {
              spreadLineA: pinn.spreadLineA,
              spreadLineB: pinn.spreadLineB,
            });
          }
        }
      });
    }
  }, [allGames, slatesLoaded, referenceLines]);

  const mapToGameObject = (
    apiGame: any,
    sport: Sport,
    pinnLines: BookLines | null,
  ): Game => {
    return {
      id: apiGame.id,
      sport,
      date: apiGame.commence_time,
      status: "Scheduled",
      homeTeam: { name: apiGame.home_team },
      awayTeam: { name: apiGame.away_team },
      odds: pinnLines
        ? {
            details: `${pinnLines.spreadLineA} / ${pinnLines.spreadLineB}`,
            spread: pinnLines.spreadLineA,
            total: parseFloat(pinnLines.totalLine) || undefined,
          }
        : undefined,
    };
  };

  const handleQuickScan = async (game: Game) => {
    if (scanningIds.has(game.id)) return;
    setScanningIds((prev) => new Set(prev).add(game.id));
    const result = await quickScanGame(game);
    setScanResult(game.id, result);
    if ((result.signal === "RED" || result.signal === "YELLOW") && !isInQueue(game.id)) {
      const gameWithScan = {
        ...game,
        edgeSignal: result.signal,
        edgeDescription: result.description,
        autoAnalyze: true,
      };
      addToQueue(gameWithScan);
      toast.showSuccess(
        `Auto-added ${game.awayTeam.name} vs ${game.homeTeam.name} to Queue`,
      );
    }
    setScanningIds((prev) => {
      const next = new Set(prev);
      next.delete(game.id);
      return next;
    });
  };

  const isUpcomingGame = (apiGame: any) => {
    const startTime = new Date(apiGame.commence_time).getTime();
    return Number.isFinite(startTime) && startTime > Date.now();
  };

  // --- DERIVED STATE ---
  const upcomingGames = allGames.filter(isUpcomingGame);
  const filteredGames = upcomingGames.filter((g) =>
    isInTimeWindow(g.commence_time, selectedWindow),
  );

  // Filter games that are actually in a scan window (First, Second, Lock)
  const gamesReadyToScan = filteredGames.filter((g) => {
    if (scanResults[g.id]) return false;
    const sport = (g._sport as Sport) || "NBA";
    return isScanWindowActive(getCadenceStatus(g.commence_time, sport));
  });

  const unscannedGames = filteredGames.filter((g) => !scanResults[g.id]);

  const sortBySignal = (games: any[]) =>
    [...games].sort((a, b) => getSignalWeight(b.id) - getSignalWeight(a.id));
  
  const windowCounts = TIME_WINDOW_FILTERS.map((window) => ({
    ...window,
    count: upcomingGames.filter((g) =>
      isInTimeWindow(g.commence_time, window.key),
    ).length,
  }));

  // Count how many valid scanned games can be added
  const scannedCount = filteredGames.filter(isEligibleScannedGame).length;
  const windowAddCount = filteredGames.filter((g) => !isInQueue(g.id)).length;

  // --- HANDLERS ---

  const handleScanAll = async () => {
    setBatchScanning(true);
    
    // Prioritize "Ready" games (in window). If none, fallback to all unscanned in view.
    const gamesToScan = gamesReadyToScan.length > 0 ? gamesReadyToScan : unscannedGames;
    
    let count = 0;

    try {
      if (gamesToScan.length === 0) {
        toast.showInfo(
          `No unscanned games found for ${getTimeWindowLabel(selectedWindow)}`,
        );
        return;
      }

      for (const apiGame of gamesToScan) {
        count++;
        setProgressText(`Scanning ${count}/${gamesToScan.length}...`);
        const sport = (apiGame._sport as Sport) || "NBA";
        const gameObj = mapToGameObject(apiGame, sport, null);
        try {
          const result = await quickScanGame(gameObj);
          setScanResult(apiGame.id, result);
          if (
            (result.signal === "RED" || result.signal === "YELLOW") &&
            !isInQueue(gameObj.id)
          ) {
            const gameWithScan = {
              ...gameObj,
              edgeSignal: result.signal,
              edgeDescription: result.description,
              autoAnalyze: true,
            };
            addToQueue(gameWithScan);
          }
        } catch (e) {
          console.error(e);
        }
        await new Promise((r) => setTimeout(r, 600));
      }
      toast.showSuccess(`Batch scan complete for ${count} games`);
    } finally {
      setBatchScanning(false);
      setProgressText("");
    }
  };

  const handleResetScans = () => {
    const gamesToReset = allGames.filter((g) =>
      isInTimeWindow(g.commence_time, selectedWindow),
    );
    if (gamesToReset.length === 0) return;

    // Only reset if actually scanned
    const idsToReset = gamesToReset
      .filter((g) => scanResults[g.id])
      .map((g) => g.id);

    if (idsToReset.length === 0) {
      toast.showInfo("No scans to reset in this window.");
      return;
    }

    if (
      window.confirm(
        `Reset ${idsToReset.length} scans for ${getTimeWindowLabel(selectedWindow)}?`,
      )
    ) {
      clearScanResults(idsToReset);
      toast.showSuccess(`Reset ${idsToReset.length} scans.`);
    }
  };

  const handleAddToQueue = (
    apiGame: any,
    sport: Sport,
    pinnLines: BookLines | null,
  ) => {
    const game = mapToGameObject(apiGame, sport, pinnLines);
    const scanData = scanResults[game.id];
    const gameWithScan = scanData
      ? {
          ...game,
          edgeSignal: scanData.signal,
          edgeDescription: scanData.description,
        }
      : game;
    addToQueue(gameWithScan);
    toast.showInfo(
      `Added ${game.awayTeam.name} vs ${game.homeTeam.name} to Queue`,
    );
  };

  const handleAddAllScanned = () => {
    const gamesToAdd = allGames.filter(isEligibleScannedGame);
    if (gamesToAdd.length === 0) {
      toast.showInfo("No eligible scanned games to add.");
      return;
    }

    const mappedGames = gamesToAdd.map((game) => {
      const pinnLines = getBookmakerLines(game, "pinnacle");
      const sport = (game._sport as Sport) || "NBA";
      const base = mapToGameObject(game, sport, pinnLines);
      const scanData = scanResults[base.id];
      return scanData
        ? {
            ...base,
            edgeSignal: scanData.signal,
            edgeDescription: scanData.description,
            autoAnalyze: true,
          }
        : base;
    });

    addAllToQueue(mappedGames);
    toast.showSuccess(`Added ${mappedGames.length} scanned games to Queue`);
  };

  const handleAddWindow = () => {
    if (selectedWindow === "ALL") return;
    const gamesToAdd = filteredGames.filter((g) => !isInQueue(g.id));
    if (gamesToAdd.length === 0) {
      toast.showInfo("No games to add for this window.");
      return;
    }

    const mappedGames = gamesToAdd.map((game) => {
      const pinnLines = getBookmakerLines(game, "pinnacle");
      const sport = (game._sport as Sport) || "NBA";
      const base = mapToGameObject(game, sport, pinnLines);
      const scanData = scanResults[base.id];
      return scanData
        ? {
            ...base,
            edgeSignal: scanData.signal,
            edgeDescription: scanData.description,
            autoAnalyze: true,
          }
        : base;
    });

    addAllToQueue(mappedGames);
    const label = getTimeWindowLabel(selectedWindow);
    toast.showSuccess(`Added ${mappedGames.length} ${label} games to Queue`);
  };

  const getMovementAnalysis = (
    currentA: string,
    refA: string,
    homeName: string,
    awayName: string,
  ) => {
    const curr = parseFloat(currentA);
    const ref = parseFloat(refA);
    if (isNaN(curr) || isNaN(ref)) return null;
    if (Math.abs(curr - ref) < 0.1)
      return { icon: "➡️", text: "", color: "text-ink-text/40" };
    if (curr > ref)
      return {
        icon: "⬆️",
        text: `Sharps on ${homeName.split(" ").pop()}`,
        color: "text-ink-accent",
      };
    if (curr < ref)
      return {
        icon: "⬇️",
        text: `Sharps on ${awayName.split(" ").pop()}`,
        color: "text-ink-accent",
      };
    return null;
  };

  const isInQueue = (id: string) => queue.some((g) => g.id === id);
  const getSignalWeight = (id: string) => {
    const s = scanResults[id]?.signal;
    return s === "RED" ? 3 : s === "YELLOW" ? 2 : s === "WHITE" ? 1 : 0;
  };

  const isEligibleScannedGame = (apiGame: any) => {
    const signal = scanResults[apiGame.id]?.signal;
    if (!signal || (signal !== "RED" && signal !== "YELLOW")) return false;
    if (isInQueue(apiGame.id)) return false;
    return isUpcomingGame(apiGame);
  };

  const roundToNearestMinutes = (date: Date, minutes: number) => {
    const ms = minutes * 60 * 1000;
    return new Date(Math.round(date.getTime() / ms) * ms);
  };

  const formatEtTime = (date: Date) => {
    const time = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
    return `${time} ET`;
  };

  const getModeStartTime = (games: any[]) => {
    if (games.length === 0) return null;
    const counts = new Map<number, number>();
    for (const g of games) {
      const start = new Date(g.commence_time);
      if (!Number.isFinite(start.getTime())) continue;
      const rounded = roundToNearestMinutes(start, 30).getTime();
      counts.set(rounded, (counts.get(rounded) || 0) + 1);
    }
    let best: number | null = null;
    let bestCount = 0;
    counts.forEach((count, time) => {
      if (count > bestCount) {
        best = time;
        bestCount = count;
      }
    });
    return best ? new Date(best) : null;
  };

  const getCadenceLabel = (sport: Sport, games: any[]) => {
    const anchor = getModeStartTime(games);
    if (!anchor) return "Cadence unavailable";
    const offsets = SPORT_CADENCE_OFFSETS[sport] || SPORT_CADENCE_OFFSETS.Other;
    const first = new Date(anchor.getTime() - offsets.first * 60 * 1000);
    const second = new Date(anchor.getTime() - offsets.second * 60 * 1000);
    const lock = new Date(anchor.getTime() - offsets.lock * 60 * 1000);
    return `First ${formatEtTime(first)} · Second ${formatEtTime(second)} · Lock ${formatEtTime(lock)}`;
  };

  // If slates are NOT loaded, show the initial state (centered)
  if (!slatesLoaded) {
    return (
      <div className="h-full overflow-y-auto p-4 max-w-lg mx-auto flex flex-col">
        <header className="mb-4 shrink-0">
          <h1 className="text-2xl font-bold text-ink-text mb-4">
            EdgeLab Scout
          </h1>
          <button
            onClick={handleLoadSlates}
            disabled={loading}
            className="w-full mb-4 py-3 bg-ink-accent text-white font-bold rounded-xl shadow-sm hover:bg-sky-500 transition-all disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin">🔄</span> Loading All Slates...
              </span>
            ) : (
              <span>📊 Load Today's Slates</span>
            )}
          </button>
        </header>

        <div className="flex-1 flex flex-col justify-center items-center text-ink-text/60 bg-ink-paper rounded-2xl border border-ink-gray p-8 shadow-sm border-dashed">
          <p className="text-4xl mb-3">📊</p>
          <p className="font-medium text-center">
            Click "Load Today's Slates"
            <br />
            to fetch fresh lines for all sports
          </p>
        </div>
      </div>
    );
  }

  // If slates loaded, show Fixed Header + Pull-to-Refresh List
  return (
    <div className="h-full flex flex-col">
      {/* Fixed Header Section */}
      <div className="shrink-0 p-4 pb-2 max-w-7xl mx-auto w-full">
        <h1 className="text-2xl font-bold text-ink-text mb-4">EdgeLab Scout</h1>

        {/* Date & Scan Controls */}
        <div className="flex gap-2 mb-2">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="flex-1 bg-ink-paper text-ink-text p-3 rounded-xl border border-ink-gray focus:outline-none focus:border-ink-accent focus:ring-2 focus:ring-ink-accent/20 shadow-sm"
          />
          {allGames.length > 0 && (
            <>
              <button
                onClick={handleScanAll}
                disabled={batchScanning}
                className={`flex-1 px-4 rounded-xl font-bold text-sm shadow-sm transition-all whitespace-nowrap ${batchScanning ? "bg-ink-base text-ink-text/40" : "bg-ink-accent hover:bg-sky-500 text-white"}`}
              >
                {batchScanning ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="animate-spin text-xs">⚡</span>{" "}
                    {progressText}
                  </span>
                ) : (
                  gamesReadyToScan.length > 0
                    ? `⚡ Scan Ready (${gamesReadyToScan.length})`
                    : `⚡ Scan All (${unscannedGames.length})`
                )}
              </button>

              <button
                onClick={handleAddAllScanned}
                disabled={scannedCount === 0}
                className={`flex-1 px-4 rounded-xl font-bold text-sm shadow-sm transition-all whitespace-nowrap border ${scannedCount > 0 ? "bg-ink-paper text-ink-accent border-ink-accent hover:bg-ink-accent/10" : "bg-ink-base text-ink-text/40 border-ink-gray"}`}
              >
                + Add Scanned ({scannedCount})
              </button>

              <button
                onClick={handleRefresh}
                disabled={loading || batchScanning}
                className="px-4 bg-ink-paper text-ink-text/70 border border-ink-gray hover:text-ink-text rounded-xl font-bold shadow-sm transition-all text-xl"
                title="Refresh Slates"
              >
                🔄
              </button>
            </>
          )}

          {allGames.length > 0 && selectedWindow !== "ALL" && (
            <button
              onClick={handleResetScans}
              disabled={batchScanning}
              className="px-3 bg-ink-base text-ink-text/40 hover:text-red-400 border border-ink-gray rounded-xl font-bold shadow-sm transition-all"
              title="Reset Scans"
            >
              🗑️
            </button>
          )}
        </div>

        {allGames.length > 0 && (
          <>
            <div className="flex overflow-x-auto space-x-2 pb-2 no-scrollbar mb-2">
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

            {selectedWindow !== "ALL" && (
              <button
                onClick={handleAddWindow}
                disabled={windowAddCount === 0}
                className={`w-full mb-2 py-2 rounded-xl font-bold text-xs shadow-sm transition-all border ${
                  windowAddCount > 0
                    ? "bg-ink-paper text-ink-accent border-ink-accent hover:bg-ink-accent/10"
                    : "bg-ink-base text-ink-text/40 border-ink-gray"
                }`}
              >
                + Add {getTimeWindowLabel(selectedWindow)} Window (
                {windowAddCount})
              </button>
            )}
          </>
        )}
      </div>

      {/* Scrollable List */}
      <div className="flex-1 overflow-y-auto min-h-0 relative">
        <div className="p-4 pt-2 max-w-7xl mx-auto pb-24">
          {loading ? (
            <div className="text-center py-10 text-ink-text/60">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ink-accent mx-auto mb-3"></div>
              Searching lines...
            </div>
          ) : filteredGames.length === 0 ? (
            <div className="text-center py-10 text-ink-text/60 bg-ink-paper rounded-2xl border border-ink-gray">
              No games found for {selectedDate}.
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(SPORTS_CONFIG).map(([sportKey, config]) => {
                const sport = sportKey as Sport;
                const sportGames = sortBySignal(
                  getGamesForSport(sport)
                    .filter(isUpcomingGame)
                    .filter((g) =>
                      isInTimeWindow(g.commence_time, selectedWindow),
                    ),
                );

                if (sportGames.length === 0) return null;

                return (
                  <section key={sportKey}>
                    <div className="flex flex-col gap-1 mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{config.icon}</span>
                        <h2 className="text-lg font-bold text-ink-text">
                          {config.label}
                        </h2>
                      </div>
                      <div className="text-[11px] text-ink-text/60">
                        {getCadenceLabel(sport, sportGames)}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {sportGames.map((game) => {
                        const pinnLines = getBookmakerLines(game, "pinnacle");
                        const ref = referenceLines[game.id];
                        const movement =
                          pinnLines && ref
                            ? getMovementAnalysis(
                                pinnLines.spreadLineA,
                                ref.spreadLineA,
                                game.home_team,
                                game.away_team,
                              )
                            : null;
                        const scan = scanResults[game.id];
                        const isScanning = scanningIds.has(game.id);
                        const inQueue = isInQueue(game.id);

                        return (
                          <ScoutGameCard
                            key={game.id}
                            game={game}
                            sport={sport}
                            pinnLines={pinnLines}
                            referenceLines={ref}
                            scanResult={scan}
                            isScanning={isScanning}
                            isBatchScanning={batchScanning}
                            inQueue={inQueue}
                            movement={movement}
                            onQuickScan={handleQuickScan}
                            onAddToQueue={handleAddToQueue}
                            mapToGameObject={mapToGameObject}
                          />
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}