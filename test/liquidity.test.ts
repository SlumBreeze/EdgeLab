import { describe, it, expect, vi } from 'vitest';
import { getRecommendedBook } from '../utils/calculations';
import { analyzeGame, geminiService } from '../services/geminiService';
import { BookBalanceDisplay, QueuedGame } from '../types';

// Mock geminiService.quickScanGame to avoid external calls
vi.mock('../services/geminiService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/geminiService')>();
  return {
    ...actual,
    quickScanGame: vi.fn().mockResolvedValue({
      signal: 'YELLOW',
      description: 'Test scan',
      injuryContext: 'None',
      situationalContext: 'None',
      gameScript: 'Neutral'
    })
  };
});

describe('getRecommendedBook with Liquidity Filter', () => {
  const mockBalances: BookBalanceDisplay[] = [
    { sportsbook: 'FanDuel', currentBalance: 0, deposited: 1000, withdrawn: 1000 },
    { sportsbook: 'DraftKings', currentBalance: 200, deposited: 500, withdrawn: 300 },
    { sportsbook: 'BetMGM', currentBalance: 50, deposited: 100, withdrawn: 50 }
  ];

  it('should skip a book with $0.00 balance and pick the next best funded book', () => {
    // In this scenario, FanDuel has $0.
    const candidateBooks: string[] = ['FanDuel', 'DraftKings'];
    const result = getRecommendedBook(candidateBooks, mockBalances);
    expect(result.book).toBe('DraftKings');
    expect(result.status).toBe('SUFFICIENT');
  });

  it('should return null if all candidate books have $0.00 balance', () => {
    const zeroBalances: BookBalanceDisplay[] = [
      { sportsbook: 'FanDuel', currentBalance: 0, deposited: 100, withdrawn: 100 },
      { sportsbook: 'DraftKings', currentBalance: 0, deposited: 100, withdrawn: 100 }
    ];
    const candidateBooks: string[] = ['FanDuel', 'DraftKings'];
    const result = getRecommendedBook(candidateBooks, zeroBalances);
    expect(result.book).toBeNull();
  });
});

describe('analyzeGame with Liquidity Filter', () => {
  const mockGame: QueuedGame = {
    id: 'game1',
    visibleId: 'G1',
    sport: 'NBA',
    date: new Date().toISOString(),
    homeTeam: { name: 'Lakers' },
    awayTeam: { name: 'Celtics' },
    status: 'SCHEDULED',
    addedAt: Date.now(),
    sharpLines: {
      bookName: 'Pinnacle',
      mlOddsA: '+100',
      mlOddsB: '-100',
      spreadLineA: '+1',
      spreadOddsA: '-110',
      spreadLineB: '-1',
      spreadOddsB: '-110',
      totalLine: '220',
      totalOddsOver: '-110',
      totalOddsUnder: '-110'
    },
    softLines: [
      {
        bookName: 'FanDuel',
        mlOddsA: '+150', // Best edge but unfunded
        mlOddsB: '-150',
        spreadLineA: '+1',
        spreadOddsA: '-110',
        spreadLineB: '-1',
        spreadOddsB: '-110',
        totalLine: '220',
        totalOddsOver: '-110',
        totalOddsUnder: '-110'
      },
      {
        bookName: 'DraftKings',
        mlOddsA: '+120', // Second best edge, funded
        mlOddsB: '-120',
        spreadLineA: '+1',
        spreadOddsA: '-110',
        spreadLineB: '-1',
        spreadOddsB: '-110',
        totalLine: '220',
        totalOddsOver: '-110',
        totalOddsUnder: '-110'
      }
    ]
  };

  const mockBalances: BookBalanceDisplay[] = [
    { sportsbook: 'FanDuel', currentBalance: 0, deposited: 100, withdrawn: 100 },
    { sportsbook: 'DraftKings', currentBalance: 500, deposited: 500, withdrawn: 0 }
  ];

  const lowEdgePersona = {
    user_id: '123',
    min_edge_percentage: 0.1,
    volume_mode: 'Standard',
    max_odds_american: -175,
    risk_tolerance: 'Balanced',
    active_sports: ['NBA']
  };

  it('should pivot to the next best funded book if best book is unfunded', async () => {
    // Mock the AI call
    vi.spyOn(geminiService, 'generateWithFallback').mockResolvedValue({
      text: JSON.stringify({
        recommendation: 'BET',
        confidence: 80,
        reasoning: 'Pivot test.',
        handicapper_logic: 'Funded book test.',
        trueProbability: 50,
        impliedProbability: 45.5,
        edge: 4.5,
        wagerType: 'Moneyline'
      })
    });

    const result = await analyzeGame(mockGame, lowEdgePersona as any, mockBalances);
    
    expect(result.decision).toBe('PLAYABLE');
    expect(result.softBestBook).toBe('DraftKings'); // Pivoted from FanDuel
    expect(result.impliedProbability).toBeCloseTo(45.5, 1); // DraftKings +120
  });

  it('should trigger INSUFFICIENT_FUNDS_FOR_EDGE if no funded +EV books exist', async () => {
    const allUnfundedBalances: BookBalanceDisplay[] = [
      { sportsbook: 'FanDuel', currentBalance: 0, deposited: 100, withdrawn: 100 },
      { sportsbook: 'DraftKings', currentBalance: 0, deposited: 100, withdrawn: 100 }
    ];

    const result = await analyzeGame(mockGame, lowEdgePersona as any, allUnfundedBalances);
    
    expect(result.decision).toBe('PASS');
    expect(result.vetoTriggered).toBe(true);
    expect(result.vetoReason).toContain('INSUFFICIENT_FUNDS_FOR_EDGE');
  });
});

