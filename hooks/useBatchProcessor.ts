import { useState, useCallback } from 'react';
import { useGameContext } from './useGameContext';
import { geminiService, isTimeoutError } from '../services/geminiService';
import { sportsDbService } from '../services/sportsDbService';
import { fetchOddsForGame, getBookmakerLines, SOFT_BOOK_KEYS } from '../services/oddsService';
import { Game, Sport, BookLines, TimeWindowFilter, QueuedGame } from '../types';

export const useBatchProcessor = () => {
  const {
    setIsBatchProcessing,
    setBatchProgress,
    setScanResult,
    addToQueue,
    autoPickBestGames,
    activeBookNames,
    persona,
    bookBalances,
  } = useGameContext();

  const processBatch = useCallback(async (games: any[], windowFilter: TimeWindowFilter, targetSport?: Sport) => {
    if (games.length === 0) return;

    setIsBatchProcessing(true);
    setBatchProgress({
      total: games.length,
      current: 0,
      phase: 'SCANNING',
      statusText: `Starting batch process for ${games.length} games...`,
      sport: targetSport,
    });

    const processedGames: QueuedGame[] = [];

    // Step 1: Scan all games
    for (let i = 0; i < games.length; i++) {
      const apiGame = games[i];
      const sport = (apiGame._sport as Sport) || 'NBA';
      const gameLabel = `${apiGame.away_team} @ ${apiGame.home_team}`;
      
      try {
        setBatchProgress({
          total: games.length,
          current: i + 1,
          phase: 'SCANNING',
          statusText: `[${i + 1}/${games.length}] Fetching rosters for ${gameLabel}...`,
          sport: targetSport,
        });

        // Fetch Ground Truth (Rosters) - Sequential to stay under RPM
        const awayRoster = await sportsDbService.getTeamPlayers((await sportsDbService.searchTeam(apiGame.away_team))?.idTeam || '');
        await new Promise(r => setTimeout(r, 500)); // Throttling
        const homeRoster = await sportsDbService.getTeamPlayers((await sportsDbService.searchTeam(apiGame.home_team))?.idTeam || '');
        await new Promise(r => setTimeout(r, 500)); // Throttling

        setBatchProgress({
          total: games.length,
          current: i + 1,
          phase: 'SCANNING',
          statusText: `[${i + 1}/${games.length}] Auditing ${gameLabel}...`,
          sport: targetSport,
        });

        const gameObj: Game = {
          id: apiGame.id,
          sport,
          date: apiGame.commence_time,
          status: 'Scheduled',
          homeTeam: { name: apiGame.home_team },
          awayTeam: { name: apiGame.away_team }
        };

        const scanResult = await geminiService.quickScanGame(gameObj, { awayRoster, homeRoster });
        if (scanResult.deferred) {
          console.warn(`[Batch] Scan deferred for ${gameLabel} (AI timeout)`);
          continue;
        }
        setScanResult(gameObj.id, scanResult);

        if (scanResult.signal !== 'RED' && scanResult.signal !== 'YELLOW') {
          continue;
        }

        const gameWithScan: QueuedGame = {
          ...gameObj,
          visibleId: (i + 1).toString(),
          addedAt: Date.now(),
          edgeSignal: scanResult.signal,
          edgeDescription: scanResult.description,
          scanResult: scanResult,
          softLines: [],
          autoAnalyze: false,
        };

        processedGames.push(gameWithScan);
      } catch (error) {
        console.error(`Scan failed for ${apiGame.id}:`, error);
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Step 2: Analyze all processed games
    if (processedGames.length > 0) {
      setBatchProgress({
        total: processedGames.length,
        current: 0,
        phase: 'ANALYZING',
        statusText: `Found ${processedGames.length} potential edges. Starting deep analysis...`,
        sport: targetSport,
      });

      for (let i = 0; i < processedGames.length; i++) {
        const game = processedGames[i];
        const gameLabel = `${game.awayTeam.name} @ ${game.homeTeam.name}`;
        
        try {
          setBatchProgress({
            total: processedGames.length,
            current: i + 1,
            phase: 'ANALYZING',
            statusText: `[${i + 1}/${processedGames.length}] Fetching odds for ${gameLabel}...`,
            sport: targetSport,
          });

          let finalizedGame: QueuedGame = { ...game };
          const oddsData = await fetchOddsForGame(game.sport, game.id);
          await new Promise(r => setTimeout(r, 500)); // Throttling

          if (oddsData) {
            const pinnacle = getBookmakerLines(oddsData, 'pinnacle');
            const matchedSoftLines: BookLines[] = [];
            
            SOFT_BOOK_KEYS.forEach(key => {
              const lines = getBookmakerLines(oddsData, key);
              if (lines) {
                // If user has active books, only show those. Otherwise show all available.
                const isMatch = activeBookNames.length === 0 || activeBookNames.some(name => 
                  name.toLowerCase().includes(lines.bookName.toLowerCase()) || 
                  lines.bookName.toLowerCase().includes(name.toLowerCase())
                );
                if (isMatch) matchedSoftLines.push(lines);
              }
            });

            if (pinnacle && matchedSoftLines.length > 0) {
              setBatchProgress({
                total: processedGames.length,
                current: i + 1,
                phase: 'ANALYZING',
                statusText: `[${i + 1}/${processedGames.length}] Running Pro 3 analysis for ${gameLabel}...`,
                sport: targetSport,
              });

              // Fetch Ground Truth (Rosters)
              const awayRoster = await sportsDbService.getTeamPlayers((await sportsDbService.searchTeam(game.awayTeam.name))?.idTeam || '');
              await new Promise(r => setTimeout(r, 500)); // Throttling
              const homeRoster = await sportsDbService.getTeamPlayers((await sportsDbService.searchTeam(game.homeTeam.name))?.idTeam || '');
              await new Promise(r => setTimeout(r, 500)); // Throttling

              let analysisResult;
              try {
                analysisResult = await geminiService.analyzeGame({
                  ...game,
                  sharpLines: pinnacle,
                  softLines: matchedSoftLines
                }, persona, bookBalances, {
                  awayRoster,
                  homeRoster
                });
              } catch (error) {
                if (isTimeoutError(error)) {
                  console.warn(`[Batch] Analysis timeout for ${gameLabel}. Will add without analysis.`);
                } else {
                  throw error;
                }
              }

              finalizedGame = {
                ...finalizedGame,
                sharpLines: pinnacle,
                softLines: matchedSoftLines,
                analysis: analysisResult
              };
            }
          }

          addToQueue(finalizedGame);
        } catch (error) {
          console.error(`Analysis failed for ${game.id}:`, error);
          addToQueue(game);
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Step 3: Trigger Auto-Promotion
    setBatchProgress({
      total: games.length,
      current: games.length,
      phase: 'COMPLETED',
      statusText: 'Batch complete! Generating smart card...',
      sport: targetSport,
    });

    // Small delay to ensure last updateGame has propagated
    await new Promise(resolve => setTimeout(resolve, 500));
    autoPickBestGames(windowFilter);

    // Finalize
    setTimeout(() => {
      setIsBatchProcessing(false);
      setBatchProgress({
        total: 0,
        current: 0,
        phase: 'IDLE',
        statusText: '',
        sport: undefined,
      });
    }, 3000);

  }, [setIsBatchProcessing, setBatchProgress, setScanResult, addToQueue, autoPickBestGames, activeBookNames, persona, bookBalances]);

  return { processBatch };
};
