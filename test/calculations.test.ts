import { describe, it, expect } from 'vitest';
import { calculateKellyWager, riskToleranceToMultiplier } from '../utils/calculations';

describe('calculateKellyWager with risk adjustment', () => {
  const bankroll = 1000;
  const odds = -110;
  const winProb = 0.55;

  it('should use default fractional Kelly (0.25) when no multiplier is provided', () => {
    const wager = calculateKellyWager(bankroll, odds, winProb);
    expect(wager).toBe(13.75);
  });

  it('should allow providing a custom fractional Kelly multiplier', () => {
    const conservativeMultiplier = 0.125;
    const wager = calculateKellyWager(bankroll, odds, winProb, conservativeMultiplier);
    expect(wager).toBe(6.87);
  });
});

describe('riskToleranceToMultiplier', () => {
  it('should map Conservative to 0.125', () => {
    expect(riskToleranceToMultiplier('Conservative')).toBe(0.125);
  });

  it('should map Aggressive to 0.5', () => {
    expect(riskToleranceToMultiplier('Aggressive')).toBe(0.5);
  });

  it('should map Balanced to 0.25', () => {
    expect(riskToleranceToMultiplier('Balanced')).toBe(0.25);
  });

  it('should default to 0.25 for unknown values', () => {
    expect(riskToleranceToMultiplier('Unknown')).toBe(0.25);
  });
});