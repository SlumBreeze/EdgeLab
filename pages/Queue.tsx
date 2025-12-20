import React, { useState } from 'react';
import { useGameContext } from '../hooks/useGameContext';
import { extractLinesFromScreenshot, quickScanGame, analyzeGame } from '../services/geminiService';
import QueuedGameCard from '../components/QueuedGameCard';

export default function Queue() {
  const { queue, removeFromQueue, updateGame, addSoftLines, updateSoftLineBook, setSharpLines } = useGameContext();
  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set());

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