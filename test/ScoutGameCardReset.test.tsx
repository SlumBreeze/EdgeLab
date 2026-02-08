import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import ScoutGameCard from '../components/ScoutGameCard';
import { Sport, ScanResult } from '../types';

describe('ScoutGameCard Reset Button', () => {
  const mockGame = {
    id: 'game1',
    commence_time: new Date().toISOString(),
    home_team: 'Lakers',
    away_team: 'Celtics'
  };

  const mockScanResult: ScanResult = {
    signal: 'YELLOW',
    description: 'Rested Heat face tired Wizards',
    injuryContext: 'None',
    situationalContext: 'B2B'
  };

  const defaultProps = {
    game: mockGame,
    sport: 'NBA' as Sport,
    pinnLines: null,
    referenceLines: undefined,
    scanResult: undefined,
    isScanning: false,
    isBatchScanning: false,
    inQueue: false,
    movement: null,
    onQuickScan: vi.fn(),
    onAddToQueue: vi.fn(),
    mapToGameObject: vi.fn((g, s) => ({
      id: g.id,
      sport: s,
      date: g.commence_time,
      status: 'Scheduled',
      homeTeam: { name: g.home_team },
      awayTeam: { name: g.away_team }
    })),
    onClearScan: vi.fn() // New prop we expect to add
  };

  it('should NOT show the reset button when no scan result exists', () => {
    render(<ScoutGameCard {...defaultProps} />);
    expect(screen.queryByRole('button', { name: /✕/i })).not.toBeInTheDocument();
  });

  it('should show the reset button when a scan result exists', () => {
    render(<ScoutGameCard {...defaultProps} scanResult={mockScanResult} />);
    expect(screen.getByRole('button', { name: /✕/i })).toBeInTheDocument();
  });

  it('should call onClearScan when the reset button is clicked', () => {
    const onClearScan = vi.fn();
    render(<ScoutGameCard {...defaultProps} scanResult={mockScanResult} onClearScan={onClearScan} />);
    
    const resetButton = screen.getByRole('button', { name: /✕/i });
    fireEvent.click(resetButton);
    
    expect(onClearScan).toHaveBeenCalledWith(mockGame.id);
  });
});
