import React, { useState } from 'react';
import { useGameContext } from '../hooks/useGameContext';
import { HighHitAnalysis, QueuedGame, SportsbookAccount, AutoPickResult } from '../types';
import { MAX_DAILY_PLAYS } from '../constants';
import { analyzeCard, CardAnalytics, DiversificationWarning, PLScenario } from '../utils/cardAnalytics';
import { useToast, createToastHelpers } from '../components/Toast';
import StickyCardSummary from '../components/StickyCardSummary';

// Helper: Find alternative book with funds
const getAlternativeBook = (
  game: QueuedGame, 
  analysis: HighHitAnalysis, 
  bankroll: SportsbookAccount[], 
  wagerAmount: number
) => {
  const { market, side, line: targetLine } = analysis;
  const currentBook = analysis.softBestBook;
  
  // Helper to check balance
  const hasFunds = (bookName: string) => {
    const acc = bankroll.find(b => 
      b.name.toLowerCase().includes(bookName.toLowerCase()) || 
      bookName.toLowerCase().includes(b.name.toLowerCase())
    );
    return acc && acc.balance >= wagerAmount;
  };

  const candidates: { bookName: string, odds: string }[] = [];

  game.softLines.forEach(book => {
    // Skip the current book (the one with low balance)
    if (book.bookName === currentBook) return;
    
    // Skip if we don't have funds here either
    if (!hasFunds(book.bookName)) return;

    let odds = '';
    let valid = false;

    if (market === 'Moneyline') {
      odds = side === 'AWAY' ? book.mlOddsA : book.mlOddsB;
      valid = odds && odds !== 'N/A';
    } else if (market === 'Spread') {
      const line = side === 'AWAY' ? book.spreadLineA : book.spreadLineB;
      const price = side === 'AWAY' ? book.spreadOddsA : book.spreadOddsB;
      // Exact line match required for safety
      if (line === targetLine && price && price !== 'N/A') {
        odds = price;
        valid = true;
      }
    } else if (market === 'Total') {
      const line = book.totalLine;
      const price = side === 'OVER' ? book.totalOddsOver : book.totalOddsUnder;
      // Target line usually comes as string "212.5" or "o212.5" depending on context, 
      // but analysis.line is set from softBestLine which is usually just the number for totals or "o6.5" for props.
      // In oddsService, totalLine is just number string "6.5".
      // Let's assume loose matching or exact string match.
      if (line === targetLine && price && price !== 'N/A') {
        odds = price;
        valid = true;
      }
    }

    if (valid) {
      candidates.push({ bookName: book.bookName, odds });
    }
  });

  // Sort by best odds (American odds numeric sort: higher is better)
  candidates.sort((a, b) => parseFloat(b.odds) - parseFloat(a.odds));

  return candidates.length > 0 ? candidates[0] : null;
};

