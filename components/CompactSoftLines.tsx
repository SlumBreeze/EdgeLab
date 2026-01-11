import React from 'react';
import { QueuedGame, BookLines } from '../types';
import { COMMON_BOOKS } from '../constants';
import { formatOddsForDisplay } from '../services/geminiService';

interface Props {
  game: QueuedGame;
  editingLineIndex: number | null;
  setEditingLineIndex: (index: number | null) => void;
  onUpdateSoftBook: (index: number, name: string) => void;
}

export const CompactSoftLines: React.FC<Props> = ({ 
  game, 
  editingLineIndex, 
  setEditingLineIndex, 
  onUpdateSoftBook 
}) => {
  if (game.softLines.length === 0) return null;

  const sharp = game.sharpLines;

  return (
    <div className="mb-3 border border-ink-gray rounded-xl overflow-hidden bg-ink-paper shadow-sm">
      <table className="w-full text-[11px]">
        <thead className="bg-ink-base text-ink-text/50 font-bold uppercase tracking-wider border-b border-ink-gray">
          <tr>
            <th className="px-3 py-2 text-left w-[90px]">Book</th>
            <th className="px-2 py-2 text-center w-[25%]">Away Spread</th>
            <th className="px-2 py-2 text-center w-[25%]">Home Spread</th>
            <th className="px-2 py-2 text-center">Total</th>
            <th className="px-3 py-2 text-right">Edge</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-gray">
          {game.softLines.map((line, idx) => {
            const isEditing = editingLineIndex === idx;
            
            // Comparison Logic
            let awayBetter = false;
            let homeBetter = false;
            let totalBetter = false;
            let edgeLabel = '—';
            let edgeColor = 'text-ink-text/20';

            if (sharp) {
                // Spreads (Higher value is better for the bettor)
                const sA = parseFloat(line.spreadLineA);
                const pA = parseFloat(sharp.spreadLineA);
                if (!isNaN(sA) && !isNaN(pA) && sA > pA) {
                    awayBetter = true;
                    edgeLabel = `+${Math.round((sA - pA)*10)/10}`;
                    edgeColor = 'text-status-win font-bold bg-status-win/10 px-1.5 py-0.5 rounded';
                }

                const sB = parseFloat(line.spreadLineB);
                const pB = parseFloat(sharp.spreadLineB);
                if (!isNaN(sB) && !isNaN(pB) && sB > pB) {
                    homeBetter = true;
                    edgeLabel = `+${Math.round((sB - pB)*10)/10}`;
                    edgeColor = 'text-status-win font-bold bg-status-win/10 px-1.5 py-0.5 rounded';
                }
                
                // Total Highlight if different
                const totalDiff = Math.abs(parseFloat(line.totalLine) - parseFloat(sharp.totalLine));
                if (totalDiff > 0) totalBetter = true;

                // Juice Check if no point edge
                if (edgeLabel === '—') {
                     const sOA = parseFloat(line.spreadOddsA);
                     const pOA = parseFloat(sharp.spreadOddsA);
                     const sOB = parseFloat(line.spreadOddsB);
                     const pOB = parseFloat(sharp.spreadOddsB);
                     
                     if ((!isNaN(sOA) && !isNaN(pOA) && sOA > pOA) || (!isNaN(sOB) && !isNaN(pOB) && sOB > pOB)) {
                         const diffA = sOA - pOA;
                         const diffB = sOB - pOB;
                         const maxDiff = Math.max(isNaN(diffA) ? -999 : diffA, isNaN(diffB) ? -999 : diffB);
                         if (maxDiff > 0) {
                            edgeLabel = `+${Math.round(maxDiff)}¢`;
                            edgeColor = 'text-ink-accent bg-ink-accent/10 px-1.5 py-0.5 rounded';
                         }
                     }
                }
            }

            return (
              <tr key={idx} className="hover:bg-ink-base/50 transition-colors">
                <td className="px-3 py-2 align-middle">
                    {isEditing ? (
                        <select 
                            value={line.bookName} 
                            onChange={(e) => {
                                onUpdateSoftBook(idx, e.target.value);
                                setEditingLineIndex(null);
                            }}
                            onBlur={() => setEditingLineIndex(null)}
                            autoFocus
                            className="w-full text-[10px] bg-ink-base text-ink-text rounded px-1 py-1 border border-ink-accent outline-none"
                        >
                            {COMMON_BOOKS.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                    ) : (
                        <button 
                            onClick={() => setEditingLineIndex(idx)}
                            className="font-bold text-ink-text/70 hover:text-ink-accent flex items-center gap-1 text-[11px] text-left leading-tight"
                        >
                            {line.bookName}
                        </button>
                    )}
                </td>

                <td className={`px-2 py-2 text-center border-l border-r border-ink-gray align-middle ${awayBetter ? 'bg-ink-accent/10' : ''}`}>
                    <div className="flex flex-col items-center leading-none gap-0.5">
                        <span className={`font-bold ${awayBetter ? 'text-ink-accent' : 'text-ink-text'}`}>{line.spreadLineA}</span>
                        <span className={`text-[9px] ${awayBetter ? 'text-ink-accent' : 'text-ink-text/40'}`}>{formatOddsForDisplay(line.spreadOddsA)}</span>
                    </div>
                </td>

                <td className={`px-2 py-2 text-center border-r border-ink-gray align-middle ${homeBetter ? 'bg-ink-accent/10' : ''}`}>
                    <div className="flex flex-col items-center leading-none gap-0.5">
                        <span className={`font-bold ${homeBetter ? 'text-ink-accent' : 'text-ink-text'}`}>{line.spreadLineB}</span>
                        <span className={`text-[9px] ${homeBetter ? 'text-ink-accent' : 'text-ink-text/40'}`}>{formatOddsForDisplay(line.spreadOddsB)}</span>
                    </div>
                </td>

                <td className={`px-2 py-2 text-center align-middle ${totalBetter ? 'bg-ink-accent/5' : ''}`}>
                     <div className="flex flex-col items-center leading-none gap-0.5">
                        <span className="text-ink-text font-medium">{line.totalLine}</span>
                        <div className="flex justify-center gap-1 text-[9px] text-ink-text/40">
                           <span>o{formatOddsForDisplay(line.totalOddsOver)}</span>
                           <span>u{formatOddsForDisplay(line.totalOddsUnder)}</span>
                        </div>
                    </div>
                </td>

                <td className="px-3 py-2 text-right align-middle">
                    <span className={`text-[10px] inline-block min-w-[30px] text-center ${edgeColor}`}>
                        {edgeLabel}
                    </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};