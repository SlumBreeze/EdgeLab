import { describe, it, expect, vi, beforeEach } from 'vitest';
import { geminiService } from '../services/geminiService';
import { QueuedGame, UserPersona, AnalysisResult, BookBalanceDisplay } from '../types';

// Mock Supabase
vi.mock('../services/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: null }))
        }))
      }))
    }))
  }
}));

describe('Veto System with Persona and Rebalancing', () => {
  const mockGame: QueuedGame = {
    id: 'game1',
    visibleId: 'G1',
    sport: 'NBA',
    date: '2026-02-04',
    homeTeam: { name: 'Lakers' },
    awayTeam: { name: 'Celtics' },
    status: 'SCHEDULED',
    addedAt: Date.now(),
    softLines: [
      {
        bookName: 'FanDuel',
        spreadLineA: '-5.5',
        spreadOddsA: '-110',
        spreadLineB: '+5.5',
        spreadOddsB: '-110',
        totalLine: '220.5',
        totalOddsOver: '-110',
        totalOddsUnder: '-110',
        mlOddsA: '-150',
        mlOddsB: '+130',
      }
    ],
    sharpLines: {
      bookName: 'Pinnacle',
      spreadLineA: '-5',
      spreadOddsA: '-110',
      spreadLineB: '+5',
      spreadOddsB: '-110',
      totalLine: '220',
      totalOddsOver: '-110',
      totalOddsUnder: '-110',
      mlOddsA: '-200',
      mlOddsB: '+170',
    }
  };

  const mockBalances: BookBalanceDisplay[] = [
    { sportsbook: 'FanDuel', currentBalance: 1000, deposited: 1000, withdrawn: 0 },
    { sportsbook: 'DraftKings', currentBalance: 200, deposited: 500, withdrawn: 300 }
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    
    vi.spyOn(geminiService, 'quickScanGame').mockResolvedValue({
      signal: 'WHITE',
      description: 'Mocked scan',
      injuryContext: 'None',
      situationalContext: 'None',
      gameScript: 'None'
    });

    vi.spyOn(geminiService, 'generateWithFallback').mockResolvedValue({
      text: JSON.stringify({
        recommendation: 'BET',
        confidence: 80,
        reasoning: 'Strong edge found.',
        handicapper_logic: 'Roster is healthy and statistical edge is significant.',
        trueProbability: 60,
        impliedProbability: 55,
        edge: 5,
        wagerType: 'Moneyline',
        riskFactors: [],
        trapAlert: '',
        expertSentiment: 'Agree with play.'
      })
    });
  });

  it('should respect min_edge_percentage from persona', async () => {
    const highEdgePersona: UserPersona = {
      user_id: '123',
      min_edge_percentage: 10.0,
      volume_mode: 'High Action',
      max_odds_american: -175,
      risk_tolerance: 'Balanced',
      active_sports: ['NBA']
    };

    const result = await geminiService.analyzeGame(mockGame, highEdgePersona, mockBalances);
    expect(result.decision).toBe('PASS');
    expect(result.vetoReason).toContain('NO_EDGE');
  });

  it('should include recommendedBook in AnalysisResult', async () => {
    const lowEdgePersona: UserPersona = {
      user_id: '123',
      min_edge_percentage: 0.1,
      volume_mode: 'High Action',
      max_odds_american: -175,
      risk_tolerance: 'Balanced',
      active_sports: ['NBA']
    };

    const result = await geminiService.analyzeGame(mockGame, lowEdgePersona, mockBalances);
    expect(result.decision).toBe('PLAYABLE');
    expect(result.recommendedBook).toBe('FanDuel');
    expect(result.balanceStatus).toBe('SUFFICIENT');
  });

  it('should respect max_odds_american from persona in refreshAnalysisMathOnly', () => {
    const tightOddsPersona: UserPersona = {
      user_id: '123',
      min_edge_percentage: 0.1,
      volume_mode: 'High Action',
      max_odds_american: -120,
      risk_tolerance: 'Balanced',
      active_sports: ['NBA']
    };

    const analyzedGame: QueuedGame = {
      ...mockGame,
      analysis: {
        decision: 'PLAYABLE',
        side: 'AWAY',
        market: 'Moneyline',
        softBestOdds: '-150',
        sharpImpliedProb: 60,
        handicapper_logic: 'Too short.'
      } as AnalysisResult
    };

    const result = geminiService.refreshAnalysisMathOnly(analyzedGame, tightOddsPersona, mockBalances);
    expect(result.decision).toBe('PASS');
    expect(result.vetoReason).toContain('JUICE_VETO');
  });

  it('should allow favorites up to persona max_odds_american if logic is present', () => {
    const tightPersona: UserPersona = {
      user_id: '123',
      min_edge_percentage: 0.1,
      volume_mode: 'High Action',
      max_odds_american: -160,
      risk_tolerance: 'Balanced',
      active_sports: ['NBA']
    };

    const strongGame = {
      ...mockGame,
      softLines: [
        {
          ...mockGame.softLines[0],
          mlOddsA: '-150' // Within -160 limit
        }
      ]
    };

    const analyzedGame: QueuedGame = {
      ...strongGame,
      analysis: {
        decision: 'PLAYABLE',
        side: 'AWAY',
        market: 'Moneyline',
        softBestOdds: '-150',
        sharpImpliedProb: 65,
        handicapper_logic: 'Strong roster integrity and matchup dominance verified by ground truth.'
      } as AnalysisResult
    };

    const result = geminiService.refreshAnalysisMathOnly(analyzedGame, tightPersona, mockBalances);
    expect(result.decision).toBe('PLAYABLE');
    expect(result.softBestOdds).toBe('-150');
  });

  it('should veto if odds are worse than persona max_odds_american regardless of logic', () => {
    const tightPersona: UserPersona = {
      user_id: '123',
      min_edge_percentage: 0.1,
      volume_mode: 'High Action',
      max_odds_american: -160,
      risk_tolerance: 'Balanced',
      active_sports: ['NBA']
    };

    const strongButExpensiveGame = {
      ...mockGame,
      softLines: [
        {
          ...mockGame.softLines[0],
          mlOddsA: '-170' // Worse than -160
        }
      ]
    };

    const analyzedGame: QueuedGame = {
      ...strongButExpensiveGame,
      analysis: {
        decision: 'PLAYABLE',
        side: 'AWAY',
        market: 'Moneyline',
        softBestOdds: '-170',
        sharpImpliedProb: 75,
        handicapper_logic: 'Strong roster integrity and matchup dominance verified by ground truth.'
      } as AnalysisResult
    };

    const result = geminiService.refreshAnalysisMathOnly(analyzedGame, tightPersona, mockBalances);
    expect(result.decision).toBe('PASS');
    expect(result.vetoReason).toContain('JUICE_VETO');
  });
});
