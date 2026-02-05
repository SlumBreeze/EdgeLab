import { describe, it, expect } from 'vitest';
import { calculateCLV, calculateXROI } from '../utils/clvUtils';

describe('calculateCLV', () => {
  it('should calculate positive CLV when taken price is better than closing', () => {
    // Taken +150 (40% implied), Closing +140 (41.7% implied)
    // Edge = (41.7 - 40) / 40 = 4.25% (simplified)
    const result = calculateCLV(150, 140);
    expect(result).toBeGreaterThan(0);
    expect(Math.round(result * 10) / 10).toBe(4.2);
  });

  it('should calculate negative CLV when taken price is worse than closing', () => {
    // Taken -110 (52.4%), Closing -120 (54.5%)
    // Actually -110 is better than -120. Let's fix example.
    // Taken -120 (54.5%), Closing -110 (52.4%)
    const result = calculateCLV(-120, -110);
    expect(result).toBeLessThan(0);
  });
});

describe('calculateXROI', () => {
  it('should calculate expected ROI based on average CLV', () => {
    const bets = [
      { wager: 100, clv_percent: 5 },
      { wager: 100, clv_percent: -2 }
    ];
    const xROI = calculateXROI(bets as any);
    expect(xROI).toBe(1.5); // (5 - 2) / 2
  });
});
