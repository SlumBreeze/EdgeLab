import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import Scout from '../pages/Scout';
import { useGameContext } from '../hooks/useGameContext';

// Mock the context
vi.mock('../hooks/useGameContext', () => ({
  useGameContext: vi.fn()
}));

// Mock Toast
vi.mock('../components/Toast', () => ({
  useToast: () => ({
    addToast: vi.fn()
  }),
  createToastHelpers: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showInfo: vi.fn()
  }),
  ToastProvider: ({ children }: any) => <div>{children}</div>
}));

// Mock the batch processor hook
vi.mock('../hooks/useBatchProcessor', () => ({
  useBatchProcessor: () => ({
    processBatch: vi.fn()
  })
}));

describe('Scout Page Individual Reset', () => {
  const mockClearScanResults = vi.fn();
  
  // Match Scout.tsx date formatting
  const today = new Date();
  const formatEtDate = (date: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  
  const todayEtStr = formatEtDate(today);
  
  // Create a time that is definitely today ET and in the future
  // Using a safe ISO-like format that new Date() handles well
  const futureTime = new Date(today.getTime() + 4 * 60 * 60 * 1000).toISOString();

  const mockContext = {
    addToQueue: vi.fn(),
    addAllToQueue: vi.fn(),
    queue: [],
    scanResults: {
      'game1': { signal: 'YELLOW', description: 'Test scan' }
    },
    setScanResult: vi.fn(),
    clearScanResults: mockClearScanResults,
    referenceLines: {},
    setReferenceLine: vi.fn(),
    allSportsData: {
      'NBA': [{ 
        id: 'game1', 
        commence_time: futureTime,
        home_team: 'Lakers', 
        away_team: 'Celtics' 
      }]
    },
    loadSlates: vi.fn(),
    isBatchProcessing: false,
    batchProgress: { phase: 'IDLE', current: 0, total: 0, statusText: '' },
    getSportBatchProgress: vi.fn(() => ({ isProcessing: false, current: 0, total: 0 })),
    getProcessableGamesForSport: vi.fn(() => [])
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useGameContext as any).mockReturnValue(mockContext);
  });

  it('should call clearScanResults with the specific game ID when handleClearSingleScan is triggered', async () => {
    render(<Scout />);
    
    // The Scout page should now render the game card because:
    // 1. Slates are loaded (allSportsData has keys)
    // 2. The game's ET date matches selectedDate (todayEtStr)
    // 3. The game is upcoming (futureTime > now)
    
    const resetButton = screen.getByRole('button', { name: /✕/i });
    fireEvent.click(resetButton);
    
    expect(mockClearScanResults).toHaveBeenCalledWith(['game1']);
  });
});
