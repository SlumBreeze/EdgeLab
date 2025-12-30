
import React, { useState, useEffect } from 'react';
import { useGameContext } from '../hooks/useGameContext';
import { extractLinesFromScreenshot, quickScanGame, analyzeGame } from '../services/geminiService';
import QueuedGameCard from '../components/QueuedGameCard';
import { fetchOddsForGame, getBookmakerLines, SOFT_BOOK_KEYS } from '../services/oddsService';
import { BookLines } from '../types';
import { ANALYSIS_QUEUE_DELAY_MS } from '../constants';

export default function Queue() {
  const { queue, removeFromQueue, updateGame, addSoftLines, updateSoftLineBook, setSharpLines, activeBookNames } = useGameContext();
  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set());
  
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

    } catch (error) {
      console.error(`Analysis failed for game ${gameId}:`, error);
      // Update game with error state so the card can display the failure
      updateGame(game.id, { 
        analysisError: error instanceof Error ? error.message : "Analysis failed. Try manual flow."
      });
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
    } else {
      // Nothing running — start immediately
      processAnalysis(gameId);
    }
  };

  const handleRemoveFromQueue = (gameId: string) => {
    setAnalysisQueue(prev => prev.filter(id => id !== gameId));
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
    } catch (e) {
      console.error(e);
      alert("Analysis failed. Please check your inputs and try again.");
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
    } catch (error) {
      console.error(error);
      alert("Failed to extract lines. Please try a clearer image.");
    } finally {
      setAnalyzingIds(prev => {
        const next = new Set(prev);
        next.delete(gameId + type);
        return next;
      });
    }
  };

  return (
    <div className="p-4 max-w-lg mx-auto">
      <header className="mb-6 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-800">Analysis Queue</h1>
        <span className="bg-coral-100 text-coral-600 text-xs px-3 py-1.5 rounded-full font-bold">
          {queue.length} Games
        </span>
      </header>

      {queue.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <p className="mb-2 text-5xl">📋</p>
          <p className="text-slate-500 font-medium">Your queue is empty.</p>
          <p className="text-sm text-slate-400 mt-1">Go to Scout to add games.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {queue.map(game => (
            <QueuedGameCard
              key={game.id}
              game={game}
              queuePosition={analysisQueue.indexOf(game.id)}
              isAnalyzing={activeAnalysisId === game.id}
              onQuickAnalyze={() => handleQuickAnalyze(game.id)}
              onRemoveFromQueue={() => handleRemoveFromQueue(game.id)}
              loading={analyzingIds.has(game.id) || analyzingIds.has(game.id + 'SHARP') || analyzingIds.has(game.id + 'SOFT')}
              onRemove={() => removeFromQueue(game.id)}
              onScan={() => handleScan(game.id)}
              onAnalyze={() => handleAnalyze(game.id)}
              onUploadSharp={(f) => handleFileUpload(game.id, 'SHARP', f)}
              onUploadSoft={(f) => handleFileUpload(game.id, 'SOFT', f)}
              onUpdateSoftBook={(idx, name) => updateSoftLineBook(game.id, idx, name)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
