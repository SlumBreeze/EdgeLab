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
    let output = `EDGELAB v3 — DAILY CARD\n${dateStr}\n${'='.repeat(35)}\n\n`;

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
        if (a.caution) {
          output += `WARNING: ${a.caution}\n`;
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
        <h1 className="text-2xl font-bold text-slate-800 mb-1">Daily Card</h1>
        <p className="text-slate-400 text-sm">
          {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </header>

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
                {playable.map(g => (
                  <PlayableCard key={g.id} game={g} />
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
  );
}

const PlayableCard: React.FC<{ game: QueuedGame }> = ({ game }) => {
  const a = game.analysis!;
  const hasCaution = !!a.caution;
  
  return (
    <div className={`p-4 rounded-2xl shadow-lg ${
      hasCaution 
        ? 'bg-gradient-to-br from-amber-400 to-yellow-500 text-slate-800' 
        : 'bg-gradient-to-br from-teal-500 to-emerald-500 text-white'
    }`}>
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
        {a.recProbability !== undefined && a.recProbability > 0 && (
          <span className={`text-xs font-mono px-2 py-1 rounded-full ${hasCaution ? 'bg-white/40 text-slate-900' : 'bg-white/20'}`}>
            Fair: {a.recProbability.toFixed(1)}%
          </span>
        )}
      </div>
      
      {/* THE PICK - BIG AND BOLD */}
      {a.recommendation && (
        <div className="mb-4">
          <div className="text-2xl font-bold leading-tight">
            {a.recommendation} <span className={hasCaution ? 'text-slate-900' : 'text-white/90'}>{a.recLine}</span>
          </div>
          <div className={`text-sm mt-1 ${hasCaution ? 'text-slate-700' : 'text-white/70'}`}>
            @ {a.softBestBook}
          </div>
        </div>
      )}
      
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