export default function Card() {
  const { queue, getPlayableCount, autoPickBestGames, totalBankroll, unitSizePercent } = useGameContext();
  const [lastPickResult, setLastPickResult] = useState<AutoPickResult | null>(null);
  
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
        if (a.recommendation) {
           output += `PICK: ${a.recommendation} ${a.recLine} @ ${a.softBestBook}\n`;
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
          <h1 className="text-2xl font-bold text-slate-800 mb-1">Daily Card</h1>
          <p className="text-slate-400 text-sm">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
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
          <div className="mb-6 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex justify-between items-center mb-3">
                  <div>
                    <span className="font-bold text-slate-700 text-sm">Smart Pick</span>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Only picks with real mathematical edge
                    </p>
                  </div>
                  <span className="text-xs font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded">
                    {playable.length} playable
                  </span>
              </div>
              
              <button
                  onClick={handleSmartPick}
                  className="w-full py-3 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
              >
                  <span>🎯</span> Generate Smart Card
              </button>
              
              <p className="text-center text-[10px] text-slate-400 mt-2">
                  Requires: +0.5 pts, +15¢ juice, or HIGH confidence
              </p>
              
              {/* Show last pick result if skipped any */}
              {lastPickResult && lastPickResult.skipped > 0 && (
                <details className="mt-3 text-xs">
                  <summary className="text-amber-600 font-medium cursor-pointer hover:text-amber-700">
                    {lastPickResult.skipped} playable skipped (no edge)
                  </summary>
                  <div className="mt-2 p-2 bg-amber-50 rounded-lg text-amber-700 space-y-1">
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
          <div className="mb-6 p-4 bg-coral-50 border border-coral-200 rounded-2xl">
            <div className="flex items-center text-coral-600 font-bold mb-2">
              <span className="text-xl mr-2">⚠️</span>
              DISCIPLINE WARNING
            </div>
            <p className="text-coral-600 text-sm">
              You have {playableCount} playable games but the framework limits you to {MAX_DAILY_PLAYS} per day.
              Choose your best {MAX_DAILY_PLAYS} based on line value, not gut feel.
            </p>
          </div>
        )}

        {analyzedGames.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm">
            <p className="text-slate-400">No analyses completed yet.</p>
            <p className="text-slate-300 text-sm mt-2">Add games from Scout → Upload lines → Run analysis</p>
          </div>
        ) : (
          <>
            {/* Decision Support Ribbon */}
            {playable.length >= 2 && totalBankroll > 0 && (
              <div className="mb-6 space-y-4">
                
                {/* P&L Projection */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                    <div className="flex justify-between items-center">
                      <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2">
                        <span>📊</span> Projected Outcomes
                      </h3>
                      <span className="text-xs text-slate-400">
                        {hasAutoPicked ? `${targetCount} picks` : `${playable.length} playable`}
                      </span>
                    </div>
                  </div>
                  
                  <div className="p-4">
                    {/* Total at Risk */}
                    <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-100">
                      <span className="text-xs text-slate-500 uppercase font-bold tracking-wide">Total Wagered</span>
                      <span className="font-bold text-slate-800 font-mono">${analytics.totalWagered.toFixed(2)}</span>
                    </div>
                    
                    {/* Scenario Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {keyScenarios.map(scenario => (
                        <div 
                          key={scenario.record}
                          className={`p-3 rounded-xl text-center ${
                            scenario.netPL > 0 
                              ? 'bg-emerald-50 border border-emerald-100' 
                              : scenario.isBreakEven
                                ? 'bg-amber-50 border border-amber-100'
                                : 'bg-red-50 border border-red-100'
                          }`}
                        >
                          <div className="text-xs text-slate-500 font-medium mb-1">{scenario.record}</div>
                          <div className={`font-bold font-mono ${scenario.color}`}>
                            {scenario.netPL >= 0 ? '+' : ''}{scenario.netPL.toFixed(2)}
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    {/* Quick Summary */}
                    <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between text-xs">
                      <div>
                        <span className="text-slate-400">Best case: </span>
                        <span className="font-bold text-emerald-600">+${analytics.maxProfit.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Worst case: </span>
                        <span className="font-bold text-red-600">${analytics.maxLoss.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Diversification Warnings */}
                {analytics.diversificationWarnings.length > 0 && (
                  <div className="bg-amber-50 rounded-2xl border border-amber-200 overflow-hidden">
                    <div className="px-4 py-3 bg-amber-100/50 border-b border-amber-200">
                      <h3 className="font-bold text-amber-800 text-sm flex items-center gap-2">
                        <span>⚠️</span> Concentration Alerts
                      </h3>
                    </div>
                    
                    <div className="p-4 space-y-3">
                      {analytics.diversificationWarnings.map((warning, idx) => (
                        <div key={idx} className="flex items-start gap-3">
                          <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                            warning.severity === 'WARNING' ? 'bg-red-500' :
                            warning.severity === 'CAUTION' ? 'bg-amber-500' : 'bg-slate-400'
                          }`} />
                          <div>
                            <div className="font-bold text-amber-900 text-sm">{warning.title}</div>
                            <div className="text-amber-700 text-xs mt-0.5">{warning.message}</div>
                            <div className="text-amber-600/70 text-[10px] mt-1 font-mono">{warning.breakdown}</div>
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
                  ? 'bg-coral-50 border-coral-200' 
                  : 'bg-gradient-to-br from-teal-50 to-emerald-50 border-teal-200'
              }`}>
                <div className={`text-3xl font-bold ${overLimit ? 'text-coral-500' : 'text-teal-500'}`}>
                  {playableCount}
                </div>
                <div className="text-[10px] uppercase text-slate-500 font-bold tracking-wider mt-1">
                  Playable / {MAX_DAILY_PLAYS} Max
                </div>
              </div>
              <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
                <div className="text-3xl font-bold text-slate-400">{passed.length}</div>
                <div className="text-[10px] uppercase text-slate-400 font-bold tracking-wider mt-1">Passed</div>
              </div>
            </div>

            {/* Playable Games */}
            {playable.length > 0 && (
              <section className="mb-6">
                <h2 className="text-teal-600 font-bold text-sm uppercase tracking-wider mb-3 flex items-center">
                  <span className="mr-2">✅</span> Playable (Your Decision)
                </h2>
                <div className="space-y-3">
                  {playable
                    // If auto-picked, sort slots first
                    .sort((a, b) => {
                       if (!hasAutoPicked) return 0;
                       // Slotted items first, sorted by slot number
                       const slotA = a.cardSlot || 999;
                       const slotB = b.cardSlot || 999;
                       return slotA - slotB;
                    })
                    .map(g => (
                      <PlayableCard key={g.id} game={g} dim={hasAutoPicked && !g.cardSlot} />
                  ))}
                </div>
              </section>
            )}

            {/* Passed Games */}
            {passed.length > 0 && (
              <section>
                <h2 className="text-slate-400 font-bold text-sm uppercase tracking-wider mb-3 flex items-center">
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
              className="w-full mt-8 bg-gradient-to-r from-slate-700 to-slate-800 hover:from-slate-800 hover:to-slate-900 text-white font-bold py-4 rounded-2xl shadow-lg transition-all hover:shadow-xl"
            >
              📋 Copy Daily Card
            </button>

            {/* Philosophy Reminder */}
            <div className="mt-6 text-center text-slate-400 text-xs">
              <p>EdgeLab v3 — Discipline Edition</p>
              <p className="mt-1 italic">"Passing is profitable."</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const PlayableCard: React.FC<{ game: QueuedGame; dim?: boolean }> = ({ game, dim }) => {
  const { totalBankroll, unitSizePercent, bankroll } = useGameContext();
  
  if (!game.analysis) return null; // Defensive check
  const a = game.analysis;
  
  const hasCaution = !!a.caution;
  const slot = game.cardSlot;

  // Wager Calculation
  const oneUnit = (totalBankroll * unitSizePercent) / 100;
  let wagerUnits = 1.0;
  if (a.confidence === 'HIGH') wagerUnits = 1.5; // Bump to 1.5u or 2u for high confidence
  if (a.confidence === 'LOW') wagerUnits = 0.5;

  const wagerAmount = oneUnit * wagerUnits;
  const isWagerCalculated = totalBankroll > 0;

  // Book Balance Check
  const recBookName = a.softBestBook || '';
  // Normalize book names for check (e.g. "FanDuel" vs "fanduel")
  const bookAccount = bankroll.find(b => b.name.toLowerCase().includes(recBookName.toLowerCase()) || recBookName.toLowerCase().includes(b.name.toLowerCase()));
  const bookBalance = bookAccount?.balance || 0;
  const insufficientFunds = isWagerCalculated && bookBalance < wagerAmount;

  let altBook = null;
  if (insufficientFunds) {
    altBook = getAlternativeBook(game, a, bankroll, wagerAmount);
  }

  // Quality indicator for smart pick
  const linePoints = a.lineValuePoints || 0;
  const juiceCents = a.lineValueCents || 0;
  const isPremium = linePoints >= 0.5 || juiceCents >= 15 || a.confidence === 'HIGH';

  return (
    <div className={`p-4 rounded-2xl shadow-lg relative transition-all ${
      dim ? 'opacity-40 grayscale-[50%]' : ''
    } ${
      slot 
        ? 'border-4 border-amber-400' 
        : ''
    } ${
      hasCaution 
        ? 'bg-gradient-to-br from-amber-400 to-yellow-500 text-slate-800' 
        : 'bg-gradient-to-br from-teal-500 to-emerald-500 text-white'
    }`}>
      {/* SLOT BADGE */}
      {slot && (
        <div className="absolute -top-3 -right-2 bg-amber-400 text-amber-900 border-2 border-white shadow-md font-black italic px-3 py-1 rounded-full text-xs z-10 flex items-center gap-1">
          {isPremium && <span>⭐</span>}
          SLOT #{slot}
        </div>
      )}

      {/* Add caution banner at top if exists */}
      {a.caution && (
        <div className={`mb-3 p-2 rounded-lg text-xs font-medium ${
          hasCaution ? 'bg-amber-600/20 text-amber-900' : ''
        }`}>
          {a.caution}
        </div>
      )}

      <div className="flex justify-between items-start mb-2">
        <span className={`text-xs font-bold uppercase ${hasCaution ? 'text-slate-700' : 'text-white/70'}`}>{game.sport}</span>
        <div className="flex items-center gap-2">
          {/* Edge Quality Badge */}
          {(linePoints > 0 || juiceCents > 0) && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              hasCaution ? 'bg-white/40 text-slate-900' : 'bg-white/20'
            }`}>
              {linePoints > 0 && `+${linePoints}pts`}
              {linePoints > 0 && juiceCents > 0 && ' '}
              {juiceCents > 0 && `+${juiceCents}¢`}
            </span>
          )}
          {a.recProbability !== undefined && a.recProbability > 0 && (
            <span className={`text-xs font-mono px-2 py-1 rounded-full ${hasCaution ? 'bg-white/40 text-slate-900' : 'bg-white/20'}`}>
              Fair: {a.recProbability.toFixed(1)}%
            </span>
          )}
        </div>
      </div>
      
      {/* THE PICK - BIG AND BOLD */}
      {a.recommendation && (
        <div className="mb-4">
          <div className="text-2xl font-bold leading-tight">
            {a.recommendation} <span className={hasCaution ? 'text-slate-900' : 'text-white/90'}>{a.recLine}</span>
          </div>
          
          <div className="flex items-center gap-2 mt-1">
             <div className={`text-sm ${hasCaution ? 'text-slate-700' : 'text-white/70'}`}>
                @ {a.softBestBook}
             </div>
             {insufficientFunds && (
                <div className="flex items-center gap-1 flex-wrap">
                    <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                        Low Bal: ${bookBalance.toFixed(2)}
                    </span>
                    {altBook && (
                        <span className="bg-indigo-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 shadow-sm border border-white/20">
                            <span>↪ Try {altBook.bookName} ({altBook.odds})</span>
                        </span>
                    )}
                </div>
             )}
          </div>

          {/* Line Threshold Info (NEW) */}
          {(a.lineFloor || a.oddsFloor) && (
            <div className={`flex items-center gap-2 text-xs mt-2 ${hasCaution ? 'text-slate-800/80' : 'text-white/80'}`}>
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
      <div className={`flex items-center justify-between p-3 rounded-xl mb-4 ${hasCaution ? 'bg-white/30' : 'bg-black/20'}`}>
        <div>
            <div className={`text-[10px] uppercase font-bold tracking-wider ${hasCaution ? 'text-slate-800 opacity-60' : 'text-white/60'}`}>
                Recommended Wager
            </div>
            {isWagerCalculated ? (
                <div className="flex items-baseline gap-1">
                    <span className="text-xl font-bold font-mono">${wagerAmount.toFixed(2)}</span>
                    <span className={`text-xs ${hasCaution ? 'text-slate-800' : 'text-white/80'}`}>({wagerUnits}u)</span>
                </div>
            ) : (
                <div className="text-xs italic opacity-70">Set bankroll to see calc</div>
            )}
        </div>
        <div className="text-right">
             <div className={`text-[10px] uppercase font-bold tracking-wider ${hasCaution ? 'text-slate-800 opacity-60' : 'text-white/60'}`}>
                Edge Strength
            </div>
            <div className="font-bold">{a.confidence || 'MEDIUM'}</div>
        </div>
      </div>
      
      {/* Matchup context */}
      <div className={`text-sm mb-3 ${hasCaution ? 'text-slate-700' : 'text-white/60'}`}>
        {game.awayTeam.name} @ {game.homeTeam.name}
      </div>
      
      {/* Line Value Badge */}
      {(a.lineValueCents !== undefined && a.lineValueCents > 0) && (
        <div className={`inline-block text-xs px-3 py-1 rounded-full mb-3 ${hasCaution ? 'bg-white/30 text-slate-900' : 'bg-white/20 text-white'}`}>
          +{a.lineValueCents}¢ vs sharp
        </div>
      )}
      
      {a.edgeNarrative && (
        <div className={`text-sm mb-3 italic ${hasCaution ? 'text-slate-800' : 'text-white/80'}`}>
          "{a.edgeNarrative}"
        </div>
      )}
      
      <details className={`text-xs border-t pt-2 ${hasCaution ? 'text-slate-700 border-slate-800/20' : 'text-white/70 border-white/20'}`}>
        <summary className={`cursor-pointer font-medium ${hasCaution ? 'hover:text-slate-900' : 'hover:text-white'}`}>Research Summary</summary>
        <div className={`mt-2 p-2 rounded-xl whitespace-pre-wrap ${hasCaution ? 'bg-white/20 text-slate-800' : 'bg-white/10'}`}>
          {a.researchSummary}
        </div>
      </details>
    </div>
  );
};

const PassedCard: React.FC<{ game: QueuedGame }> = ({ game }) => {
  const a = game.analysis!;
  
  return (
    <div className="p-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex justify-between items-start mb-2">
        <span className="text-xs font-bold text-slate-400 uppercase">{game.sport}</span>
        {a.vetoTriggered && (
          <span className="text-xs bg-coral-100 text-coral-600 px-2 py-1 rounded-full font-medium">
            VETO
          </span>
        )}
      </div>
      
      <div className="font-bold text-slate-600 mb-2">
        {game.awayTeam.name} @ {game.homeTeam.name}
      </div>
      
      {a.vetoReason && (
        <div className="text-xs text-coral-500 mb-2">
          {a.vetoReason}
        </div>
      )}
      
      <details className="text-xs text-slate-400">
        <summary className="cursor-pointer hover:text-slate-600">Research Summary</summary>
        <div className="mt-2 p-2 bg-slate-50 rounded-xl whitespace-pre-wrap text-slate-500">
          {a.researchSummary}
        </div>
      </details>
    </div>
  );
};