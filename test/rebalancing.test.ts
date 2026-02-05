import { describe, it, expect } from 'vitest';
import { getRecommendedBook } from '../utils/calculations';
import { BookBalanceDisplay } from '../types';

describe('getRecommendedBook', () => {
  const mockBalances: BookBalanceDisplay[] = [
    { sportsbook: 'FanDuel', currentBalance: 1000, deposited: 1000, withdrawn: 0 },
    { sportsbook: 'DraftKings', currentBalance: 200, deposited: 500, withdrawn: 300 },
    { sportsbook: 'BetMGM', currentBalance: 50, deposited: 100, withdrawn: 50 }
  ];

  it('should suggest the best-funded book among those with the best price', () => {
    const candidateBooks: string[] = ['FanDuel', 'DraftKings'];
    const result = getRecommendedBook(candidateBooks, mockBalances);
    expect(result.book).toBe('FanDuel');
    expect(result.status).toBe('SUFFICIENT');
  });

  it('should handle fuzzy matching for book names', () => {
    const candidateBooks: string[] = ['Fanduel Sportsbook', 'Draftkings'];
    const result = getRecommendedBook(candidateBooks, mockBalances);
    expect(result.book).toBe('FanDuel');
  });

  it('should flag LOW status when balance is below threshold', () => {
    const candidateBooks: string[] = ['BetMGM'];
    const result = getRecommendedBook(candidateBooks, mockBalances);
    expect(result.book).toBe('BetMGM');
    expect(result.status).toBe('LOW');
  });

  it('should flag CRITICAL status when balance is extremely low', () => {
    const criticalBalances: BookBalanceDisplay[] = [
      { sportsbook: 'FanDuel', currentBalance: 15, deposited: 100, withdrawn: 85 }
    ];
    const result = getRecommendedBook(['FanDuel'], criticalBalances);
    expect(result.status).toBe('CRITICAL');
  });

  it('should return null if no balances match candidates', () => {
    const candidateBooks: string[] = ['Pinnacle'];
    const result = getRecommendedBook(candidateBooks, mockBalances);
    expect(result.book).toBeNull();
  });
});