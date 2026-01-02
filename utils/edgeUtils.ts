
// Shared logic for determining edge quality
// Used in Auto-Pick (GameContext) and UI Badges (Card)

export const isPremiumEdge = (linePoints: number = 0, juiceCents: number = 0, confidence: string = 'MEDIUM'): boolean => {
  // Premium = 0.5+ points, OR 15+ cents juice, OR HIGH confidence
  return linePoints >= 0.5 || juiceCents >= 15 || confidence === 'HIGH';
};

export const isStandardEdge = (linePoints: number = 0, juiceCents: number = 0): boolean => {
  // Standard = Any positive points, OR 5+ cents juice
  return linePoints > 0 || juiceCents >= 5;
};
