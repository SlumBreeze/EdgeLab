import { describe, it, expect, vi, beforeEach } from 'vitest';
import { geminiService } from '../services/geminiService';
import { QueuedGame, UserPersona, AnalysisResult } from '../types';

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

describe('Veto System with Persona', () => {
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
        trueProbability: 60,
        impliedProbability: 55,
        edge: 5,
        wagerType: 'Moneyline',
        riskFactors: []
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

    const result = await geminiService.analyzeGame(mockGame, highEdgePersona);
    expect(result.decision).toBe('PASS');
    expect(result.vetoReason).toContain('NO_EDGE');
  });

  it('should allow thinner edges when min_edge_percentage is low', async () => {
    const lowEdgePersona: UserPersona = {
      user_id: '123',
      min_edge_percentage: 0.1,
      volume_mode: 'High Action',
      max_odds_american: -175,
      risk_tolerance: 'Balanced',
      active_sports: ['NBA']
    };

    const result = await geminiService.analyzeGame(mockGame, lowEdgePersona);
    expect(result.decision).toBe('PLAYABLE');
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
        sharpImpliedProb: 60
      } as AnalysisResult
    };

    const result = geminiService.refreshAnalysisMathOnly(analyzedGame, tightOddsPersona);
    expect(result.decision).toBe('PASS');
    expect(result.vetoReason).toContain('JUICE_VETO');
  });

  it('should inject Volume Mode into system prompt', async () => {
    const volumePersona: UserPersona = {
      user_id: '123',
      min_edge_percentage: 0.1,
      volume_mode: 'High Action',
      max_odds_american: -175,
      risk_tolerance: 'Balanced',
      active_sports: ['NBA']
    };

    const spy = vi.spyOn(geminiService, 'generateWithFallback');
    
    await geminiService.analyzeGame(mockGame, volumePersona);
    
    const callArgs = spy.mock.calls[0][1]; // paramsWithoutModel
    expect(callArgs.config.systemInstruction).toContain('VOLUME MODE ENABLED');
  });
});