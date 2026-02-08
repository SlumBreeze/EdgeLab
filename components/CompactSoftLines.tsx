import { formatOddsForDisplay, americanToImpliedProb, calculateNoVigProb } from '../services/geminiService';

interface Props {
  game: QueuedGame;
  editingLineIndex: number | null;
  setEditingLineIndex: (index: number | null) => void;
  onUpdateSoftBook: (index: number, name: string) => void;
}

/**
 * HELPER: Simple point adjustment for UI display.
 * Matches geminiService.ts logic for NBA/NFL defaults.
 */
const getAdjustedProb = (baseProb: number, pointDiff: number, sport: string, market: string) => {
  let pointValue = 3.0;
  if (sport === 'NBA') pointValue = market === 'Total' ? 1.5 : 2.5;
  else if (sport === 'NFL') pointValue = market === 'Total' ? 1.0 : 4.0;
  return Math.max(1, Math.min(99, baseProb + (pointDiff * pointValue)));
};

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
        <thead className="bg-ink-base text-ink-text/90 font-bold uppercase tracking-wider border-b border-ink-gray">
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
            let edgeColor = 'text-ink-text/60';

            if (sharp) {
                const results: { edge: number, label: string }[] = [];

                // 1. Check Away Spread
                const pA = parseFloat(sharp.spreadLineA);
                const sA = parseFloat(line.spreadLineA);
                if (!isNaN(pA) && !isNaN(sA)) {
                  const noVig = calculateNoVigProb(sharp.spreadOddsA, sharp.spreadOddsB);
                  const adjProb = getAdjustedProb(noVig.probA, sA - pA, game.sport, 'Spread');
                  const edge = adjProb - americanToImpliedProb(line.spreadOddsA);
                  if (edge > 0) results.push({ edge, label: `+${Math.round((sA - pA)*10)/10}` });
                  if (sA > pA) awayBetter = true;
                }

                // 2. Check Home Spread
                const pB = parseFloat(sharp.spreadLineB);
                const sB = parseFloat(line.spreadLineB);
                if (!isNaN(pB) && !isNaN(sB)) {
                  const noVig = calculateNoVigProb(sharp.spreadOddsA, sharp.spreadOddsB);
                  const adjProb = getAdjustedProb(noVig.probB, sB - pB, game.sport, 'Spread');
                  const edge = adjProb - americanToImpliedProb(line.spreadOddsB);
                  if (edge > 0) results.push({ edge, label: `+${Math.round((sB - pB)*10)/10}` });
                  if (sB > pB) homeBetter = true;
                }

                // 3. Check Total
                const pT = parseFloat(sharp.totalLine);
                const sT = parseFloat(line.totalLine);
                if (!isNaN(pT) && !isNaN(sT)) {
                  const noVig = calculateNoVigProb(sharp.totalOddsOver, sharp.totalOddsUnder);
                  // Check OVER
                  const adjOver = getAdjustedProb(noVig.probA, pT - sT, game.sport, 'Total');
                  const edgeOver = adjOver - americanToImpliedProb(line.totalOddsOver);
                  // Check UNDER
                  const adjUnder = getAdjustedProb(noVig.probB, sT - pT, game.sport, 'Total');
                  const edgeUnder = adjUnder - americanToImpliedProb(line.totalOddsUnder);
                  
                  const bestTotalEdge = Math.max(edgeOver, edgeUnder);
                  if (bestTotalEdge > 0) {
                    results.push({ edge: bestTotalEdge, label: `+${Math.round(Math.abs(sT - pT)*10)/10}` });
                  }
                  if (sT !== pT) totalBetter = true;
                }

                // Pick the best mathematical edge for the label
                const best = results.sort((a, b) => b.edge - a.edge)[0];
                if (best && best.edge > 0.1) {
                  edgeLabel = best.label === '+0' ? `+${Math.round(best.edge)}¢` : best.label;
                  edgeColor = 'text-status-win font-bold bg-status-win/10 px-1.5 py-0.5 rounded';
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
                            className="font-bold text-ink-text/90 hover:text-ink-accent flex items-center gap-1 text-[11px] text-left leading-tight"
                        >
                            {line.bookName}
                        </button>
                    )}
                </td>

                <td className={`px-2 py-2 text-center border-l border-r border-ink-gray align-middle ${awayBetter ? 'bg-ink-accent/10' : ''}`}>
                    <div className="flex flex-col items-center leading-none gap-0.5">
                        <span className={`font-bold ${awayBetter ? 'text-ink-accent' : 'text-ink-text'}`}>{line.spreadLineA}</span>
                        <span className={`text-[9px] ${awayBetter ? 'text-ink-accent' : 'text-ink-text/60'}`}>{formatOddsForDisplay(line.spreadOddsA)}</span>
                    </div>
                </td>

                <td className={`px-2 py-2 text-center border-r border-ink-gray align-middle ${homeBetter ? 'bg-ink-accent/10' : ''}`}>
                    <div className="flex flex-col items-center leading-none gap-0.5">
                        <span className={`font-bold ${homeBetter ? 'text-ink-accent' : 'text-ink-text'}`}>{line.spreadLineB}</span>
                        <span className={`text-[9px] ${homeBetter ? 'text-ink-accent' : 'text-ink-text/60'}`}>{formatOddsForDisplay(line.spreadOddsB)}</span>
                    </div>
                </td>

                <td className={`px-2 py-2 text-center align-middle ${totalBetter ? 'bg-ink-accent/5' : ''}`}>
                     <div className="flex flex-col items-center leading-none gap-0.5">
                        <span className="text-ink-text font-medium">{line.totalLine}</span>
                        <div className="flex justify-center gap-1 text-[9px] text-ink-text/60">
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