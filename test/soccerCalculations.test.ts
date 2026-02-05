import { describe, it, expect } from 'vitest';
import { calculateNoVig3Way, calculateEV, americanToDecimal } from '../utils/edgeUtils';
import { calculateKellyWager } from '../utils/calculations';

describe('calculateNoVig3Way', () => {
  it('should correctly remove vig from a 3-way soccer market', () => {
    // Example: Sharp odds for a game
    // Arsenal (+110), Draw (+250), Liverpool (+240)
    const oddsA = 110;
    const oddsDraw = 250;
    const oddsB = 240;

    const { probA, probB, probDraw } = calculateNoVig3Way(oddsA, oddsB, oddsDraw);

    // Normalized Arsenal: 0.450928
    expect(probA).toBeCloseTo(0.4509, 4);
    expect(probB).toBeCloseTo(0.2785, 4);
    expect(probDraw).toBeCloseTo(0.2706, 4);
    
    // Sum should be 1
    expect(probA + probB + probDraw).toBeCloseTo(1, 10);
  });
});

describe('3-Way Soccer EV Calculation', () => {
  it('should calculate positive EV when retail odds are better than sharp fair price', () => {
    // Sharp Fair for Arsenal is 45.09%
    const fairProbArsenal = 45.09;
    
    // Retail odds for Arsenal (+130) -> Decimal 2.3
    const retailOddsArsenal = 130;
    const retailDec = americanToDecimal(retailOddsArsenal);
    
    const ev = calculateEV(fairProbArsenal, retailDec);
    
    // EV = (0.4509 * 2.3) - 1 = 1.03707 - 1 = 0.03707 -> 3.71%
    expect(ev).toBeCloseTo(3.71, 1);
  });
});

describe('calculateKellyWager for 3-way', () => {
  it('should calculate correct wager for a soccer pick with edge', () => {
    const bankroll = 1000;
    const retailOdds = 130;
    const fairProb = 0.4509;
    
    const wager = calculateKellyWager(bankroll, retailOdds, fairProb, 0.25);
    
    // b = 1.3
    // p = 0.4509
    // q = 0.5491
    // f* = (1.3 * 0.4509 - 0.5491) / 1.3 = 0.0285
    // Adjusted = 0.0285 * 0.25 = 0.007125
    // Wager = 1000 * 0.007125 = 7.12
    expect(wager).toBeCloseTo(7.12, 2);
  });
});