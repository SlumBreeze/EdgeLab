import React, { useRef, useState } from 'react';
import { QueuedGame, BookLines } from '../types';
import { formatOddsForDisplay } from '../services/geminiService';
import { COMMON_BOOKS } from '../constants';
import { fetchOddsForGame, getBookmakerLines, SOFT_BOOK_KEYS } from '../services/oddsService';
import { useGameContext } from '../hooks/useGameContext';
import { CompactSoftLines } from './CompactSoftLines';

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
  loading: parentLoading, 
  onRemove, 
  onScan, 
  onAnalyze, 
  onUploadSharp, 
  onUploadSoft,
  onUpdateSoftBook 
}) => {
  const { setSharpLines, addSoftLines, updateGame } = useGameContext();
  const sharpInputRef = useRef<HTMLInputElement>(null);
  const softInputRef = useRef<HTMLInputElement>(null);
  const [editingLineIndex, setEditingLineIndex] = useState<number | null>(null);
  const [fetchingOdds, setFetchingOdds] = useState(false);
  const [apiSoftBooks, setApiSoftBooks] = useState<BookLines[]>([]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'SHARP' | 'SOFT') => {
    if (e.target.files?.[0]) {
      if (type === 'SHARP') onUploadSharp(e.target.files[0]);
      else onUploadSoft(e.target.files[0]);
    }
  };

  const handleFetchLines = async () => {
    setFetchingOdds(true);
    setApiSoftBooks([]);
    
    try {
      const data = await fetchOddsForGame(game.sport, game.id);
      if (!data) {
        alert("Could not fetch lines for this game. It might be too far in the future or started.");
        setFetchingOdds(false);
        return;
      }

      // 1. Set Sharp Lines (Pinnacle)
      const pinnacle = getBookmakerLines(data, 'pinnacle');
      if (pinnacle) {
        setSharpLines(game.id, pinnacle);
      }

      // 2. Gather Available Soft Books
      const foundBooks: BookLines[] = [];
      SOFT_BOOK_KEYS.forEach(key => {
        const lines = getBookmakerLines(data, key);
        if (lines) foundBooks.push(lines);
      });
      setApiSoftBooks(foundBooks);

    } catch (e) {
      console.error(e);
      alert("Error processing lines.");
    } finally {
      setFetchingOdds(false);
    }
  };

  const toggleSoftBook = (bookLines: BookLines) => {
    // Check if book is already in game.softLines
    const exists = game.softLines.some(sl => sl.bookName === bookLines.bookName);
    
    if (exists) {
      // Remove it
      const newSoftLines = game.softLines.filter(sl => sl.bookName !== bookLines.bookName);
      updateGame(game.id, { softLines: newSoftLines });
    } else {
      // Add it
      addSoftLines(game.id, bookLines);
    }
  };

  const calculateEdgeInfo = (soft: BookLines) => {
    if (!game.sharpLines) return null;
    const sharp = game.sharpLines;
    
    const getDiff = (s: string, h: string) => {
      const sv = parseFloat(s);
      const hv = parseFloat(h);
      return (isNaN(sv) || isNaN(hv)) ? 0 : sv - hv;
    };

    const spreadADiff = getDiff(soft.spreadLineA, sharp.spreadLineA);
    const spreadBDiff = getDiff(soft.spreadLineB, sharp.spreadLineB);
    
    if (spreadADiff > 0) return `✨+${spreadADiff} pts (Away)`;
    if (spreadBDiff > 0) return `✨+${spreadBDiff} pts (Home)`;
    
    const sOddsA = parseFloat(soft.spreadOddsA);
    const pOddsA = parseFloat(sharp.spreadOddsA);
    if (!isNaN(sOddsA) && !isNaN(pOddsA) && sOddsA > pOddsA) return `✨+${Math.round(sOddsA - pOddsA)}¢ (Away)`;

    const sOddsB = parseFloat(soft.spreadOddsB);
    const pOddsB = parseFloat(sharp.spreadOddsB);
    if (!isNaN(sOddsB) && !isNaN(pOddsB) && sOddsB > pOddsB) return `✨+${Math.round(sOddsB - pOddsB)}¢ (Home)`;

    return null;
  };

  const getEdgeColor = (signal?: string) => {
    if (signal === 'RED') return 'bg-red-100 text-red-600 border-red-200';
    if (signal === 'YELLOW') return 'bg-amber-100 text-amber-700 border-amber-200';
    return 'bg-slate-100 text-slate-600 border-slate-200';
  };

  const getEdgeEmoji = (signal?: string) => {
    if (signal === 'RED') return '🔴';
    if (signal === 'YELLOW') return '🟡';
    return '⚪';
  };

  // DraftKings-style line cell component
  const LineCell: React.FC<{ 
    line?: string; 
    odds?: string; 
    isHighlighted?: boolean;
    label?: string;
  }> = ({ line, odds, isHighlighted, label }) => (
    <div className={`
      flex flex-col items-center justify-center p-2 rounded-lg min-w-[70px]
      ${isHighlighted 
        ? 'bg-teal-50 border-2 border-teal-400' 
        : 'bg-slate-50 border border-slate-200'
      }
    `}>
      {label && <span className="text-[9px] text-slate-400 uppercase font-medium mb-0.5">{label}</span>}
      <span className={`font-bold text-sm ${isHighlighted ? 'text-teal-600' : 'text-slate-800'}`}>
        {line || 'N/A'}
      </span>
      <span className={`text-xs ${isHighlighted ? 'text-teal-500' : 'text-slate-500'}`}>
        {odds ? formatOddsForDisplay(odds) : ''}
      </span>
    </div>
  );

  // Team row component (DraftKings style)
  const TeamRow: React.FC<{
    team: { name: string; logo?: string };
    spreadLine: string;
    spreadOdds: string;
    totalLine: string;
    totalOdds: string;
    totalType: 'O' | 'U';
    mlOdds: string;
    isAway?: boolean;
    highlightSpread?: boolean;
    highlightTotal?: boolean;
    highlightML?: boolean;
  }> = ({ team, spreadLine, spreadOdds, totalLine, totalOdds, totalType, mlOdds, isAway, highlightSpread, highlightTotal, highlightML }) => (
    <div className="flex items-center gap-2 py-2">
      {/* Team Info */}
      <div className="flex items-center gap-2 min-w-[140px]">
        {team.logo && (
          <img src={team.logo} alt={team.name} className="w-8 h-8 object-contain" />
        )}
        <span className="font-semibold text-slate-800 text-sm truncate">{team.name}</span>
      </div>
      
      {/* Betting Cells */}
      <div className="flex gap-2 flex-1 justify-end">
        <LineCell line={spreadLine} odds={spreadOdds} isHighlighted={highlightSpread} />
        <LineCell line={`${totalType}${totalLine}`} odds={totalOdds} isHighlighted={highlightTotal} />
        <LineCell line={formatOddsForDisplay(mlOdds)} odds="" isHighlighted={highlightML} />
      </div>
    </div>
  );

  const loadingState = parentLoading || fetchingOdds;

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-lg border border-slate-200 relative">
      {loadingState && (
        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-20 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-coral-500"></div>
        </div>
      )}

      {/* Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-slate-800 to-slate-700 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <span className="bg-coral-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
            {game.sport}
          </span>
          <span className="text-white/60 text-xs">#{game.visibleId}</span>
        </div>
        <button onClick={onRemove} className="text-white/40 hover:text-coral-400 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Matchup Title */}
      <div className="px-4 py-3 border-b border-slate-100">
        <h3 className="font-bold text-slate-800 text-lg">
          {game.awayTeam.name} <span className="text-slate-400 font-normal">@</span> {game.homeTeam.name}
        </h3>
      </div>

      {/* Initial Read / Edge Scan */}
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500 font-medium uppercase tracking-wide">Initial Read</span>
          {!game.edgeSignal && (
            <button 
              onClick={onScan} 
              className="text-xs text-teal-600 hover:text-teal-700 font-medium flex items-center gap-1"
            >
              <span>⚡</span> Quick Scan
            </button>
          )}
        </div>
        {game.edgeSignal ? (
          <div className={`mt-2 text-xs px-3 py-2 rounded-lg border flex items-center gap-2 ${getEdgeColor(game.edgeSignal)}`}>
            <span>{getEdgeEmoji(game.edgeSignal)}</span>
            <span>{game.edgeDescription || 'No description available'}</span>
          </div>
        ) : (
          <p className="text-xs text-slate-400 mt-1 italic">Run a quick scan to check for injury edges</p>
        )}
      </div>

      {/* Line Shopping Section */}
      <div className="px-4 py-3">
        <div className="flex justify-between items-center mb-3">
          <span className="text-xs text-slate-500 font-medium uppercase tracking-wide">Line Shopping</span>
          <div className="flex gap-2">
            {/* New Fetch Button */}
            <button 
              onClick={handleFetchLines}
              className="text-xs bg-slate-800 hover:bg-slate-900 text-white px-3 py-1.5 rounded-lg font-bold transition-colors shadow-sm flex items-center gap-1"
            >
              <span>🔄</span> Fetch Live Lines
            </button>
          </div>
          <input type="file" hidden ref={sharpInputRef} accept="image/*" onChange={(e) => handleFileChange(e, 'SHARP')} />
          <input type="file" hidden ref={softInputRef} accept="image/*" onChange={(e) => handleFileChange(e, 'SOFT')} />
        </div>

        {/* Manual Upload Options (Small) */}
        <div className="flex justify-end gap-2 mb-3">
          <button 
            onClick={() => sharpInputRef.current?.click()} 
            className="text-[10px] text-slate-400 hover:text-slate-600 underline"
          >
            Upload Sharp Img
          </button>
          <button 
            onClick={() => softInputRef.current?.click()} 
            className="text-[10px] text-slate-400 hover:text-slate-600 underline"
          >
            Upload Soft Img
          </button>
        </div>

        {/* Sharp Lines (Pinnacle) */}
        {game.sharpLines ? (
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-3 mb-3 border border-amber-200">
            <div className="text-[10px] font-bold text-amber-600 uppercase mb-2 flex items-center gap-1">
              <span>📌</span> Pinnacle (Sharp)
            </div>
            <TeamRow
              team={game.awayTeam}
              spreadLine={game.sharpLines.spreadLineA}
              spreadOdds={game.sharpLines.spreadOddsA}
              totalLine={game.sharpLines.totalLine}
              totalOdds={game.sharpLines.totalOddsOver}
              totalType="O"
              mlOdds={game.sharpLines.mlOddsA}
              isAway
            />
            <div className="border-t border-amber-200 my-1"></div>
            <TeamRow
              team={game.homeTeam}
              spreadLine={game.sharpLines.spreadLineB}
              spreadOdds={game.sharpLines.spreadOddsB}
              totalLine={game.sharpLines.totalLine}
              totalOdds={game.sharpLines.totalOddsUnder}
              totalType="U"
              mlOdds={game.sharpLines.mlOddsB}
            />
          </div>
        ) : (
          <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center mb-3">
            <p className="text-slate-400 text-sm">Fetch lines or upload Pinnacle screenshot</p>
          </div>
        )}

        {/* Fetched Books Checklist */}
        {apiSoftBooks.length > 0 && game.sharpLines && (
          <div className="mb-4 bg-slate-50 rounded-xl p-3 border border-slate-200">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase mb-2">Available Soft Books</h4>
            <div className="grid grid-cols-1 gap-2">
              {apiSoftBooks.map((book) => {
                const isSelected = game.softLines.some(sl => sl.bookName === book.bookName);
                const edgeText = calculateEdgeInfo(book);

                return (
                  <label key={book.bookName} className="flex items-center gap-3 p-2 bg-white rounded-lg border border-slate-100 cursor-pointer hover:border-teal-200 transition-colors">
                    <input 
                      type="checkbox" 
                      checked={isSelected} 
                      onChange={() => toggleSoftBook(book)}
                      className="w-5 h-5 text-teal-600 rounded focus:ring-teal-500 border-gray-300" 
                    />
                    <div className="flex-1">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-slate-700 text-sm">{book.bookName}</span>
                        {edgeText && (
                          <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                            {edgeText}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 font-mono mt-0.5">
                        {game.awayTeam.name}: {book.spreadLineA} ({book.spreadOddsA})
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* Selected Soft Lines Display (Compact View) */}
        <CompactSoftLines 
           game={game} 
           editingLineIndex={editingLineIndex} 
           setEditingLineIndex={setEditingLineIndex} 
           onUpdateSoftBook={onUpdateSoftBook} 
        />
      </div>

      {/* Analysis Result / Action */}
      <div className="px-4 py-4 bg-slate-50 border-t border-slate-100">
        {game.analysis ? (
          <div className={`rounded-xl overflow-hidden ${
            game.analysis.decision === 'PLAYABLE' 
              ? 'bg-gradient-to-r from-teal-500 to-emerald-500 text-white' 
              : 'bg-slate-200 text-slate-600'
          }`}>
            {/* Decision Header */}
            <div className="px-4 py-3 flex justify-between items-center">
              <span className="font-bold text-sm flex items-center gap-2">
                {game.analysis.decision === 'PLAYABLE' ? '✅' : '⛔'} 
                {game.analysis.decision}
              </span>
              {game.analysis.sharpImpliedProb && (
                <span className="text-xs opacity-80 font-mono">
                  Fair: {game.analysis.sharpImpliedProb.toFixed(1)}%
                </span>
              )}
            </div>
            
            {/* The Pick */}
            {game.analysis.decision === 'PLAYABLE' && game.analysis.recommendation && (
              <div className="px-4 py-3 bg-white/10">
                <div className="font-bold text-xl">
                  {game.analysis.recommendation} {game.analysis.recLine}
                </div>
                <div className="text-sm opacity-80 mt-1">
                  @ {game.analysis.softBestBook} 
                  {game.analysis.lineValueCents && game.analysis.lineValueCents > 0 && (
                    <span className="ml-2 bg-white/20 px-2 py-0.5 rounded-full text-xs">
                      +{game.analysis.lineValueCents}¢ value
                    </span>
                  )}
                </div>
              </div>
            )}
            
            {/* Veto Reason */}
            {game.analysis.vetoTriggered && game.analysis.vetoReason && (
              <div className="px-4 py-2 bg-red-500/20 text-sm">
                <strong>Veto:</strong> {game.analysis.vetoReason}
              </div>
            )}
            
            {/* Research Summary */}
            <details className={`text-xs ${game.analysis.decision === 'PLAYABLE' ? 'bg-white/10' : 'bg-slate-100'}`}>
              <summary className="px-4 py-2 cursor-pointer hover:bg-white/10 font-medium">
                Research Summary
              </summary>
              <div className={`px-4 py-3 whitespace-pre-wrap ${
                game.analysis.decision === 'PLAYABLE' ? 'text-white/90' : 'text-slate-600'
              }`}>
                {game.analysis.researchSummary}
              </div>
            </details>
          </div>
        ) : (
          <button 
            onClick={onAnalyze}
            disabled={!game.sharpLines || game.softLines.length === 0}
            className={`w-full py-4 rounded-xl font-bold text-sm transition-all transform hover:scale-[1.02] ${
              !game.sharpLines || game.softLines.length === 0
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-coral-500 to-orange-500 text-white shadow-lg hover:shadow-xl'
            }`}
          >
            {!game.sharpLines || game.softLines.length === 0 
              ? 'Select Sharp + Soft Lines First'
              : '🎯 Run v3 Analysis'
            }
          </button>
        )}
      </div>
    </div>
  );
};

export default QueuedGameCard;