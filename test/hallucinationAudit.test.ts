import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyzeGame, geminiService } from '../services/geminiService';
import { QueuedGame } from '../types';

describe('Hallucination Audit', () => {
  const mockGame: QueuedGame = {
    id: 'game_audit',
    visibleId: 'AUDIT',
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
      spreadLineA: '+1.5',
      spreadOddsA: '-110',
      spreadLineB: '-1.5',
      spreadOddsB: '-110',
      totalLine: '220',
      totalOddsOver: '-110',
      totalOddsUnder: '-110'
    },
    softLines: [
      {
        bookName: 'FanDuel',
        mlOddsA: '+150', // Huge Edge
        mlOddsB: '-180',
        spreadLineA: '+2',
        spreadOddsA: '-110',
        spreadLineB: '-2',
        spreadOddsB: '-110',
        totalLine: '221',
        totalOddsOver: '-110',
        totalOddsUnder: '-110'
      }
    ]
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    
    vi.spyOn(geminiService, 'quickScanGame').mockResolvedValue({
      signal: 'WHITE',
      description: 'Audit scan',
      injuryContext: 'None',
      situationalContext: 'None',
      gameScript: 'None'
    });
  });

  it('should NOT mention Anthony Davis if he is not on the provided Lakers roster', async () => {
    // Current Lakers roster (Hypothetical without AD)
    const groundTruth = {
      homeRoster: [
        { strPlayer: 'LeBron James', strPosition: 'Forward' },
        { strPlayer: 'Austin Reaves', strPosition: 'Guard' },
        { strPlayer: 'Rui Hachimura', strPosition: 'Forward' }
      ] as any[],
      awayRoster: [
        { strPlayer: 'Jayson Tatum', strPosition: 'Forward' },
        { strPlayer: 'Jaylen Brown', strPosition: 'Forward' }
      ] as any[]
    };

    // AI Mock that tries to hallucinate AD
    const hallucinatingAiMock = vi.spyOn(geminiService, 'generateWithFallback').mockResolvedValue({
      text: JSON.stringify({
        recommendation: 'BET',
        confidence: 85,
        reasoning: 'Lakers have AD inside.',
        handicapper_logic: 'AD presence is key.',
        trueProbability: 55,
        impliedProbability: 48,
        edge: 7,
        wagerType: 'Moneyline'
      })
    });

    const result = await analyzeGame(mockGame, undefined, undefined, groundTruth);

    // Should be vetoed by DATA_QUALITY_VETO
    expect(result.decision).toBe('PASS');
    expect(result.vetoReason).toContain('DATA_QUALITY_VETO');
    expect(result.vetoReason).toContain('Anthony Davis');
  });

  it('should correctly use Ground Truth to confirm roster integrity', async () => {
    const groundTruth = {
      homeRoster: [
        { strPlayer: 'LeBron James', strPosition: 'Forward' },
        { strPlayer: 'Anthony Davis', strPosition: 'Center' }
      ] as any[],
      awayRoster: [
        { strPlayer: 'Jayson Tatum', strPosition: 'Forward' }
      ] as any[]
    };

    // AI Mock that correctly mentions AD
    vi.spyOn(geminiService, 'generateWithFallback').mockResolvedValue({
      text: JSON.stringify({
        recommendation: 'BET',
        confidence: 90,
        reasoning: 'Lakers at full strength with Davis.',
        handicapper_logic: 'Verified AD and LeBron are active via ground truth.',
        trueProbability: 55,
        impliedProbability: 48,
        edge: 7,
        wagerType: 'Moneyline'
      })
    });

    const result = await analyzeGame(mockGame, undefined, undefined, groundTruth);

    // Should NOT be vetoed
    expect(result.decision).toBe('PLAYABLE');
    expect(result.vetoTriggered).toBe(false);
    expect(result.handicapper_logic).toContain('Verified AD');
  });
});
