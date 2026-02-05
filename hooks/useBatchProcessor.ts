import { useState, useCallback } from 'react';
import { useGameContext } from './useGameContext';
import { geminiService } from '../services/geminiService';
import { fetchOddsForGame, getBookmakerLines, SOFT_BOOK_KEYS } from '../services/oddsService';
import { Game, Sport, BookLines, TimeWindowFilter, QueuedGame } from '../types';

export const useBatchProcessor = () => {
  const {
    setIsBatchProcessing,
    setBatchProgress,
    addToQueue,
    updateGame,
    autoPickBestGames,
    activeBookNames,
    persona,
    userId
  } = useGameContext();

  const processBatch = useCallback(async (games: any[], windowFilter: TimeWindowFilter) => {
    if (games.length === 0) return;

    setIsBatchProcessing(true);
    setBatchProgress({
      total: games.length,
      current: 0,
      phase: 'SCANNING',
      statusText: `Starting batch process for ${games.length} games...`
    });

    const processedGames: QueuedGame[] = [];

    // Step 1: Scan all games
    for (let i = 0; i < games.length; i++) {
      const apiGame = games[i];
      const sport = (apiGame._sport as Sport) || 'NBA';
      
      setBatchProgress({
        total: games.length,
        current: i + 1,
        phase: 'SCANNING',
        statusText: `Scanning ${i + 1}/${games.length}: ${apiGame.away_team} @ ${apiGame.home_team}`
      });

      const gameObj: Game = {
        id: apiGame.id,
        sport,
        date: apiGame.commence_time,
        status: 'Scheduled',
        homeTeam: { name: apiGame.home_team },
        awayTeam: { name: apiGame.away_team }
      };

      try {
        const scanResult = await geminiService.quickScanGame(gameObj);
        const gameWithScan: QueuedGame = {
          ...gameObj,
          visibleId: (i + 1).toString(), // Temporary visible ID
          addedAt: Date.now(),
          edgeSignal: scanResult.signal,
          edgeDescription: scanResult.description,
          scanResult: scanResult,
          softLines: [],
          autoAnalyze: false // We will handle analysis manually in the next step
        };
        
        addToQueue(gameWithScan);
        processedGames.push(gameWithScan);
      } catch (error) {
        console.error(`Scan failed for ${apiGame.id}:`, error);
      }
      
      // Small delay to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Step 2: Analyze all processed games
    setBatchProgress({
      total: games.length,
      current: 0,
      phase: 'ANALYZING',
      statusText: `Analyzing scanned games...`
    });

    for (let i = 0; i < processedGames.length; i++) {
      const game = processedGames[i];
      
      setBatchProgress({
        total: games.length,
        current: i + 1,
        phase: 'ANALYZING',
        statusText: `Analyzing ${i + 1}/${processedGames.length}: ${game.awayTeam.name} @ ${game.homeTeam.name}`
      });

      try {
        const oddsData = await fetchOddsForGame(game.sport, game.id);
        if (oddsData) {
          const pinnacle = getBookmakerLines(oddsData, 'pinnacle');
          const matchedSoftLines: BookLines[] = [];
          
          SOFT_BOOK_KEYS.forEach(key => {
            const lines = getBookmakerLines(oddsData, key);
            if (lines) {
              const isMatch = activeBookNames.some(name => 
                name.toLowerCase().includes(lines.bookName.toLowerCase()) || 
                lines.bookName.toLowerCase().includes(name.toLowerCase())
              );
              if (isMatch) matchedSoftLines.push(lines);
            }
          });

          if (pinnacle && matchedSoftLines.length > 0) {
            const analysisResult = await geminiService.analyzeGame({
              ...game,
              sharpLines: pinnacle,
              softLines: matchedSoftLines
            }, persona);

            updateGame(game.id, {
              sharpLines: pinnacle,
              softLines: matchedSoftLines,
              analysis: analysisResult
            });
          }
        }
      } catch (error) {
        console.error(`Analysis failed for ${game.id}:`, error);
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Step 3: Trigger Auto-Promotion
    setBatchProgress({
      total: games.length,
      current: games.length,
      phase: 'COMPLETED',
      statusText: 'Batch complete! Generating smart card...'
    });

    autoPickBestGames(windowFilter);

    // Finalize
    setTimeout(() => {
      setIsBatchProcessing(false);
      setBatchProgress({
        total: 0,
        current: 0,
        phase: 'IDLE',
        statusText: ''
      });
    }, 3000);

  }, [setIsBatchProcessing, setBatchProgress, addToQueue, updateGame, autoPickBestGames, activeBookNames, persona, userId]);

  return { processBatch };
};
