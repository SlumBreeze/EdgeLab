import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useBatchProcessor } from '../hooks/useBatchProcessor';
import { useGameContext } from '../hooks/useGameContext';
import { geminiService } from '../services/geminiService';
import { fetchOddsForGame, getBookmakerLines } from '../services/oddsService';

// Mock dependencies
vi.mock('../hooks/useGameContext', () => ({
  useGameContext: vi.fn()
}));

vi.mock('../services/geminiService', () => ({
  geminiService: {
    quickScanGame: vi.fn(),
    analyzeGame: vi.fn()
  }
}));

vi.mock('../services/oddsService', () => ({
  fetchOddsForGame: vi.fn(),
  getBookmakerLines: vi.fn(),
  SOFT_BOOK_KEYS: ['draftkings', 'fanduel']
}));

describe('useBatchProcessor', () => {
  const mockSetIsBatchProcessing = vi.fn();
  const mockSetBatchProgress = vi.fn();
  const mockAddToQueue = vi.fn();
  const mockUpdateGame = vi.fn();
  const mockAutoPickBestGames = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useGameContext as any).mockReturnValue({
      setIsBatchProcessing: mockSetIsBatchProcessing,
      setBatchProgress: mockSetBatchProgress,
      addToQueue: mockAddToQueue,
      updateGame: mockUpdateGame,
      autoPickBestGames: mockAutoPickBestGames,
      userId: 'user123',
      activeBookNames: ['DraftKings'],
      queue: []
    });
  });

  it('should process a batch of games sequentially', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useBatchProcessor());
    
    const mockGames = [
      { id: 'g1', home_team: 'Team A', away_team: 'Team B', commence_time: '2026-02-04T20:00:00Z', _sport: 'NBA' }
    ];

    (geminiService.quickScanGame as any).mockResolvedValue({ signal: 'WHITE', description: 'Scan ok' });
    (fetchOddsForGame as any).mockResolvedValue({ id: 'g1' });
    (getBookmakerLines as any).mockImplementation((data, book) => {
      if (book === 'pinnacle') return { bookName: 'Pinnacle', mlOddsA: '-110', mlOddsB: '-110' };
      if (book === 'draftkings') return { bookName: 'DraftKings', mlOddsA: '-105', mlOddsB: '-115' };
      return null;
    });
    (geminiService.analyzeGame as any).mockResolvedValue({ decision: 'PASS' });

    await act(async () => {
      const promise = result.current.processBatch(mockGames as any, 'EVENING');
      // Run timers multiple times to handle the new delay and finalize
      await vi.runAllTimersAsync();
      await promise;
    });

    expect(mockSetIsBatchProcessing).toHaveBeenCalledWith(true);
    expect(mockAddToQueue).toHaveBeenCalled();
    expect(mockUpdateGame).toHaveBeenCalled();
    expect(mockSetIsBatchProcessing).toHaveBeenCalledWith(false);
    expect(mockAutoPickBestGames).toHaveBeenCalledWith('EVENING');
    vi.useRealTimers();
  });
});
