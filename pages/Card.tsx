
import React, { useState } from 'react';
import { useGameContext } from '../hooks/useGameContext';
import { HighHitAnalysis, QueuedGame, SportsbookAccount, AutoPickResult, BookLines } from '../types';
import { MAX_DAILY_PLAYS } from '../constants';
import { analyzeCard, CardAnalytics, DiversificationWarning, PLScenario } from '../utils/cardAnalytics';
import { useToast, createToastHelpers } from '../components/Toast';
import StickyCardSummary from '../components/StickyCardSummary';
import { isPremiumEdge } from '../utils/edgeUtils';
import { mapQueuedGameToDraftBet, DraftBet } from '../types/draftBet';
import { refreshAnalysisMathOnly } from '../services/geminiService';
import { fetchOddsForGame, getBookmakerLines, SOFT_BOOK_KEYS } from '../services/oddsService';

type AlternativeBook = { bookName: string; odds: string; line?: string };
type AvailableBalanceLookup = (bookName: string) => number | null;

const parseNumber = (value?: string) => {
  if (!value) return null;
  const parsed = parseFloat(value.replace(/^[ou]/i, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeBookName = (name: string) => name.trim().toLowerCase();

const findMatchingAccount = (bookName: string, bankroll: SportsbookAccount[]) => {
  const target = normalizeBookName(bookName);
  return bankroll.find(b => {
    const name = normalizeBookName(b.name);
    return name.includes(target) || target.includes(name);
  }) || null;
};

// Helper: Find alternative book with funds and acceptable line/odds floors
const getAlternativeBook = (
  game: QueuedGame, 
  analysis: HighHitAnalysis, 
  wagerAmount: number,
  getAvailableBalance: AvailableBalanceLookup
): AlternativeBook | null => {
  const { market, side, lineFloor, oddsFloor } = analysis;
  const currentBook = analysis.softBestBook;

  const floorLineVal = parseNumber(lineFloor);
  const floorOddsVal = parseNumber(oddsFloor);
  
  const candidates: Array<AlternativeBook & { lineScore: number; oddsVal: number }> = [];

  game.softLines.forEach(book => {
    if (book.bookName === currentBook) return;
    const available = getAvailableBalance(book.bookName);
    if (available === null || available < wagerAmount) return;

    let odds = '';
    let line: string | undefined;
    let lineOk = true;

    if (market === 'Moneyline') {
      odds = side === 'AWAY' ? book.mlOddsA : book.mlOddsB;
    } else if (market === 'Spread') {
      line = side === 'AWAY' ? book.spreadLineA : book.spreadLineB;
      odds = side === 'AWAY' ? book.spreadOddsA : book.spreadOddsB;
      const lineVal = parseNumber(line);
      lineOk = floorLineVal === null || (lineVal !== null && lineVal >= floorLineVal);
    } else if (market === 'Total') {
      line = book.totalLine;
      odds = side === 'OVER' ? book.totalOddsOver : book.totalOddsUnder;
      const lineVal = parseNumber(line);
      if (floorLineVal !== null && lineVal !== null) {
        lineOk = side === 'OVER' ? lineVal <= floorLineVal : lineVal >= floorLineVal;
      }
    }

    const oddsVal = parseNumber(odds);
    if (!odds || odds === 'N/A' || oddsVal === null || !lineOk) return;

    if (floorOddsVal !== null && oddsVal < floorOddsVal) return;

    const lineVal = line ? parseNumber(line) : null;
    let lineScore = 0;
    if (lineVal !== null && floorLineVal !== null) {
      if (market === 'Total' && side === 'OVER') {
        lineScore = floorLineVal - lineVal;
      } else {
        lineScore = lineVal - floorLineVal;
      }
    }

    candidates.push({ bookName: book.bookName, odds, line, lineScore, oddsVal });
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
  if (confidence === 'HIGH') return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30';
  if (confidence === 'MEDIUM') return 'bg-amber-500/10 text-amber-300 border-amber-500/30';
  if (confidence === 'LOW') return 'bg-status-loss/10 text-status-loss border-status-loss/30';
  return 'bg-ink-base text-ink-text/50 border-ink-gray';
};

export default function Card({ onLogBet }: { onLogBet: (draft: DraftBet) => void }) {
  const { queue, getPlayableCount, autoPickBestGames, totalBankroll, unitSizePercent, bankroll, updateGame, activeBookNames } = useGameContext();
  const [lastPickResult, setLastPickResult] = useState<AutoPickResult | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Toast
  const { addToast } = useToast();
  const toast = createToastHelpers(addToast);
  
  const analyzedGames = queue.filter(g => g.analysis);
  const playable = analyzedGames.filter(g => g.analysis?.decision === 'PLAYABLE');
  const passed = analyzedGames.filter(g => g.analysis?.decision === 'PASS');
  
  const playableCount = getPlayableCount();
  const overLimit = playableCount > MAX_DAILY_PLAYS;
  
  const hasAutoPicked = queue.some(g => g.cardSlot !== undefined);
  const pickCount = queue.filter(g => g.cardSlot !== undefined).length;
  const playableInDisplayOrder = hasAutoPicked
    ? [...playable].sort((a, b) => (a.cardSlot || 999) - (b.cardSlot || 999))
    : playable;

  // ANALYTICS COMPUTATION
  const analytics = analyzeCard(queue, totalBankroll, unitSizePercent, hasAutoPicked);
  
  // Filter scenarios to show key ones
  const targetCount = hasAutoPicked ? pickCount : playableCount;

  const keyScenarios = analytics.plScenarios.filter(s => {
    if (targetCount <= 3) return true;
    return s.wins === targetCount || 
           s.wins === targetCount - 1 || 
           s.wins === Math.ceil(targetCount * 0.67) || 
           s.isBreakEven || 
           s.wins === Math.floor(targetCount * 0.33) || 
           s.wins === 1 || 
           s.wins === 0;
  });

  const refreshCardOdds = async () => {
    if (isRefreshing) return;
    const targets = queue.filter(g => g.analysis);
    if (targets.length === 0) {
      toast.showInfo("No analyzed games to refresh.");
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

        const pinnacle = getBookmakerLines(data, 'pinnacle');
        if (!pinnacle) {
          failed += 1;
          continue;
        }

        const matchedSoftLines: BookLines[] = [];
        SOFT_BOOK_KEYS.forEach(key => {
          const lines = getBookmakerLines(data, key);
          if (!lines) return;
          const displayName = lines.bookName;
          const isActiveBook = activeBookNames.some(name =>
            name.toLowerCase().includes(displayName.toLowerCase()) ||
            displayName.toLowerCase().includes(name.toLowerCase())
          );
          if (isActiveBook) matchedSoftLines.push(lines);
        });

        if (matchedSoftLines.length === 0) {
          failed += 1;
          continue;
        }

        const refreshedGame = { ...game, sharpLines: pinnacle, softLines: matchedSoftLines };
        const result = refreshAnalysisMathOnly(refreshedGame);

        updateGame(game.id, { sharpLines: pinnacle, softLines: matchedSoftLines, analysis: result, analysisError: undefined });
        updated += 1;
        if (result.decision === 'PLAYABLE') playableUpdated += 1;
        else passedUpdated += 1;
      } catch (error) {
        console.error("Card refresh failed for game:", game.id, error);
        failed += 1;
      }
    }

    if (updated > 0) {
      const failureNote = failed > 0 ? ` (${failed} failed)` : '';
      toast.showSuccess(`Odds refreshed: ${updated} updated — ${playableUpdated} playable, ${passedUpdated} passed${failureNote}`);
    } else {
      toast.showWarning("No games refreshed. Check your active books or try again later.");
    }

    setIsRefreshing(false);
  };

  const playableAllocations = (() => {
    const remainingByAccount = new Map<string, number>();
    bankroll.forEach(acc => {
      remainingByAccount.set(normalizeBookName(acc.name), acc.balance);
    });

    const getAvailableBalance: AvailableBalanceLookup = (bookName: string) => {
      const acc = findMatchingAccount(bookName, bankroll);
      if (!acc) return null;
      const key = normalizeBookName(acc.name);
      return remainingByAccount.has(key) ? remainingByAccount.get(key)! : acc.balance;
    };

    const reserveBalance = (bookName: string, amount: number) => {
      const acc = findMatchingAccount(bookName, bankroll);
      if (!acc) return;
      const key = normalizeBookName(acc.name);
      const current = remainingByAccount.get(key);
      if (current === undefined) return;
      remainingByAccount.set(key, Math.max(0, current - amount));
    };

    const oneUnit = (totalBankroll * unitSizePercent) / 100;

    return playableInDisplayOrder.map(game => {
      const analysis = game.analysis!;
      const isWagerCalculated = totalBankroll > 0;
      let wagerUnits = 1.0;
      if (analysis.confidence === 'HIGH') wagerUnits = 1.5;
      if (analysis.confidence === 'LOW') wagerUnits = 0.5;
      const baseWagerAmount = oneUnit * wagerUnits;

      let selectedBook = analysis.softBestBook || '';
      let selectedAlt: AlternativeBook | null = null;
      let usedAlt = false;

      if (isWagerCalculated && selectedBook) {
        const recBalance = getAvailableBalance(selectedBook);
        const hasFullFunds = recBalance !== null && recBalance >= baseWagerAmount;
        if (!hasFullFunds) {
          const altFull = getAlternativeBook(game, analysis, baseWagerAmount, getAvailableBalance);
          if (altFull) {
            selectedAlt = altFull;
            selectedBook = altFull.bookName;
            usedAlt = true;
          } else if (recBalance === null || recBalance <= 0) {
            const altPartial = getAlternativeBook(game, analysis, 0.01, getAvailableBalance);
            if (altPartial) {
              selectedAlt = altPartial;
              selectedBook = altPartial.bookName;
              usedAlt = true;
            }
          }
        }
      }

      const availableBalance = isWagerCalculated ? getAvailableBalance(selectedBook) : null;
      const isCapped = isWagerCalculated && availableBalance !== null && availableBalance < baseWagerAmount;
      const wagerAmount = isCapped ? Math.max(0, availableBalance) : baseWagerAmount;
      const effectiveWagerUnits = isWagerCalculated && oneUnit > 0
        ? Math.round((wagerAmount / oneUnit) * 100) / 100
        : wagerUnits;

      if (isWagerCalculated && availableBalance !== null) {
        reserveBalance(selectedBook, wagerAmount);
      }

      let displayRecLine = analysis.recLine || '';
      if (usedAlt && selectedAlt) {
        if (analysis.market === 'Moneyline') {
          displayRecLine = selectedAlt.odds;
        } else {
          const altLine = selectedAlt.line || analysis.line;
          displayRecLine = altLine ? `${altLine} (${selectedAlt.odds})` : selectedAlt.odds;
        }
      }

      const overrideOdds = usedAlt && selectedAlt ? parseFloat(selectedAlt.odds) : undefined;

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
    const result = autoPickBestGames();
    setLastPickResult(result);
    
    if (result.picked === 0) {
      toast.showWarning("No picks met quality thresholds");
    } else if (result.skipped > 0) {
      toast.showSuccess(`Smart Card: ${result.picked} quality picks (${result.skipped} skipped)`);
    } else {
      toast.showSuccess(`Smart Card: ${result.picked} picks`);
    }
  };

  const generateClipboardText = () => {
    const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    let output = `EDGELAB v3 — DAILY CARD\n${dateStr}\n${'='.repeat(35)}\n\n`;

    // If auto-picked, sort by slot
    const sortedPlayable = hasAutoPicked 
      ? [...playable].sort((a, b) => (a.cardSlot || 999) - (b.cardSlot || 999))
      : playable;

    if (sortedPlayable.length > 0) {
      output += `✅ PLAYABLE (No Vetoes Triggered)\n`;
      sortedPlayable.forEach(g => {
        const a = g.analysis!;
        if (g.cardSlot) output += `[SLOT #${g.cardSlot}] `;
        
      output += `\n${g.sport}: ${g.awayTeam.name} @ ${g.homeTeam.name}\n`;
      output += `Sharp Fair Prob: ${a.sharpImpliedProb?.toFixed(1) || 'N/A'}%\n`;
        const pickLabel = a.pick || (a.recommendation && a.recommendation.length > 4 ? a.recommendation : undefined);
        if (pickLabel) {
           output += `PICK: ${pickLabel} ${a.recLine} @ ${a.softBestBook}\n`;
        }
        if (a.lineValueCents && a.lineValueCents > 0) {
          output += `Line Value: +${a.lineValueCents} cents\n`;
        }
        if (a.caution) {
          output += `WARNING: ${a.caution}\n`;
        }
        // Add floor to copy text
        if (a.lineFloor || a.oddsFloor) {
            output += `Still Good To: ${a.lineFloor || 'ML'} ${a.oddsFloor || ''}\n`;
        }
        output += `Edge: ${a.edgeNarrative || 'No specific edge identified'}\n`;
      });
    } else {
      output += `✅ PLAYABLE: None\n`;
    }

    output += `\n⛔ PASSED: ${passed.length} games (vetoes triggered or no edge)\n`;
    output += `\n${'='.repeat(35)}\n`;
    output += `DISCIPLINE > ACTION\n`;
    output += `Passing is profitable.`;
    
    return output;
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generateClipboardText());
    toast.showSuccess("Daily Card copied to clipboard!");
  };

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="max-w-lg mx-auto pb-24">
        <header className="mb-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-ink-text mb-1">Daily Card</h1>
              <p className="text-ink-text/60 text-sm">
                {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
            </div>
            <button
              onClick={refreshCardOdds}
              disabled={isRefreshing}
              className={`px-3 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wide border shadow-sm transition-all ${
                isRefreshing
                  ? 'bg-ink-base text-ink-text/40 border-ink-gray cursor-not-allowed'
                  : 'bg-ink-paper text-ink-text border-ink-gray hover:border-ink-text/40'
              }`}
              title="Refresh lines and re-check each pick"
            >
              {isRefreshing ? 'Refreshing...' : 'Refresh Odds'}
            </button>
          </div>
        </header>

        {/* Sticky Summary */}
        <StickyCardSummary 
          pickCount={pickCount}
          playableCount={playableCount}
          passedCount={passed.length}
          analytics={analytics}
          hasAutoPicked={hasAutoPicked}
        />
        
        {/* Smart Pick Section */}
        {playable.length > 0 && (
          <div className="mb-6 bg-ink-paper p-4 rounded-xl border border-ink-gray shadow-sm">
              <div className="flex justify-between items-center mb-3">
                  <div>
                    <span className="font-bold text-ink-text text-sm">Smart Pick</span>
                    <p className="text-[10px] text-ink-text/50 mt-0.5">
                      Only picks with real mathematical edge
                    </p>
                  </div>
                  <span className="text-xs font-bold bg-ink-base text-ink-text/60 px-2 py-1 rounded">
                    {playable.length} playable
                  </span>
              </div>
              
              <button
                  onClick={handleSmartPick}
                  className="w-full py-3 bg-ink-accent hover:bg-sky-500 text-white font-bold rounded-xl shadow-sm transition-all flex items-center justify-center gap-2"
              >
                  <span>🎯</span> Generate Smart Card
              </button>
              
              <p className="text-center text-[10px] text-ink-text/50 mt-2">
                  Requires: +0.5 pts, +15¢ juice, or HIGH confidence
              </p>
              
              {/* Show last pick result if skipped any */}
              {lastPickResult && lastPickResult.skipped > 0 && (
                <details className="mt-3 text-xs">
                  <summary className="text-amber-300 font-medium cursor-pointer hover:text-amber-200">
                    {lastPickResult.skipped} playable skipped (no edge)
                  </summary>
                  <div className="mt-2 p-2 bg-amber-500/10 rounded-lg text-amber-200 space-y-1 border border-amber-500/20">
                    {lastPickResult.reasons.map((reason, idx) => (
                      <div key={idx}>• {reason}</div>
                    ))}
                  </div>
                </details>
              )}
          </div>
        )}

        {/* DISCIPLINE WARNING */}
        {overLimit && (
          <div className="mb-6 p-4 bg-status-loss/10 border border-status-loss/30 rounded-2xl">
            <div className="flex items-center text-status-loss font-bold mb-2">
              <span className="text-xl mr-2">⚠️</span>
              DISCIPLINE WARNING
            </div>
            <p className="text-status-loss text-sm">
              You have {playableCount} playable games but the framework limits you to {MAX_DAILY_PLAYS} per day.
              Choose your best {MAX_DAILY_PLAYS} based on line value, not gut feel.
            </p>
          </div>
        )}

        {analyzedGames.length === 0 ? (
          <div className="text-center py-20 bg-ink-paper rounded-2xl border border-ink-gray shadow-sm">
            <p className="text-ink-text/60">No analyses completed yet.</p>
            <p className="text-ink-text/50 text-sm mt-2">Add games from Scout → Upload lines → Run analysis</p>
          </div>
        ) : (
          <>
            {/* Decision Support Ribbon */}
            {playable.length >= 2 && totalBankroll > 0 && (
              <div className="mb-6 space-y-4">
                
                {/* P&L Projection */}
                <div className="bg-ink-paper rounded-2xl border border-ink-gray shadow-sm overflow-hidden">
                  <div className="px-4 py-3 bg-ink-base border-b border-ink-gray">
                    <div className="flex justify-between items-center">
                      <h3 className="font-bold text-ink-text text-sm flex items-center gap-2">
                        <span>📊</span> Projected Outcomes
                      </h3>
                      <span className="text-xs text-ink-text/60">
                        {hasAutoPicked ? `${targetCount} picks` : `${playable.length} playable`}
                      </span>
                    </div>
                  </div>
                  
                  <div className="p-4">
                    {/* Total at Risk */}
                    <div className="flex justify-between items-center mb-4 pb-3 border-b border-ink-gray">
                      <span className="text-xs text-ink-text/70 uppercase font-bold tracking-wide">Total Wagered</span>
                      <span className="font-bold text-ink-text font-mono">${analytics.totalWagered.toFixed(2)}</span>
                    </div>
                    
                    {/* Scenario Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {keyScenarios.map(scenario => (
                        <div 
                          key={scenario.record}
                          className={`p-3 rounded-xl text-center ${
                            scenario.netPL > 0 
                              ? 'bg-status-win/10 border border-status-win/20' 
                              : scenario.isBreakEven
                                ? 'bg-amber-500/10 border border-amber-500/20'
                                : 'bg-status-loss/10 border border-status-loss/20'
                          }`}
                        >
                          <div className="text-xs text-ink-text/60 font-medium mb-1">{scenario.record}</div>
                          <div className={`font-bold font-mono ${scenario.netPL > 0 ? 'text-status-win' : scenario.isBreakEven ? 'text-amber-500' : 'text-status-loss'}`}>
                            {scenario.netPL >= 0 ? '+' : ''}{scenario.netPL.toFixed(2)}
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    {/* Quick Summary */}
                    <div className="mt-4 pt-3 border-t border-ink-gray flex justify-between text-xs">
                      <div>
                        <span className="text-ink-text/60">Best case: </span>
                        <span className="font-bold text-status-win">+${analytics.maxProfit.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-ink-text/60">Worst case: </span>
                        <span className="font-bold text-status-loss">${analytics.maxLoss.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Diversification Warnings */}
                {analytics.diversificationWarnings.length > 0 && (
                  <div className="bg-amber-900/20 rounded-2xl border border-amber-700/30 overflow-hidden">
                    <div className="px-4 py-3 bg-amber-900/30 border-b border-amber-700/30">
                      <h3 className="font-bold text-amber-500 text-sm flex items-center gap-2">
                        <span>⚠️</span> Concentration Alerts
                      </h3>
                    </div>
                    
                    <div className="p-4 space-y-3">
                      {analytics.diversificationWarnings.map((warning, idx) => (
                        <div key={idx} className="flex items-start gap-3">
                          <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                            warning.severity === 'WARNING' ? 'bg-status-loss' :
                            warning.severity === 'CAUTION' ? 'bg-amber-500' : 'bg-ink-gray'
                          }`} />
                          <div>
                            <div className="font-bold text-amber-500 text-sm">{warning.title}</div>
                            <div className="text-amber-400/80 text-xs mt-0.5">{warning.message}</div>
                            <div className="text-amber-500/50 text-[10px] mt-1 font-mono">{warning.breakdown}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className={`p-4 rounded-2xl border shadow-sm ${
                overLimit 
                  ? 'bg-status-loss/10 border-status-loss/30' 
                  : 'bg-ink-paper border-ink-gray'
              }`}>
                <div className={`text-3xl font-bold ${overLimit ? 'text-status-loss' : 'text-ink-accent'}`}>
                  {playableCount}
                </div>
                <div className="text-[10px] uppercase text-ink-text/60 font-bold tracking-wider mt-1">
                  Playable / {MAX_DAILY_PLAYS} Max
                </div>
              </div>
              <div className="bg-ink-paper border border-ink-gray p-4 rounded-2xl shadow-sm">
                <div className="text-3xl font-bold text-ink-text/60">{passed.length}</div>
                <div className="text-[10px] uppercase text-ink-text/60 font-bold tracking-wider mt-1">Passed</div>
              </div>
            </div>

            {/* Playable Games */}
            {playable.length > 0 && (
              <section className="mb-6">
                <h2 className="text-ink-accent font-bold text-sm uppercase tracking-wider mb-3 flex items-center">
                  <span className="mr-2">✅</span> Playable (Your Decision)
                </h2>
                <div className="space-y-3">
                  {playableInDisplayOrder.map(g => (
                      <PlayableCard
                        key={g.id}
                        game={g}
                        dim={hasAutoPicked && !g.cardSlot}
                        onLogBet={onLogBet}
                        funding={playableAllocations.find(a => a.gameId === g.id)}
                      />
                  ))}
                </div>
              </section>
            )}

            {/* Passed Games */}
            {passed.length > 0 && (
              <section>
                <h2 className="text-ink-text/60 font-bold text-sm uppercase tracking-wider mb-3 flex items-center">
                  <span className="mr-2">⛔</span> Passed (Veto Triggered)
                </h2>
                <div className="space-y-3">
                  {passed.map(g => (
                    <PassedCard key={g.id} game={g} />
                  ))}
                </div>
              </section>
            )}

            <button 
              onClick={copyToClipboard}
              className="w-full mt-8 bg-ink-base hover:bg-ink-paper border border-ink-gray text-ink-text font-bold py-4 rounded-2xl shadow-sm transition-all"
            >
              📋 Copy Daily Card
            </button>

            {/* Philosophy Reminder */}
            <div className="mt-6 text-center text-ink-text/60 text-xs">
              <p>EdgeLab v3 — Discipline Edition</p>
              <p className="mt-1 italic">"Passing is profitable."</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const PlayableCard: React.FC<{ game: QueuedGame; dim?: boolean; onLogBet: (draft: DraftBet) => void; funding?: {
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
} }> = ({ game, dim, onLogBet, funding }) => {
  
  if (!game.analysis) return null; // Defensive check
  const a = game.analysis;
  
  const hasCaution = !!a.caution;
  const hasFactConfidence = !!a.factConfidence;
  const isFactConfidenceHigh = a.factConfidence === 'HIGH';
  const slot = game.cardSlot;
  const pickLabel = a.pick || (a.recommendation && a.recommendation.length > 4 ? a.recommendation : undefined);

  const wagerUnits = funding?.wagerUnits ?? 1.0;
  const wagerAmount = funding?.wagerAmount ?? 0;
  const isWagerCalculated = funding?.isWagerCalculated ?? false;

  // Quality indicator for smart pick
  const linePoints = a.lineValuePoints || 0;
  const juiceCents = a.lineValueCents || 0;
  
  // UPDATED: Use shared utility
  const isPremium = isPremiumEdge(linePoints, juiceCents, a.confidence, game.sport, a.market);

  const displayBook = funding?.displayBook || a.softBestBook;
  const displayRecLine = funding?.displayRecLine || a.recLine;

  const handleLogClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const draft = mapQueuedGameToDraftBet(game, wagerAmount);
    
    if (funding?.overrideBook) draft.sportsbook = funding.overrideBook;
    if (funding?.overrideOdds !== undefined) draft.odds = funding.overrideOdds;
    
    onLogBet(draft);
  };

  return (
    <div className={`p-4 rounded-2xl shadow-sm relative transition-all border border-l-4 ${
      dim ? 'opacity-50' : ''
    } ${
      slot 
        ? 'ring-1 ring-ink-accent' 
        : ''
    } ${
      hasCaution 
        ? 'bg-ink-paper text-ink-text border-amber-500/40 border-l-amber-400' 
        : 'bg-ink-paper text-ink-text border-ink-gray border-l-ink-accent'
    } ${hasFactConfidence && !isFactConfidenceHigh ? 'opacity-80' : ''}`}>
      {/* SLOT BADGE */}
      <div className="flex justify-between items-start mb-2">
        <span className="text-xs font-bold uppercase text-ink-text/60">{game.sport}</span>
        <div className="flex items-center gap-2">
          {/* Edge Quality Badge */}
          {(linePoints > 0 || juiceCents > 0) && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-ink-base text-ink-text/80 border border-ink-gray">
              {linePoints > 0 && `+${linePoints}pts`}
              {linePoints > 0 && juiceCents > 0 && ' '}
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
                {pickLabel} <span className="text-ink-text/80">{displayRecLine}</span>
            </div>
            <button 
                onClick={handleLogClick}
                className={`ml-4 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-tighter border transition-all active:scale-95 ${
                    hasCaution 
                    ? 'bg-amber-500/10 text-amber-200 border-amber-500/40 hover:bg-amber-500/20' 
                    : 'bg-ink-accent text-white border-ink-accent hover:bg-sky-500'
                }`}
            >
                Log Bet 📊
            </button>
          </div>
          
          <div className="flex items-center gap-2 mt-1">
             <div className="text-sm flex items-center gap-1 text-ink-text/70">
                @ {displayBook}
                {funding?.usedAlt && (
                    <span className="bg-ink-base text-ink-text text-[9px] font-bold px-1.5 py-0.5 rounded border border-ink-gray ml-1" title="Original book had insufficient funds">
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
                {a.market === 'Moneyline' 
                  ? <>Still good to: <strong>{a.oddsFloor}</strong></>
                  : <>Still good to: <strong>{a.lineFloor}</strong> at <strong>{a.oddsFloor}</strong></>
                }
                </span>
            </div>
          )}
        </div>
      )}

      {/* WAGER RECOMMENDATION BAR */}
      <div className="flex items-center justify-between p-3 rounded-xl mb-4 bg-ink-base border border-ink-gray">
        <div>
            <div className="text-[10px] uppercase font-bold tracking-wider text-ink-text/60">
                Recommended Wager
            </div>
            {isWagerCalculated ? (
                <div className="flex items-baseline gap-1">
                    <span className="text-xl font-bold font-mono">${wagerAmount.toFixed(2)}</span>
                    <span className="text-xs text-ink-text/70">({wagerUnits}u)</span>
                </div>
            ) : (
                <div className="text-xs italic text-ink-text/50">Set bankroll to see calc</div>
            )}
        </div>
        <div className="text-right">
             <div className="text-[10px] uppercase font-bold tracking-wider text-ink-text/60">
                Edge Strength
            </div>
            <div className="font-bold">{a.confidence || 'MEDIUM'}</div>
        </div>
      </div>
      
      {/* Matchup context */}
      <div className="text-sm mb-3 text-ink-text/70">
        {game.awayTeam.name} @ {game.homeTeam.name}
      </div>
      
      {/* Line Value Badge */}
      {(a.lineValueCents !== undefined && a.lineValueCents > 0) && (
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
        <summary className="cursor-pointer font-medium hover:text-ink-text">Research Summary</summary>
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
        <span className="text-xs font-bold text-ink-text/60 uppercase">{game.sport}</span>
        {a.vetoTriggered && (
          <span className="text-xs bg-status-loss/10 text-status-loss px-2 py-1 rounded-full font-medium border border-status-loss/30">
            VETO
          </span>
        )}
      </div>

      {a.factConfidence && (
        <div className={`mb-2 inline-flex px-2 py-1 rounded-lg text-[10px] font-bold uppercase border ${getFactConfidenceStyle(a.factConfidence)}`}>
          Fact Confidence: {a.factConfidence}
        </div>
      )}
      
      <div className="font-bold text-ink-text mb-2">
        {game.awayTeam.name} @ {game.homeTeam.name}
      </div>
      
      {a.vetoReason && (
        <div className="text-xs text-status-loss mb-2">
          {a.vetoReason}
        </div>
      )}
      
      <details className="text-xs text-ink-text/60">
        <summary className="cursor-pointer hover:text-ink-text">Research Summary</summary>
        <div className="mt-2 p-2 bg-ink-base rounded-xl whitespace-pre-wrap text-ink-text/60 border border-ink-gray">
          {a.researchSummary}
        </div>
      </details>
    </div>
  );
};
