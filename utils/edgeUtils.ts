
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
    if (sport === 'NFL' || sport === 'CFB') return absPoints >= 1.0;
    if (sport === 'NHL' || sport === 'MLB') return absPoints >= 0.5;
  } else {
    // Spreads
    if (sport === 'NFL' || sport === 'CFB') return absPoints >= 0.5;
    if (sport === 'NBA') return absPoints >= 1.0; 
    if (sport === 'NHL' || sport === 'MLB') return absPoints >= 0.5;
  }

  // Default fallback (Unknown sport)
  return absPoints >= 0.5;
};

export const isStandardEdge = (
  linePoints: number = 0, 
  juiceCents: number = 0,
  sport: string = 'NBA',
  market: string = 'Spread'
): boolean => {
  // Standard = Any positive points (sport-adjusted), OR 5+ cents juice
  if (juiceCents >= 5) return true;
  
  const absPoints = Math.abs(linePoints);
  
  if (market === 'Total') {
     if (sport === 'NBA') return absPoints >= 1.0;
     if (sport === 'NFL' || sport === 'CFB') return absPoints >= 0.5;
     return absPoints >= 0.5;
  } else {
     // Spreads
     if (sport === 'NFL' || sport === 'CFB') return absPoints > 0; // Any +EV is standard for key numbers
     if (sport === 'NBA') return absPoints >= 0.5;
     return absPoints >= 0.5;
  }
};
