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
        output += `${g.sport} | ${a.market || 'Bet'} | ${a.side || 'Side'} ${a.line || ''} (${a.odds || ''}) @ ${a.book || 'Book'}\n`;
        output += `Win Prob: ${a.winProbability}%\n\n`;
      });
    }

    if (leans.length > 0) {
      output += `📊 LEANS (0.5u)\n`;
      leans.forEach(g => {
        const a = g.analysis!;
        output += `${g.sport} | ${a.market || 'Bet'} | ${a.side || 'Side'} ${a.line || ''} (${a.odds || ''}) @ ${a.book || 'Book'}\n`;
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
                <div className="space-y-2 opacity-60">
                  {passes.map(g => (
                    <div key={g.id} className="bg-slate-900 p-3 rounded border border-slate-800 flex justify-between items-center">
                      <span className="text-xs text-slate-300 font-bold">{g.awayTeam.name} @ {g.homeTeam.name}</span>
                      <span className="text-xs bg-slate-800 px-2 py-1 rounded text-slate-500">No Edge</span>
                    </div>
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

const AnalysisResultCard: React.FC<{ game: QueuedGame, type: 'PRIMARY' | 'LEAN' }> = ({ game, type }) => {
  const a = game.analysis as HighHitAnalysis;
  const colorClass = type === 'PRIMARY' ? 'border-amber-500/50 bg-amber-950/20' : 'border-yellow-500/50 bg-yellow-950/20';
  const textClass = type === 'PRIMARY' ? 'text-amber-500' : 'text-yellow-500';

  return (
    <div className={`p-4 rounded-xl border ${colorClass} relative overflow-hidden`}>
      <div className="flex justify-between items-start mb-2">
        <span className="text-xs font-bold text-slate-400 uppercase">{game.sport}</span>
        <span className={`text-xs font-bold ${textClass} px-2 py-1 bg-black/20 rounded`}>
          {a.winProbability}% Win Prob
        </span>
      </div>
      <div className="font-bold text-white text-lg mb-1">
        {a.side || 'Team'} <span className={`${textClass}`}>{a.line}</span>
      </div>
      <div className="text-xs text-slate-400 mb-3 flex items-center space-x-2">
        <span>{a.odds}</span>
        <span>•</span>
        <span>{a.book}</span>
      </div>
      
      {/* Expanded Analysis View Toggle can go here, just showing snippet for now */}
      <div className="text-xs text-slate-300 leading-relaxed border-t border-slate-800/50 pt-2 mt-2">
        {a.fullAnalysis.split('\n').find(l => l.length > 50)?.slice(0, 120)}...
      </div>
    </div>
  );
}