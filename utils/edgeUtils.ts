// Shared logic for determining edge quality
// Used in Auto-Pick (GameContext) and UI Badges (Card)

export const isPremiumEdge = (
  linePoints: number = 0, 
  juiceCents: number = 0, 
  confidence: string = 'MEDIUM',
  sport: string = 'NBA',
  market: string = 'Spread'
): boolean => {
  // 1. High Confidence is always Premium
  if (confidence === 'HIGH') return true;

  // 2. Juice Value: 15+ cents is always Premium
  if (juiceCents >= 15) return true;

  // 3. Line Value (Sport Specific)
  const absPoints = Math.abs(linePoints);

  if (market === 'Total') {
    // Totals
    if (sport === 'NBA') return absPoints >= 1.5;
    if (sport === 'NFL') return absPoints >= 1.0;
    if (sport === 'NHL' || sport === 'MLB') return absPoints >= 0.5;
  } else {
    // Spreads
    if (sport === 'NFL') return absPoints >= 0.5;
    if (sport === 'NBA') return absPoints >= 1.0;
    if (sport === 'NHL' || sport === 'MLB') return absPoints >= 0.5;
  }

  // Default fallback
  return absPoints >= 0.5;
};

export const isStandardEdge = (
  linePoints: number = 0, 
  juiceCents: number = 0,
  sport: string = 'NBA',
  market: string = 'Spread'
): boolean => {
  if (juiceCents >= 5) return true;
  const absPoints = Math.abs(linePoints);
  
  if (market === 'Total') {
     if (sport === 'NBA') return absPoints >= 1.0;
     if (sport === 'NFL') return absPoints >= 0.5;
     return absPoints >= 0.5;
  } else {
     if (sport === 'NFL') return absPoints > 0;
     if (sport === 'NBA') return absPoints >= 0.5;
     return absPoints >= 0.5;
  }
};

// --- Strict Bankroll Management & EV Math ---

export const americanToDecimal = (american: number): number => {
  if (american > 0) {
    return 1 + (american / 100);
  } else {
    return 1 + (100 / Math.abs(american));
  }
};

export const oddsToImpliedProbability = (decimalOdds: number): number => {
  if (decimalOdds <= 0) return 0;
  return (1 / decimalOdds) * 100;
};

export const calculateEV = (trueProbabilityPercent: number, decimalOdds: number): number => {
  // ((TrueProb% / 100) * DecimalOdds) - 1
  // Return as percentage
  return (((trueProbabilityPercent / 100) * decimalOdds) - 1) * 100;
};

export const calculateUnitSize = (
  bankroll: number, 
  confidence: number, // 0-100
  edge: number // EV percentage
): number => {
  if (edge <= 0) return 0;

  let pct = 0.01; // Standard (1%)

  if (edge > 10 && confidence > 80) {
    pct = 0.05; // Max Play (5%)
  } else if (edge > 7 && confidence > 70) {
    pct = 0.03; // Aggressive (3%)
  } else if (edge > 3 && confidence > 60) {
    pct = 0.02; // Strong (2%)
  }

  return Math.floor(bankroll * pct);
};

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
    minimumFractionDigits: 0
  }).format(amount);
};