import React, { useRef, useState } from 'react';
import { QueuedGame, BookLines } from '../types';
import { detectMarketDiff } from '../services/geminiService';
import { COMMON_BOOKS } from '../constants';

interface Props {
  game: QueuedGame;
  loading: boolean;
  onRemove: () => void;
  onScan: () => void;
  onAnalyze: () => void;
  onUploadSharp: (file: File) => void;
  onUploadSoft: (file: File) => void;
  onUpdateSoftBook: (index: number, name: string) => void;
}

const QueuedGameCard: React.FC<Props> = ({ 
  game, 
  loading, 
  onRemove, 
  onScan, 
  onAnalyze, 
  onUploadSharp, 
  onUploadSoft,
  onUpdateSoftBook 
}) => {
  const sharpInputRef = useRef<HTMLInputElement>(null);
  const softInputRef = useRef<HTMLInputElement>(null);
  const [editingLineIndex, setEditingLineIndex] = useState<number | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'SHARP' | 'SOFT') => {
    if (e.target.files?.[0]) {
      if (type === 'SHARP') onUploadSharp(e.target.files[0]);
      else onUploadSoft(e.target.files[0]);
    }
  };

  const getEdgeColor = (signal?: string) => {
    if (signal === 'RED') return 'bg-red-500 text-white';
    if (signal === 'YELLOW') return 'bg-yellow-500 text-black';
    return 'bg-slate-700 text-slate-300';
  };

  const getDiffColor = (isDiff: boolean) => isDiff ? 'text-amber-400 font-bold' : 'text-slate-300';

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg relative">
      {loading && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-20 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
        </div>
      )}

      {/* Header */}
      <div className="p-4 bg-slate-850 border-b border-slate-800 flex justify-between items-start">
        <div>
          <div className="text-amber-500 font-bold text-xs uppercase tracking-wider mb-1">
            {game.sport} | {game.visibleId}
          </div>
          <h3 className="font-bold text-white text-lg leading-tight">
            {game.awayTeam.name} <span className="text-slate-500 text-sm font-normal">at</span> {game.homeTeam.name}
          </h3>
        </div>
        <button onClick={onRemove} className="text-slate-600 hover:text-red-500">
          ✕
        </button>
      </div>

      {/* Scout / Edge Section */}
      <div className="p-4 border-b border-slate-800">
        <div className="flex items-center justify-between mb-2">
           <span className="text-xs text-slate-400 font-medium">INITIAL READ</span>
           {!game.edgeSignal && (
             <button onClick={onScan} className="text-xs text-amber-500 hover:underline">
               Run Scan
             </button>
           )}
        </div>
        {game.edgeSignal ? (
          <div className={`text-xs px-3 py-2 rounded font-medium flex items-center ${getEdgeColor(game.edgeSignal)}`}>
            <span className="mr-2 text-lg">
              {game.edgeSignal === 'RED' ? '🔴' : game.edgeSignal === 'YELLOW' ? '🟡' : '⚪'}
            </span>
            {game.edgeDescription || 'No description available'}
          </div>
        ) : (
          <div className="text-xs text-slate-600 italic">No edge scan run yet.</div>
        )}
      </div>

      {/* Shop / Lines Section */}
      <div className="p-4 border-b border-slate-800 bg-slate-900/50">
        <div className="flex justify-between items-center mb-3">
           <span className="text-xs text-slate-400 font-medium uppercase">Line Shopping</span>
           <div className="flex space-x-2">
             <button onClick={() => sharpInputRef.current?.click()} className="text-xs bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded text-slate-300">
               + Sharp
             </button>
             <button onClick={() => softInputRef.current?.click()} className="text-xs bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded text-slate-300">
               + Soft
             </button>
           </div>
           <input type="file" hidden ref={sharpInputRef} accept="image/*" onChange={(e) => handleFileChange(e, 'SHARP')} />
           <input type="file" hidden ref={softInputRef} accept="image/*" onChange={(e) => handleFileChange(e, 'SOFT')} />
        </div>

        {/* Header Grid */}
        <div className="grid grid-cols-[80px_1fr_1fr_1fr] gap-1 px-2 mb-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">
            <div className="text-left">Book</div>
            <div>Spread</div>
            <div>Total</div>
            <div>ML</div>
        </div>

        <div className="space-y-1">
          {/* Sharp Line Row */}
          {game.sharpLines ? (
            <div className="grid grid-cols-[80px_1fr_1fr_1fr] gap-1 items-center bg-slate-950 p-2 rounded border border-slate-800 text-xs">
              <div className="font-bold text-slate-400 truncate">Pinnacle</div>
              <div className="text-center text-white">
                <div>{game.sharpLines.spreadLineA}</div>
                <div className="text-slate-500 text-[10px]">{game.sharpLines.spreadOddsA}</div>
              </div>
              <div className="text-center text-white">
                <div>{game.sharpLines.totalLine}</div>
                <div className="text-slate-500 text-[10px]">o{game.sharpLines.totalOddsOver}</div>
              </div>
              <div className="text-center text-white">
                <div>{game.sharpLines.mlOddsA}</div>
                <div className="text-slate-500 text-[10px]">{game.sharpLines.mlOddsB}</div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-600 text-center py-2 border border-dashed border-slate-800 rounded">
              Upload Sharp
            </div>
          )}

          {/* Soft Lines Rows */}
          {game.softLines.map((line, idx) => {
            const isEditing = editingLineIndex === idx;
            // Detect diffs vs Sharp
            const diffSpread = game.sharpLines ? detectMarketDiff(game.sharpLines.spreadLineA, line.spreadLineA, 'SPREAD') : false;
            const diffTotal = game.sharpLines ? detectMarketDiff(game.sharpLines.totalLine, line.totalLine, 'TOTAL') : false;
            const diffML = game.sharpLines ? detectMarketDiff(game.sharpLines.mlOddsA, line.mlOddsA, 'ML') : false;

            return (
              <div key={idx} className="grid grid-cols-[80px_1fr_1fr_1fr] gap-1 items-center bg-slate-800/50 p-2 rounded border border-slate-700/50 text-xs">
                {/* Book Name Column */}
                <div className="truncate">
                  {isEditing ? (
                    <select 
                      value={line.bookName} 
                      onChange={(e) => {
                         onUpdateSoftBook(idx, e.target.value);
                         setEditingLineIndex(null);
                      }}
                      onBlur={() => setEditingLineIndex(null)}
                      autoFocus
                      className="w-full text-[10px] bg-slate-800 text-white rounded p-1 border border-amber-500 outline-none"
                    >
                      {COMMON_BOOKS.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  ) : (
                    <button 
                      onClick={() => setEditingLineIndex(idx)} 
                      className="font-bold text-slate-300 hover:text-amber-500 hover:underline decoration-dashed underline-offset-2 text-left truncate w-full"
                    >
                      {line.bookName}
                    </button>
                  )}
                </div>

                {/* Spread Column */}
                <div className={`text-center ${getDiffColor(diffSpread)}`}>
                   <div>{line.spreadLineA}</div>
                   <div className="text-[10px] opacity-70">{line.spreadOddsA}</div>
                </div>

                {/* Total Column */}
                <div className={`text-center ${getDiffColor(diffTotal)}`}>
                   <div>{line.totalLine}</div>
                   <div className="text-[10px] opacity-70">o{line.totalOddsOver}</div>
                </div>

                {/* ML Column */}
                <div className={`text-center ${getDiffColor(diffML)}`}>
                   <div>{line.mlOddsA}</div>
                   <div className="text-[10px] opacity-70">{line.mlOddsB}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Action Footer */}
      <div className="p-4">
        {game.analysis ? (
          <div className={`rounded-lg border overflow-hidden ${
            game.analysis.decision === 'PLAYABLE' 
              ? 'bg-emerald-900/20 border-emerald-500/50' 
              : 'bg-slate-800 border-slate-700'
          }`}>
            <div className="p-3 bg-black/20 flex justify-between items-center">
              <span className={`font-bold text-sm ${
                game.analysis.decision === 'PLAYABLE' ? 'text-emerald-400' : 'text-slate-400'
              }`}>
                {game.analysis.decision === 'PLAYABLE' ? '✅ PLAYABLE' : '⛔ PASS'}
              </span>
              {game.analysis.sharpImpliedProb && (
                <span className="text-xs font-mono text-slate-400">
                  Fair: {game.analysis.sharpImpliedProb.toFixed(1)}%
                </span>
              )}
            </div>
            
            {/* The Pick - shows the recommended bet */}
            {game.analysis.decision === 'PLAYABLE' && game.analysis.recommendation && (
              <div className="px-3 py-3 border-b border-slate-700 bg-emerald-900/10">
                <div className="font-bold text-emerald-400 text-lg">
                  {game.analysis.recommendation} {game.analysis.recLine}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  @ {game.analysis.softBestBook} {game.analysis.lineValueCents && game.analysis.lineValueCents > 0 ? `• +${game.analysis.lineValueCents} cents value` : ''}
                </div>
              </div>
            )}
            
            {game.analysis.vetoTriggered && game.analysis.vetoReason && (
              <div className="px-3 py-2 bg-red-900/20 text-red-400 text-xs border-b border-slate-700">
                <strong>Veto:</strong> {game.analysis.vetoReason}
              </div>
            )}
            
            {game.analysis.lineValueCents !== undefined && game.analysis.lineValueCents > 0 && !game.analysis.recommendation && (
              <div className="px-3 py-2 bg-emerald-900/20 text-emerald-400 text-xs border-b border-slate-700">
                <strong>Line Value:</strong> +{game.analysis.lineValueCents} cents at {game.analysis.softBestBook}
              </div>
            )}
            
            <div className="p-3 text-xs text-slate-300 whitespace-pre-wrap max-h-48 overflow-y-auto">
              {game.analysis.researchSummary}
            </div>
          </div>
        ) : (
          <button 
            onClick={onAnalyze}
            disabled={!game.sharpLines || game.softLines.length === 0}
            className={`w-full py-3 rounded-lg font-bold text-sm transition-colors ${
              !game.sharpLines || game.softLines.length === 0
                ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg'
            }`}
          >
            Run v2.1 Analysis
          </button>
        )}
      </div>
    </div>
  );
};

export default QueuedGameCard;
