import React from 'react';
import { useGameContext } from '../hooks/useGameContext';
import { HighHitAnalysis, QueuedGame } from '../types';

export default function Card() {
  const { queue } = useGameContext();
  
  const analyzedGames = queue.filter(g => g.analysis);
  const primaries = analyzedGames.filter(g => g.analysis?.decision === 'PRIMARY');
  const leans = analyzedGames.filter(g => g.analysis?.decision === 'LEAN');
  const passes = analyzedGames.filter(g => g.analysis?.decision === 'PASS');

  const generateClipboardText = () => {
    const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    let output = `HIGH-HIT SPORTS DAILY CARD\n${dateStr}\n${'='.repeat(30)}\n\n`;

    if (primaries.length > 0) {
      output += `🎯 PRIMARY PLAYS (1.0u)\n`;
      primaries.forEach(g => {
        const a = g.analysis!;
        const details = a.side && a.line ? `${a.side} ${a.line} (${a.odds})` : (a.side || 'Details in analysis');
        output += `${g.sport} | ${a.market || 'Bet'} | ${details} @ ${a.book || 'Book'}\n`;
        output += `Win Prob: ${a.winProbability}%\n\n`;
      });
    }

    if (leans.length > 0) {
      output += `📊 LEANS (0.5u)\n`;
      leans.forEach(g => {
        const a = g.analysis!;
        const details = a.side && a.line ? `${a.side} ${a.line} (${a.odds})` : (a.side || 'Details in analysis');
        output += `${g.sport} | ${a.market || 'Bet'} | ${details} @ ${a.book || 'Book'}\n`;
        output += `Win Prob: ${a.winProbability}%\n\n`;
      });
    }

    output += `\n⏸️ PASS: ${passes.length} games analyzed.\n`;
    output += `\n${'='.repeat(30)}\nDiscipline > Action.`;
    return output;
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generateClipboardText());
    alert("Daily Card copied to clipboard!");
  };

  return (
    <div className="p-4 max-w-lg mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">Daily Card</h1>
        <p className="text-slate-500 text-sm">
          {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </header>

      {analyzedGames.length === 0 ? (
        <div className="text-center py-20 bg-slate-900 rounded-xl border border-slate-800">
          <p className="text-slate-500">No analyses completed yet.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 mb-6">
             <div className="bg-amber-900/20 border border-amber-500/30 p-3 rounded-lg text-center">
               <div className="text-xl font-bold text-amber-500">{primaries.length}</div>
               <div className="text-[10px] uppercase text-amber-500/80 font-bold tracking-wider">Primary</div>
             </div>
             <div className="bg-yellow-900/20 border border-yellow-500/30 p-3 rounded-lg text-center">
               <div className="text-xl font-bold text-yellow-500">{leans.length}</div>
               <div className="text-[10px] uppercase text-yellow-500/80 font-bold tracking-wider">Lean</div>
             </div>
             <div className="bg-slate-800 border border-slate-700 p-3 rounded-lg text-center">
               <div className="text-xl font-bold text-slate-400">{passes.length}</div>
               <div className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">Pass</div>
             </div>
          </div>

          <div className="space-y-6">
            {/* Primaries */}
            {primaries.length > 0 && (
              <section>
                <h2 className="text-amber-500 font-bold text-sm uppercase tracking-wider mb-3 flex items-center">
                  <span className="mr-2">🎯</span> Primary Plays (1.0u)
                </h2>
                <div className="space-y-3">
                  {primaries.map(g => (
                    <AnalysisResultCard key={g.id} game={g} type="PRIMARY" />
                  ))}
                </div>
              </section>
            )}

            {/* Leans */}
            {leans.length > 0 && (
              <section>
                <h2 className="text-yellow-500 font-bold text-sm uppercase tracking-wider mb-3 flex items-center">
                  <span className="mr-2">📊</span> Leans (0.5u)
                </h2>
                <div className="space-y-3">
                  {leans.map(g => (
                    <AnalysisResultCard key={g.id} game={g} type="LEAN" />
                  ))}
                </div>
              </section>
            )}

            {/* Passes */}
            {passes.length > 0 && (
              <section>
                <h2 className="text-slate-500 font-bold text-sm uppercase tracking-wider mb-3 flex items-center">
                  <span className="mr-2">⏸️</span> Passed
                </h2>
                <div className="space-y-3">
                  {passes.map(g => (
                    <AnalysisResultCard key={g.id} game={g} type="PASS" />
                  ))}
                </div>
              </section>
            )}
          </div>

          <button 
            onClick={copyToClipboard}
            className="w-full mt-8 bg-slate-800 hover:bg-slate-700 text-white font-bold py-4 rounded-xl border border-slate-700 shadow-lg transition-all"
          >
            📋 Copy Daily Card to Clipboard
          </button>
        </>
      )}
    </div>
  );
}

const AnalysisResultCard: React.FC<{ game: QueuedGame, type: 'PRIMARY' | 'LEAN' | 'PASS' }> = ({ game, type }) => {
  const a = game.analysis as HighHitAnalysis;
  
  let colorClass = 'border-slate-700 bg-slate-800';
  let textClass = 'text-slate-400';
  
  if (type === 'PRIMARY') {
    colorClass = 'border-amber-500/50 bg-amber-950/20';
    textClass = 'text-amber-500';
  } else if (type === 'LEAN') {
    colorClass = 'border-yellow-500/50 bg-yellow-950/20';
    textClass = 'text-yellow-500';
  }

  // Fallback: If 'side' parsed as undefined, default to a generic "See Analysis" or the team names if available
  const displaySide = a.side || `${game.awayTeam.name} @ ${game.homeTeam.name}`;

  return (
    <div className={`p-4 rounded-xl border ${colorClass} relative overflow-hidden flex flex-col`}>
      <div className="flex justify-between items-start mb-2">
        <span className="text-xs font-bold text-slate-400 uppercase">{game.sport}</span>
        {a.winProbability && (
          <span className={`text-xs font-bold ${textClass} px-2 py-1 bg-black/20 rounded`}>
            {a.winProbability}% Win Prob
          </span>
        )}
      </div>
      
      {/* Title */}
      <div className="font-bold text-white text-lg mb-1">
        {type === 'PASS' 
          ? `${game.awayTeam.name} @ ${game.homeTeam.name}` 
          : <span>{displaySide} <span className={`${textClass}`}>{a.line || ''}</span></span>
        }
      </div>
      
      {/* Odds Subtitle (only for plays) */}
      {type !== 'PASS' && (a.odds || a.book) && (
        <div className="text-xs text-slate-400 mb-3 flex items-center space-x-2">
          <span>{a.odds || 'Odds N/A'}</span>
          <span>•</span>
          <span>{a.book || 'Book N/A'}</span>
        </div>
      )}
      
      {/* Scrollable Analysis */}
      <div className="text-xs text-slate-300 leading-relaxed border-t border-slate-800/50 pt-2 mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap">
        {a.fullAnalysis}
      </div>
    </div>
  );
}
