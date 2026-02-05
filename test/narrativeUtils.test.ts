import { describe, it, expect } from 'vitest';
import { detectRLM } from '../utils/narrativeUtils';

describe('detectRLM', () => {
  it('should detect RLM when public is high on favorite but line moves toward underdog', () => {
    // Team A is favorite (-5), 80% public tickets
    // Line moves to -4 (moves "up" toward underdog)
    const result = detectRLM(80, -5, -4);
    expect(result.detected).toBe(true);
    expect(result.reason).toContain('Reverse Line Movement');
  });

  it('should not detect RLM when public is high and line moves with them', () => {
    // Team A is favorite (-5), 80% public tickets
    // Line moves to -6 (moves "down" away from underdog)
    const result = detectRLM(80, -5, -6);
    expect(result.detected).toBe(false);
  });

  it('should detect RLM when public is high on underdog but line moves toward favorite', () => {
    // Team B is underdog (+5), 80% public tickets
    // Line moves to +4 (moves "down" toward favorite)
    const result = detectRLM(80, 5, 4);
    expect(result.detected).toBe(true);
  });

  it('should return false if public tickets are below threshold', () => {
    const result = detectRLM(60, -5, -4);
    expect(result.detected).toBe(false);
  });
});