describe('refreshAnalysisMathOnly with Liquidity Filter', () => {
  const mockGame: QueuedGame = {
    id: 'game1',
    visibleId: 'G1',
    sport: 'NBA',
    date: new Date().toISOString(),
    homeTeam: { name: 'Lakers' },
    awayTeam: { name: 'Celtics' },
    status: 'SCHEDULED',
    addedAt: Date.now(),
    sharpLines: {
      bookName: 'Pinnacle',
      mlOddsA: '+100',
      mlOddsB: '-100',
      spreadLineA: '+1',
      spreadOddsA: '-110',
      spreadLineB: '-1',
      spreadOddsB: '-110',
      totalLine: '220',
      totalOddsOver: '-110',
      totalOddsUnder: '-110'
    },
    softLines: [
      {
        bookName: 'FanDuel',
        mlOddsA: '+150', // Best edge, unfunded
        mlOddsB: '-150',
        spreadLineA: '+1',
        spreadOddsA: '-110',
        spreadLineB: '-1',
        spreadOddsB: '-110',
        totalLine: '220',
        totalOddsOver: '-110',
        totalOddsUnder: '-110'
      }
    ],
    analysis: {
      decision: 'PLAYABLE',
      side: 'AWAY',
      market: 'Moneyline',
      softBestBook: 'FanDuel',
      softBestOdds: '+150'
    } as any
  };

  it('should veto in refresh if the only +EV book becomes unfunded', () => {
    const unfundedBalances: BookBalanceDisplay[] = [
      { sportsbook: 'FanDuel', currentBalance: 0, deposited: 100, withdrawn: 100 }
    ];

    const result = geminiService.refreshAnalysisMathOnly(mockGame, undefined, unfundedBalances);
    
    expect(result.decision).toBe('PASS');
    expect(result.vetoReason).toContain('INSUFFICIENT_FUNDS_FOR_EDGE');
  });

  it('should pivot in refresh to a funded +EV book', () => {
    const gameWithTwoBooks: QueuedGame = {
      ...mockGame,
      softLines: [
        ...mockGame.softLines,
        {
          bookName: 'DraftKings',
          mlOddsA: '+120', // Second best, funded
          mlOddsB: '-120',
          spreadLineA: '+1',
          spreadOddsA: '-110',
          spreadLineB: '-1',
          spreadOddsB: '-110',
          totalLine: '220',
          totalOddsOver: '-110',
          totalOddsUnder: '-110'
        }
      ]
    };

    const mixedBalances: BookBalanceDisplay[] = [
      { sportsbook: 'FanDuel', currentBalance: 0, deposited: 100, withdrawn: 100 },
      { sportsbook: 'DraftKings', currentBalance: 100, deposited: 100, withdrawn: 0 }
    ];

    const result = geminiService.refreshAnalysisMathOnly(gameWithTwoBooks, undefined, mixedBalances);
    
    expect(result.decision).toBe('PLAYABLE');
    expect(result.softBestBook).toBe('DraftKings');
  });
});
