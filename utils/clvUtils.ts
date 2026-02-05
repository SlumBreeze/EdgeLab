import { Bet } from '../types';

/**
 * Calculates the implied probability from American odds.
 * -110 -> 52.38%, +150 -> 40%
 */
const getImpliedProb = (odds: number): number => {
  if (odds > 0) {
    return (100 / (odds + 100)) * 100;
  } else {
    const abs = Math.abs(odds);
    return (abs / (abs + 100)) * 100;
  }
};

/**
 * Calculates Closing Line Value (CLV) percentage.
 * Formula: ((Implied Probability of Closing Odds / Implied Probability of Taken Odds) - 1) * 100
 */
export const calculateCLV = (takenOdds: number, closingOdds: number): number => {
  const takenProb = getImpliedProb(takenOdds);
  const closingProb = getImpliedProb(closingOdds);

  if (takenProb === 0) return 0;

  // Edge = (Closing Prob / Taken Prob) - 1
  return ((closingProb / takenProb) - 1) * 100;
};

/**
 * Calculates Expected ROI (xROI) based on the average CLV of settled bets.
 */
export const calculateXROI = (bets: Bet[]): number => {
  const betsWithCLV = bets.filter(b => b.clv_percent !== undefined);
  if (betsWithCLV.length === 0) return 0;

  const totalCLV = betsWithCLV.reduce((sum, b) => sum + (b.clv_percent || 0), 0);
  return totalCLV / betsWithCLV.length;
};

/**
 * Calculates the Beat Rate (percentage of bets where CLV > 0)
 */
export const calculateBeatRate = (bets: Bet[]): number => {
  const betsWithCLV = bets.filter(b => b.clv_percent !== undefined);
  if (betsWithCLV.length === 0) return 0;

  const beats = betsWithCLV.filter(b => (b.clv_percent || 0) > 0).length;
  return (beats / betsWithCLV.length) * 100;
};
