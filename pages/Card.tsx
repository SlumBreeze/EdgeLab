import React from 'react';
import { useGameContext } from '../hooks/useGameContext';
import { HighHitAnalysis, QueuedGame } from '../types';
import { MAX_DAILY_PLAYS } from '../constants';

export default function Card() {
  const { queue, getPlayableCount } = useGameContext();
  
  const analyzedGames = queue.filter(g => g.analysis);
  const playable = analyzedGames.filter(g => g.analysis?.decision === 'PLAYABLE');
  const passed = analyzedGames.filter(g => g.analysis?.decision === 'PASS');
  
  const playableCount = getPlayableCount();
  const overLimit = playableCount > MAX_DAILY_PLAYS;

  const generateClipboardText = () => {
    const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    let output = `EDGELAB v2.1 — DISCIPLINE CARD\n${dateStr}\n${'='.repeat(35)}\n\n`;

    if (playable.length > 0) {
      output += `✅ PLAYABLE (No Vetoes Triggered)\n`;
      playable.forEach(g => {
        const a = g.analysis!;
        output += `\n${g.sport}: ${g.awayTeam.name} @ ${g.homeTeam.name}\n`;
        output += `Sharp Fair Prob: ${a.sharpImpliedProb?.toFixed(1) || 'N/A'}%\n`;
        if (a.recommendation) {
           output += `PICK: ${a.recommendation} ${a.recLine} @ ${a.softBestBook}\n`;
        }
        if (a.lineValueCents && a.lineValueCents > 0) {
          output += `Line Value: +${a.lineValueCents} cents\n`;
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

      {/* DISCIPLINE WARNING */}
      {overLimit && (
        <div className="mb-6 p-4 bg-red-900/30 border border-red-500 rounded-xl">
          <div className="flex items-center text-red-400 font-bold mb-2">
            <span className="text-xl mr-2">⚠️</span>
            DISCIPLINE WARNING
          </div>
          <p className="text-red-300 text-sm">
            You have {playableCount} playable games but the framework limits you to {MAX_DAILY_PLAYS} per day.
            Choose your best {MAX_DAILY_PLAYS} based on line value, not gut feel.
          </p>
        </div>
      )}

      {analyzedGames.length === 0 ? (
        <div className="text-center py-20 bg-slate-900 rounded-xl border border-slate-800">
          <p className="text-slate-500">No analyses completed yet.</p>
          <p className="text-slate-600 text-sm mt-2">Add games from Scout → Upload lines → Run analysis</p>
        </div>
      ) : (
        <>
          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className={`p-4 rounded-xl border ${overLimit ? 'bg-red-900/20 border-red-500/50' : 'bg-emerald-900/20 border-emerald-500/30'}`}>
              <div className={`text-2xl font-bold ${overLimit ? 'text-red-400' : 'text-emerald-400'}`}>
                {playableCount}
              </div>
              <div className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">
                Playable / {MAX_DAILY_PLAYS} Max
              </div>
            </div>
            <div className="bg-slate-800 border border-slate-700 p-4 rounded-xl">
              <div className="text-2xl font-bold text-slate-400">{passed.length}</div>
              <div className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">Passed</div>
            </div>
          </div>

          {/* Playable Games */}
          {playable.length > 0 && (
            <section className="mb-6">
              <h2 className="text-emerald-400 font-bold text-sm uppercase tracking-wider mb-3 flex items-center">
                <span className="mr-2">✅</span> Playable (Your Decision)
              </h2>
              <div className="space-y-3">
                {playable.map(g => (
                  <PlayableCard key={g.id} game={g} />
                ))}
              </div>
            </section>
          )}

          {/* Passed Games */}
          {passed.length > 0 && (
            <section>
              <h2 className="text-slate-500 font-bold text-sm uppercase tracking-wider mb-3 flex items-center">
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
            className="w-full mt-8 bg-slate-800 hover:bg-slate-700 text-white font-bold py-4 rounded-xl border border-slate-700"
          >
            📋 Copy Daily Card
          </button>

          {/* Philosophy Reminder */}
          <div className="mt-6 text-center text-slate-600 text-xs">
            <p>EdgeLab v2.1 — Discipline Edition</p>
            <p className="mt-1 italic">"Passing is profitable."</p>
          </div>
        </>
      )}
    </div>
  );
}

const PlayableCard: React.FC<{ game: QueuedGame }> = ({ game }) => {
  const a = game.analysis!;
  
  return (
    <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20">
      <div className="flex justify-between items-start mb-2">
        <span className="text-xs font-bold text-slate-400 uppercase">{game.sport}</span>
        {a.recProbability !== undefined && a.recProbability > 0 && (
          <span className="text-xs font-mono bg-slate-800 px-2 py-1 rounded text-slate-300">
            Fair: {a.recProbability.toFixed(1)}%
          </span>
        )}
      </div>
      
      {/* THE PICK - BIG AND BOLD */}
      {a.recommendation && (
        <div className="mb-4">
          <div className="text-xl font-bold text-white leading-tight">
            {a.recommendation} <span className="text-emerald-400">{a.recLine}</span>
          </div>
          <div className="text-sm text-slate-400 mt-1">
            @ {a.softBestBook}
          </div>
        </div>
      )}
      
      {/* Matchup context */}
      <div className="text-sm text-slate-500 mb-3">
        {game.awayTeam.name} @ {game.homeTeam.name}
      </div>
      
      {/* Line Value Badge */}
      {(a.lineValueCents !== undefined && a.lineValueCents > 0) && (
        <div className="inline-block bg-emerald-900/50 text-emerald-400 text-xs px-2 py-1 rounded border border-emerald-500/30 mb-3">
          +{a.lineValueCents} cents vs sharp
        </div>
      )}
      
      {a.edgeNarrative && (
        <div className="text-sm text-slate-300 mb-3 italic">
          "{a.edgeNarrative}"
        </div>
      )}
      
      <details className="text-xs text-slate-400 border-t border-slate-700/50 pt-2">
        <summary className="cursor-pointer hover:text-slate-300 font-medium">Research Summary</summary>
        <div className="mt-2 p-2 bg-slate-900 rounded whitespace-pre-wrap text-slate-300">
          {a.researchSummary}
        </div>
      </details>
    </div>
  );
};

const PassedCard: React.FC<{ game: QueuedGame }> = ({ game }) => {
  const a = game.analysis!;
  
  return (
    <div className="p-4 rounded-xl border border-slate-700 bg-slate-800/50">
      <div className="flex justify-between items-start mb-2">
        <span className="text-xs font-bold text-slate-500 uppercase">{game.sport}</span>
        {a.vetoTriggered && (
          <span className="text-xs bg-red-900/50 text-red-400 px-2 py-1 rounded">
            VETO
          </span>
        )}
      </div>
      
      <div className="font-bold text-slate-400 mb-2">
        {game.awayTeam.name} @ {game.homeTeam.name}
      </div>
      
      {a.vetoReason && (
        <div className="text-xs text-red-400/80 mb-2">
          {a.vetoReason}
        </div>
      )}
      
      <details className="text-xs text-slate-500">
        <summary className="cursor-pointer hover:text-slate-400">Research Summary</summary>
        <div className="mt-2 p-2 bg-slate-900 rounded whitespace-pre-wrap">
          {a.researchSummary}
        </div>
      </details>
    </div>
  );
};
