import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyzeGame, geminiService } from '../services/geminiService';
import { QueuedGame } from '../types';

// Mock the entire geminiService object
vi.spyOn(geminiService, 'quickScanGame').mockResolvedValue({
  signal: 'WHITE',
  description: 'Test scan',
  injuryContext: 'None',
  situationalContext: 'None',
  gameScript: 'Neutral'
});

vi.spyOn(geminiService, 'generateWithFallback').mockResolvedValue({
  text: JSON.stringify({
    recommendation: 'BET',
    confidence: 85,
    reasoning: 'Math edge supported by roster integrity.',
    handicapper_logic: 'Lebron is active and Lakers have a rest advantage.',
    trueProbability: 43.8,
    impliedProbability: 40,
    edge: 3.8,
    wagerType: 'Moneyline',
    riskFactors: ['Away game'],
    trapAlert: '',
    expertSentiment: 'Lakers favored by sharps.'
  })
});

describe('Gemini Pro 3 Analysis', () => {
  const mockGame: QueuedGame = {
    id: '1',
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
      mlOddsB: '-120',
      spreadLineA: '+3',
      spreadOddsA: '-110',
      spreadLineB: '-3',
      spreadOddsB: '-110',
      totalLine: '220',
      totalOddsOver: '-110',
      totalOddsUnder: '-110'
    },
    softLines: [
      {
        bookName: 'FanDuel',
        mlOddsA: '+150', // Massive edge vs +100
        mlOddsB: '-180',
        spreadLineA: '+3',
        spreadOddsA: '-110',
        spreadLineB: '-3',
        spreadOddsB: '-110',
        totalLine: '220',
        totalOddsOver: '-110',
        totalOddsUnder: '-110'
      }
    ]
  };

  it('should use Gemini Pro 3 and return handicapper_logic', async () => {
    const result = await analyzeGame(mockGame, undefined, undefined, {
      homeRoster: [{ strPlayer: 'LeBron James', strPosition: 'Forward' } as any],
      awayRoster: [{ strPlayer: 'Jayson Tatum', strPosition: 'Forward' } as any]
    });

    expect(result.decision).toBe('PLAYABLE');
    expect(result.handicapper_logic).toBeDefined();
    expect(result.handicapper_logic).toContain('Lebron is active');
    expect(result.trueProbability).toBeCloseTo(47.8, 1);
  });

  it('should include ground truth in the prompt (verified via mock)', async () => {
    const spy = vi.spyOn(geminiService, 'generateWithFallback');
    
    await analyzeGame(mockGame, undefined, undefined, {
      homeRoster: [{ strPlayer: 'LeBron James', strPosition: 'Forward' } as any],
      awayRoster: [{ strPlayer: 'Jayson Tatum', strPosition: 'Forward' } as any]
    });

    const callArgs = spy.mock.calls[0];
    const prompt = callArgs[1].contents;
    
    expect(callArgs[0]).toContain('gemini-2.5-pro');
    expect(prompt).toContain('LeBron James');
    expect(prompt).toContain('Jayson Tatum');
    expect(prompt).toContain('Ground Truth Rosters (Verified)');
  });

  it('should trigger DATA_QUALITY_VETO if AI hallucinating players', async () => {
    const { analyzeGame, geminiService } = await import('../services/geminiService');
    
    // Mock AI response with hallucinated player "Anthony Davis" (not on Lakers/Celtics roster provided)
    vi.spyOn(geminiService, 'generateWithFallback').mockResolvedValueOnce({
      text: JSON.stringify({
        recommendation: 'BET',
        confidence: 85,
        reasoning: 'Anthony Davis is a mismatch.',
        handicapper_logic: 'Davis dominates the paint.',
        trueProbability: 43.8,
        impliedProbability: 40,
        edge: 3.8,
        wagerType: 'Moneyline'
      })
    });

    const result = await analyzeGame(mockGame, undefined, undefined, {
      homeRoster: [{ strPlayer: 'LeBron James', strPosition: 'Forward' } as any],
      awayRoster: [{ strPlayer: 'Jayson Tatum', strPosition: 'Forward' } as any]
    });

    expect(result.decision).toBe('PASS');
    expect(result.vetoTriggered).toBe(true);
    expect(result.vetoReason).toContain('DATA_QUALITY_VETO');
    expect(result.vetoReason).toContain('Anthony Davis');
  });

  it('should adjust trueProbability based on point differences', async () => {
    const { analyzeGame, geminiService } = await import('../services/geminiService');
    
    // Pinnacle Total: 220 (o-110, u-110) -> Fair Prob 50%
    // Soft Total: 221 (o-110, u-110)
    // For UNDER 221, we have a +1.0 point edge.
    // NBA Total adjustment is 1.5% per point.
    // Expected trueProb for UNDER 221: 50% + (1.0 * 1.5%) = 51.5%
    // Implied for -110 is 52.4%. Edge should be -0.9%.
    
    const pointGame: QueuedGame = {
      ...mockGame,
      sharpLines: {
        ...mockGame.sharpLines!,
        mlOddsA: '+100',
        mlOddsB: '-100',
        totalLine: '220',
        totalOddsOver: '-110',
        totalOddsUnder: '-110'
      },
      softLines: [
        {
          ...mockGame.softLines[0],
          mlOddsA: '-500',
          mlOddsB: '-500',
          totalLine: '221',
          totalOddsOver: '-110',
          totalOddsUnder: '-110'
        }
      ]
    };

    vi.spyOn(geminiService, 'generateWithFallback').mockResolvedValue({
      text: JSON.stringify({
        recommendation: 'PASS',
        confidence: 50,
        reasoning: 'No edge.',
        handicapper_logic: 'Testing point adjustment.',
        trueProbability: 51.5,
        impliedProbability: 52.4,
        edge: -0.9,
        wagerType: 'Total'
      })
    });

    const result = await analyzeGame(pointGame);
    
    // We expect trueProbability to be around 51.5
    expect(result.trueProbability).toBeCloseTo(51.5, 1);
  });
});
