
import React, { useRef, useState } from 'react';
import { QueuedGame, BookLines } from '../types';
import { formatOddsForDisplay } from '../services/geminiService';
import { COMMON_BOOKS } from '../constants';
import { fetchOddsForGame, getBookmakerLines, SOFT_BOOK_KEYS } from '../services/oddsService';
import { useGameContext } from '../hooks/useGameContext';
import { CompactSoftLines } from './CompactSoftLines';
import { formatEtTime, getTimeWindow, getTimeWindowLabel } from '../utils/timeWindow';

interface Props {
  game: QueuedGame;
  loading: boolean;
  onRemove: () => void;
  onScan: () => void;
  onAnalyze: () => void;
  onUploadSharp: (file: File) => void;
  onUploadSoft: (file: File) => void;
  onUpdateSoftBook: (index: number, name: string) => void;
  
  // New Queue Props
  queuePosition: number;
  isAnalyzing: boolean;
  onQuickAnalyze: () => void;
  onRemoveFromQueue: () => void;
}

const QueuedGameCard: React.FC<Props> = ({ 
  game, 
  loading: parentLoading, 
  onRemove, 
  onScan, 
  onAnalyze, 
  onUploadSharp, 
  onUploadSoft,
  onUpdateSoftBook,
  queuePosition,
  isAnalyzing,
  onQuickAnalyze,
  onRemoveFromQueue
}) => {
  const { setSharpLines, addSoftLines, updateGame, activeBookNames } = useGameContext();
  const sharpInputRef = useRef<HTMLInputElement>(null);
  const softInputRef = useRef<HTMLInputElement>(null);
  const [editingLineIndex, setEditingLineIndex] = useState<number | null>(null);
  const [fetchingOdds, setFetchingOdds] = useState(false);
  const [apiSoftBooks, setApiSoftBooks] = useState<BookLines[]>([]);
  const timeLabel = formatEtTime(game.date);
  const windowLabel = getTimeWindowLabel(getTimeWindow(game.date));

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

      // NEW: Auto-select books matching active bankroll
      const autoSelected: BookLines[] = [];
      foundBooks.forEach(book => {
        const isActiveBook = activeBookNames.some(name =>
          name.toLowerCase().includes(book.bookName.toLowerCase()) ||
          book.bookName.toLowerCase().includes(name.toLowerCase())
        );
        if (isActiveBook) {
          autoSelected.push(book);
        }
      });

      // Add auto-selected books to game's softLines (if not already present)
      autoSelected.forEach(book => {
        const alreadyAdded = game.softLines.some(sl => sl.bookName === book.bookName);
        if (!alreadyAdded) {
          addSoftLines(game.id, book);
        }
      });

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
    if (signal === 'RED') return 'bg-status-loss/10 text-status-loss border-status-loss/30';
    if (signal === 'YELLOW') return 'bg-amber-500/10 text-amber-300 border-amber-500/30';
    return 'bg-ink-base text-ink-text/60 border-ink-gray';
  };

  const getEdgeEmoji = (signal?: string) => {
    if (signal === 'RED') return '🔴';
    if (signal === 'YELLOW') return '🟡';
    return '⚪';
  };

  const getFactConfidenceStyle = (confidence?: string) => {
    if (confidence === 'HIGH') return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30';
    if (confidence === 'MEDIUM') return 'bg-amber-500/10 text-amber-300 border-amber-500/30';
    if (confidence === 'LOW') return 'bg-status-loss/10 text-status-loss border-status-loss/30';
    return 'bg-ink-base text-ink-text/50 border-ink-gray';
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
        ? 'bg-ink-accent/10 border-2 border-ink-accent/40' 
        : 'bg-ink-base border border-ink-gray'
      }
    `}>
      {label && <span className="text-[9px] text-ink-text/40 uppercase font-medium mb-0.5">{label}</span>}
      <span className={`font-bold text-sm ${isHighlighted ? 'text-ink-accent' : 'text-ink-text'}`}>
        {line || 'N/A'}
      </span>
      <span className={`text-xs ${isHighlighted ? 'text-ink-accent' : 'text-ink-text/50'}`}>
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
        <span className="font-semibold text-ink-text text-sm truncate">{team.name}</span>
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
    <div className="bg-ink-paper rounded-2xl overflow-hidden shadow-lg border border-ink-gray relative">
      {loadingState && (
        <div className="absolute inset-0 bg-ink-paper/80 backdrop-blur-sm z-20 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ink-accent"></div>
        </div>
      )}

      {/* Header */}
      <div className="px-4 py-3 bg-ink-base border-b border-ink-gray flex justify-between items-center">
        <div className="flex items-center gap-2">
          <span className="bg-ink-accent/10 text-ink-accent text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border border-ink-accent/30">
            {game.sport}
          </span>
          <span className="text-ink-text/40 text-xs">#{game.visibleId}</span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-ink-paper text-ink-text/60 border border-ink-gray">
            {windowLabel}
          </span>
          <span className="text-[10px] text-ink-text/40">{timeLabel}</span>
        </div>
        <button onClick={onRemove} className="text-ink-text/40 hover:text-status-loss transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Matchup Title */}
      <div className="px-4 py-3 border-b border-ink-gray">
        <h3 className="font-bold text-ink-text text-lg">
          {game.awayTeam.name} <span className="text-ink-text/40 font-normal">@</span> {game.homeTeam.name}
        </h3>
      </div>

      {/* Initial Read / Edge Scan */}
      <div className="px-4 py-3 border-b border-ink-gray bg-ink-base">
        <div className="flex items-center justify-between">
          <span className="text-xs text-ink-text/40 font-medium uppercase tracking-wide">Initial Read</span>
          {!game.edgeSignal && (
            <button 
              onClick={onScan} 
              className="text-xs text-ink-accent hover:text-sky-400 font-medium flex items-center gap-1"
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
          <p className="text-xs text-ink-text/40 mt-1 italic">Run a quick scan to check for injury edges</p>
        )}
      </div>

      {/* Line Shopping Section */}
      <div className="px-4 py-3">
        {/* Line Shopping Section Header */}
        <div className="flex justify-between items-center mb-3">
          <span className="text-xs text-ink-text/40 font-medium uppercase tracking-wide">Line Shopping</span>
          
          {/* Button Group - Only show if no analysis exists yet */}
          {!game.analysis && (
            <div className="flex gap-2">
              {isAnalyzing ? (
                <div className="flex items-center gap-2 bg-ink-accent/10 text-ink-accent px-4 py-2 rounded-xl border border-ink-accent/30">
                  <span className="animate-spin text-sm">⚡</span>
                  <span className="font-bold text-sm">Analyzing...</span>
                </div>
              ) : queuePosition >= 0 ? (
                <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-2">
                  <span className="text-amber-300 font-medium text-sm">
                    ⏳ Queued #{queuePosition + 1}
                  </span>
                  <button
                    onClick={onRemoveFromQueue}
                    className="text-amber-300 hover:text-amber-200 text-sm font-bold"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={onQuickAnalyze}
                    disabled={fetchingOdds}
                    className="text-xs bg-ink-accent hover:bg-sky-500 text-white px-4 py-2 rounded-xl font-bold transition-all shadow-sm disabled:opacity-50 flex items-center gap-1"
                  >
                    <span>⚡</span> Quick Analyze
                  </button>
                  <button
                    onClick={handleFetchLines}
                    disabled={fetchingOdds}
                    className="text-xs bg-ink-base hover:bg-ink-paper text-ink-text/70 border border-ink-gray px-3 py-2 rounded-xl font-bold transition-colors shadow-sm flex items-center gap-1"
                  >
                    <span>🔄</span> Fetch Only
                  </button>
                </>
              )}
            </div>
          )}
          <input type="file" hidden ref={sharpInputRef} accept="image/*" onChange={(e) => handleFileChange(e, 'SHARP')} />
          <input type="file" hidden ref={softInputRef} accept="image/*" onChange={(e) => handleFileChange(e, 'SOFT')} />
        </div>

        {/* Manual Upload Options (Small) */}
        <div className="flex justify-end gap-2 mb-3">
          <button 
            onClick={() => sharpInputRef.current?.click()} 
            className="text-[10px] text-ink-text/40 hover:text-ink-text/60 underline"
          >
            Upload Sharp Img
          </button>
          <button 
            onClick={() => softInputRef.current?.click()} 
            className="text-[10px] text-ink-text/40 hover:text-ink-text/60 underline"
          >
            Upload Soft Img
          </button>
        </div>

        {/* Sharp Lines (Pinnacle) */}
        {game.sharpLines ? (
          <div className="bg-amber-500/10 rounded-xl p-3 mb-3 border border-amber-500/30">
            <div className="text-[10px] font-bold text-amber-300 uppercase mb-2 flex items-center gap-1">
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
            <div className="border-t border-amber-700/30 my-1"></div>
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
          <div className="border-2 border-dashed border-ink-gray rounded-xl p-6 text-center mb-3">
            <p className="text-ink-text/60 text-sm">Fetch lines or upload Pinnacle screenshot</p>
          </div>
        )}

        {/* Fetched Books Checklist */}
        {apiSoftBooks.length > 0 && game.sharpLines && (
          <div className="mb-4 bg-ink-base rounded-xl p-3 border border-ink-gray">
            <h4 className="text-[10px] font-bold text-ink-text/40 uppercase mb-2">Available Soft Books</h4>
            <div className="grid grid-cols-1 gap-2">
              {apiSoftBooks.map((book) => {
                const isSelected = game.softLines.some(sl => sl.bookName === book.bookName);
                const edgeText = calculateEdgeInfo(book);
                
                // Check if this is a preset book (matches active bankroll)
                const isPresetBook = activeBookNames.some(name =>
                  name.toLowerCase().includes(book.bookName.toLowerCase()) ||
                  book.bookName.toLowerCase().includes(name.toLowerCase())
                );

                return (
                  <label key={book.bookName} className="flex items-center gap-3 p-2 bg-ink-paper rounded-lg border border-ink-gray cursor-pointer hover:border-ink-accent transition-colors">
                    <input 
                      type="checkbox" 
                      checked={isSelected} 
                      onChange={() => toggleSoftBook(book)}
                      className="w-5 h-5 text-ink-accent rounded focus:ring-ink-accent border-ink-gray bg-ink-base" 
                    />
                    <div className="flex-1">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-ink-text text-sm flex items-center gap-1">
                          {book.bookName}
                          {isPresetBook && (
                            <span className="text-amber-500 text-xs" title="Matches your bankroll">⭐</span>
                          )}
                        </span>
                        {edgeText && (
                          <span className="text-xs font-bold text-status-win bg-status-win/10 px-2 py-0.5 rounded-full border border-status-win/30">
                            {edgeText}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-ink-text/50 font-mono mt-0.5">
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
      <div className="px-4 py-4 bg-ink-base border-t border-ink-gray">
        {game.analysis ? (
          <div className={`rounded-xl overflow-hidden border border-ink-gray ${
            game.analysis.decision === 'PLAYABLE' 
              ? 'bg-ink-paper text-ink-text border-l-4 border-l-ink-accent' 
              : 'bg-ink-base text-ink-text/70'
          } ${game.analysis.factConfidence && game.analysis.factConfidence !== 'HIGH' ? 'opacity-80' : ''}`}>
            {game.analysis.factConfidence && (
              <div className={`px-4 py-2 text-[10px] font-bold uppercase border-b ${getFactConfidenceStyle(game.analysis.factConfidence)}`}>
                Fact Confidence: {game.analysis.factConfidence}
              </div>
            )}
            {/* Decision Header */}
            <div className="px-4 py-3 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm flex items-center gap-2">
                  {game.analysis.decision === 'PLAYABLE' ? '✅' : '⛔'} 
                  {game.analysis.decision}
                </span>
                {game.analysis.wagerType && (
                  <span className="px-2 py-1 rounded bg-blue-900/50 text-blue-200 text-xs font-mono uppercase tracking-wider">
                    {game.analysis.wagerType}
                  </span>
                )}
              </div>
              {game.analysis.sharpImpliedProb && (
                <span className="text-xs opacity-80 font-mono">
                  Fair: {game.analysis.sharpImpliedProb.toFixed(1)}%
                </span>
              )}
            </div>
            
            {/* The Pick */}
            {game.analysis.decision === 'PLAYABLE' && (game.analysis.pick || (game.analysis.recommendation && game.analysis.recommendation.length > 4)) && (
              <div className="px-4 py-3 bg-ink-base border-t border-ink-gray">
                <div className="font-bold text-xl">
                  {game.analysis.pick || game.analysis.recommendation} {game.analysis.recLine}
                </div>
                <div className="text-sm opacity-80 mt-1">
                  @ {game.analysis.softBestBook} 
                  {game.analysis.lineValueCents && game.analysis.lineValueCents > 0 && (
                    <span className="ml-2 bg-ink-base px-2 py-0.5 rounded-full text-xs border border-ink-gray">
                      +{game.analysis.lineValueCents}¢ value
                    </span>
                  )}
                </div>
              </div>
            )}
            
            {/* Veto Reason */}
            {game.analysis.vetoTriggered && game.analysis.vetoReason && (
              <div className="px-4 py-2 bg-status-loss/10 text-sm border-t border-status-loss/20 text-status-loss">
                <strong>Veto:</strong> {game.analysis.vetoReason}
              </div>
            )}
            
            {/* Research Summary */}
            <details className="text-xs bg-ink-base border-t border-ink-gray">
              <summary className="px-4 py-2 cursor-pointer hover:bg-ink-paper font-medium">
                Research Summary
              </summary>
              <div className="px-4 py-3 whitespace-pre-wrap text-ink-text/70">
                {game.analysis.researchSummary}
              </div>
            </details>
          </div>
        ) : game.analysisError ? (
          /* New: Show error state if Quick Analyze failed */
          <div className="bg-status-loss/10 border border-status-loss/30 rounded-xl p-4">
            <div className="flex items-center gap-2 text-status-loss font-bold text-sm mb-2">
              <span>❌</span> Analysis Failed
            </div>
            <p className="text-status-loss text-xs">{game.analysisError}</p>
            <button
              onClick={onQuickAnalyze}
              className="mt-3 text-xs bg-ink-base hover:bg-ink-paper text-ink-text/80 border border-ink-gray px-4 py-2 rounded-lg font-bold"
            >
              Retry
            </button>
          </div>
        ) : isAnalyzing || queuePosition >= 0 ? (
          /* Analysis in progress or queued - don't show manual button */
          null
        ) : (
          /* Manual flow: Show Run Analysis button only if lines are ready */
          <button 
            onClick={onAnalyze}
            disabled={!game.sharpLines || game.softLines.length === 0}
            className={`w-full py-4 rounded-xl font-bold text-sm transition-all transform hover:scale-[1.02] ${
              !game.sharpLines || game.softLines.length === 0
                ? 'bg-ink-gray text-ink-text/40 cursor-not-allowed'
                : 'bg-ink-accent text-white shadow-sm hover:bg-sky-500'
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
