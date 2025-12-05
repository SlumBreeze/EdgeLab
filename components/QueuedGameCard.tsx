import React, { useRef, useState } from 'react';
import { QueuedGame, BookLines } from '../types';
import { detectSpreadEdge } from '../services/geminiService';
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

        <div className="space-y-2">
          {/* Sharp Line Display */}
          {game.sharpLines ? (
            <div className="flex justify-between items-center bg-slate-950 p-2 rounded border border-slate-800">
              <span className="text-xs font-bold text-slate-400">Pinnacle</span>
              <div className="text-xs text-white">
                {game.sharpLines.spreadLineA} / {game.sharpLines.spreadLineB}
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-600 text-center py-2 border border-dashed border-slate-800 rounded">
              Upload Pinnacle screenshot
            </div>
          )}

          {/* Soft Lines List */}
          {game.softLines.map((line, idx) => {
            const edge = game.sharpLines ? detectSpreadEdge(game.sharpLines, line) : 'equal';
            const isEditing = editingLineIndex === idx;

            return (
              <div key={idx} className={`flex justify-between items-center p-2 rounded border ${
                edge === 'better' ? 'border-emerald-500/50 bg-emerald-900/10' : 
                edge === 'worse' ? 'border-red-500/50 bg-red-900/10' : 
                'border-slate-800 bg-slate-950'
              }`}>
                {isEditing ? (
                  <select 
                    value={line.bookName} 
                    onChange={(e) => {
                       onUpdateSoftBook(idx, e.target.value);
                       setEditingLineIndex(null);
                    }}
                    onBlur={() => setEditingLineIndex(null)}
                    autoFocus
                    className="text-xs bg-slate-800 text-white rounded p-1 border border-amber-500 outline-none"
                  >
                    {COMMON_BOOKS.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                ) : (
                  <button 
                    onClick={() => setEditingLineIndex(idx)} 
                    className="text-xs font-bold text-slate-300 hover:text-amber-500 hover:underline decoration-dashed underline-offset-2 text-left"
                    title="Click to correct book name"
                  >
                    {line.bookName}
                  </button>
                )}
                
                <div className="text-xs text-white">
                   {line.spreadLineA} <span className="text-slate-500">({line.spreadOddsA})</span>
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
             game.analysis.decision === 'PRIMARY' ? 'bg-amber-900/20 border-amber-500/50' : 
             game.analysis.decision === 'LEAN' ? 'bg-yellow-900/20 border-yellow-500/50' :
             'bg-slate-800 border-slate-700'
           }`}>
             <div className="p-3 bg-black/20 flex justify-between items-center">
               <span className={`font-bold text-sm ${
                 game.analysis.decision === 'PRIMARY' ? 'text-amber-500' :
                 game.analysis.decision === 'LEAN' ? 'text-yellow-500' :
                 'text-slate-400'
               }`}>
                 {game.analysis.decision === 'PRIMARY' ? '🎯 PRIMARY PLAY' : game.analysis.decision === 'LEAN' ? '📊 LEAN' : '⏸ PASS'}
               </span>
               {game.analysis.winProbability && (
                 <span className="text-xs font-mono text-slate-400">{game.analysis.winProbability}% Win Prob</span>
               )}
             </div>
             <div className="p-3 text-xs text-slate-300 whitespace-pre-wrap max-h-64 overflow-y-auto">
                {game.analysis.fullAnalysis}
             </div>
           </div>
        ) : (
          <button 
            onClick={onAnalyze}
            disabled={!game.sharpLines || game.softLines.length === 0}
            className={`w-full py-3 rounded-lg font-bold text-sm transition-colors ${
              !game.sharpLines || game.softLines.length === 0
                ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                : 'bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-900/20'
            }`}
          >
            Run High-Hit Analysis
          </button>
        )}
      </div>
    </div>
  );
};

export default QueuedGameCard;
