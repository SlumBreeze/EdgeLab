import React, { useState, useEffect } from 'react';
import { useGameContext } from '../hooks/useGameContext';
import { extractLinesFromScreenshot, quickScanGame, analyzeGame } from '../services/geminiService';
import QueuedGameCard from '../components/QueuedGameCard';
import SwipeableCard from '../components/SwipeableCard';
import { fetchOddsForGame, getBookmakerLines, SOFT_BOOK_KEYS } from '../services/oddsService';
import { BookLines } from '../types';
import { ANALYSIS_QUEUE_DELAY_MS } from '../constants';
import { useToast, createToastHelpers } from '../components/Toast';

export default function Queue() {
  const { queue, removeFromQueue, updateGame, addSoftLines, updateSoftLineBook, setSharpLines, activeBookNames } = useGameContext();
  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set());
  
  // Toast
  const { addToast } = useToast();
  const toast = createToastHelpers(addToast);
  
  // Sequential Queue State
  const [analysisQueue, setAnalysisQueue] = useState<string[]>([]);
  const [activeAnalysisId, setActiveAnalysisId] = useState<string | null>(null);
  const [analysisStartTime, setAnalysisStartTime] = useState<number | null>(null);

  // Queue Processor
  useEffect(() => {
    // Only proceed if nothing is actively analyzing and there are queued items
    if (activeAnalysisId || analysisQueue.length === 0) {
      return;
    }

    // Calculate how long to wait before starting the next analysis
    let delay = 0;
    if (analysisStartTime) {
      const elapsed = Date.now() - analysisStartTime;
      delay = Math.max(0, ANALYSIS_QUEUE_DELAY_MS - elapsed);
    }

    const timerId = setTimeout(() => {
      const nextGameId = analysisQueue[0];
      setAnalysisQueue(prev => prev.slice(1));
      processAnalysis(nextGameId);
    }, delay);

    return () => clearTimeout(timerId);
  }, [activeAnalysisId, analysisQueue, analysisStartTime]);

  const processAnalysis = async (gameId: string) => {
    const game = queue.find(g => g.id === gameId);
    if (!game) return;

    setActiveAnalysisId(gameId);
    setAnalysisStartTime(Date.now());

    try {
      // Step 1: Fetch lines from API
      const data = await fetchOddsForGame(game.sport, game.id);
      if (!data) {
        throw new Error("Could not fetch lines for this game.");
      }

      // Step 2: Extract and set sharp lines (Pinnacle)
      const pinnacle = getBookmakerLines(data, 'pinnacle');
      if (!pinnacle) {
        throw new Error("Pinnacle lines not available. Cannot analyze without sharp reference.");
      }
      setSharpLines(game.id, pinnacle);

      // Step 3: Auto-select soft books matching active bankroll
      const matchedSoftLines: BookLines[] = [];
      SOFT_BOOK_KEYS.forEach(key => {
        const lines = getBookmakerLines(data, key);
        if (lines) {
          const displayName = lines.bookName;
          const isActiveBook = activeBookNames.some(name =>
            name.toLowerCase().includes(displayName.toLowerCase()) ||
            displayName.toLowerCase().includes(name.toLowerCase())
          );
          if (isActiveBook) {
            matchedSoftLines.push(lines);
          }
        }
      });

      if (matchedSoftLines.length === 0) {
        throw new Error("None of your active sportsbooks have lines for this game.");
      }

      // Step 4: Update game with sharp and soft lines
      updateGame(game.id, { sharpLines: pinnacle, softLines: matchedSoftLines });

      // Step 5: Run v3 analysis
      const result = await analyzeGame({
        ...game,
        sharpLines: pinnacle,
        softLines: matchedSoftLines
      });
      
      updateGame(game.id, { analysis: result, analysisError: undefined });
      
      if (result.decision === 'PLAYABLE') {
        toast.showSuccess(`Analysis Complete: PLAYABLE (${game.awayTeam.name})`);
      } else {
        toast.showInfo(`Analysis Complete: PASS (${game.awayTeam.name})`);
      }

    } catch (error) {
      console.error(`Analysis failed for game ${gameId}:`, error);
      // Update game with error state so the card can display the failure
      const errorMessage = error instanceof Error ? error.message : "Analysis failed. Try manual flow.";
      updateGame(game.id, { analysisError: errorMessage });
      toast.showError(`Analysis failed: ${errorMessage}`);
    } finally {
      setActiveAnalysisId(null);
      // Note: Don't clear analysisStartTime here - the effect needs it to calculate next delay
    }
  };

  const handleQuickAnalyze = (gameId: string) => {
    // Don't allow duplicate entries in queue
    if (analysisQueue.includes(gameId) || activeAnalysisId === gameId) {
      return;
    }

    // Check if game already has analysis
    const game = queue.find(g => g.id === gameId);
    if (game?.analysis) {
      return;
    }

    if (activeAnalysisId) {
      // Another analysis is running — add to queue
      setAnalysisQueue(prev => [...prev, gameId]);
      toast.showInfo("Added to analysis queue");
    } else {
      // Nothing running — start immediately
      processAnalysis(gameId);
    }
  };

  const handleAnalyzeAll = () => {
    const gamesToAnalyze = queue.filter(g => 
      !g.analysis && 
      !g.analysisError &&
      !analysisQueue.includes(g.id) && 
      activeAnalysisId !== g.id
    );

    if (gamesToAnalyze.length === 0) {
      toast.showInfo("No eligible games to analyze.");
      return;
    }

    const ids = gamesToAnalyze.map(g => g.id);
    setAnalysisQueue(prev => [...prev, ...ids]);
    toast.showSuccess(`Queued ${ids.length} games for analysis.`);
  };

  const pendingCount = queue.filter(g => !g.analysis && !g.analysisError && !analysisQueue.includes(g.id) && activeAnalysisId !== g.id).length;

  const handleRemoveFromQueue = (gameId: string) => {
    setAnalysisQueue(prev => prev.filter(id => id !== gameId));
    toast.showInfo("Removed from analysis queue");
  };

  const handleManualRemove = (gameId: string) => {
    removeFromQueue(gameId);
    toast.showInfo("Removed from queue");
  };

  const handleScan = async (gameId: string) => {
    const game = queue.find(g => g.id === gameId);
    if (!game) return;
    
    setAnalyzingIds(prev => new Set(prev).add(gameId));
    const result = await quickScanGame(game);
    updateGame(gameId, { edgeSignal: result.signal, edgeDescription: result.description });
    setAnalyzingIds(prev => {
      const next = new Set(prev);
      next.delete(gameId);
      return next;
    });
  };

  const handleAnalyze = async (gameId: string) => {
    const game = queue.find(g => g.id === gameId);
    if (!game) return;

    setAnalyzingIds(prev => new Set(prev).add(gameId));
    try {
      const result = await analyzeGame(game);
      updateGame(gameId, { analysis: result });
      
      if (result.decision === 'PLAYABLE') {
        toast.showSuccess("Analysis: PLAYABLE");
      } else {
        toast.showInfo("Analysis: PASS");
      }
    } catch (e) {
      console.error(e);
      toast.showError("Analysis failed. Please check inputs.");
    } finally {
      setAnalyzingIds(prev => {
        const next = new Set(prev);
        next.delete(gameId);
        return next;
      });
    }
  };

  const handleFileUpload = async (gameId: string, type: 'SHARP' | 'SOFT', file: File) => {
    try {
      setAnalyzingIds(prev => new Set(prev).add(gameId + type));
      const lines = await extractLinesFromScreenshot(file);
      
      if (type === 'SHARP') {
        setSharpLines(gameId, lines);
      } else {
        addSoftLines(gameId, lines);
      }
      toast.showSuccess(`Lines extracted from ${type} screenshot`);
    } catch (error) {
      console.error(error);
      toast.showError("Failed to extract lines. Try a clearer image.");
    } finally {
      setAnalyzingIds(prev => {
        const next = new Set(prev);
        next.delete(gameId + type);
        return next;
      });
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="max-w-lg mx-auto pb-24">
        <header className="mb-6 flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-slate-800">Analysis Queue</h1>
            <span className="bg-coral-100 text-coral-600 text-xs px-3 py-1.5 rounded-full font-bold">
              {queue.length} Games
            </span>
          </div>
          
          {pendingCount > 0 && (
            <button 
                onClick={handleAnalyzeAll}
                className="w-full py-3 bg-gradient-to-r from-slate-700 to-slate-900 hover:from-slate-800 hover:to-black text-white rounded-xl font-bold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
            >
                <span className="animate-pulse">⚡</span> 
                {analysisQueue.length > 0 ? `Queued (${analysisQueue.length}) — Add ${pendingCount} More` : `Analyze Remaining (${pendingCount})`}
            </button>
          )}
        </header>
        
        {/* Swipe Hint */}
        {queue.length > 0 && (
          <div className="text-center text-[10px] text-slate-400 italic mb-2 animate-pulse">
            ← Swipe left on cards to remove
          </div>
        )}

        {queue.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm">
            <p className="mb-2 text-5xl">📋</p>
            <p className="text-slate-500 font-medium">Your queue is empty.</p>
            <p className="text-sm text-slate-400 mt-1">Go to Scout to add games.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {queue.map(game => (
              <SwipeableCard
                key={game.id}
                onSwipeLeft={() => handleManualRemove(game.id)}
                leftAction={{ label: 'Remove', icon: '🗑️', color: 'bg-red-500' }}
                disabled={activeAnalysisId === game.id || analysisQueue.includes(game.id) || analyzingIds.has(game.id) || analyzingIds.has(game.id + 'SHARP') || analyzingIds.has(game.id + 'SOFT')}
              >
                <QueuedGameCard
                  game={game}
                  queuePosition={analysisQueue.indexOf(game.id)}
                  isAnalyzing={activeAnalysisId === game.id}
                  onQuickAnalyze={() => handleQuickAnalyze(game.id)}
                  onRemoveFromQueue={() => handleRemoveFromQueue(game.id)}
                  loading={analyzingIds.has(game.id) || analyzingIds.has(game.id + 'SHARP') || analyzingIds.has(game.id + 'SOFT')}
                  onRemove={() => handleManualRemove(game.id)}
                  onScan={() => handleScan(game.id)}
                  onAnalyze={() => handleAnalyze(game.id)}
                  onUploadSharp={(f) => handleFileUpload(game.id, 'SHARP', f)}
                  onUploadSoft={(f) => handleFileUpload(game.id, 'SOFT', f)}
                  onUpdateSoftBook={(idx, name) => updateSoftLineBook(game.id, idx, name)}
                />
              </SwipeableCard>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}