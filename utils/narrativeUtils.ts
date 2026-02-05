/**
 * Detects Reverse Line Movement (RLM)
 * RLM occurs when a large majority of the public is on one side, 
 * but the line moves in the opposite direction (toward the other side).
 * 
 * @param publicTicketPct Percentage of public tickets on the side (0-100)
 * @param openingLine Opening spread/line (American e.g., -5)
 * @param currentLine Current spread/line (American e.g., -4)
 * @param threshold Minimum public percentage to consider (default 75%)
 */
export const detectRLM = (
  publicTicketPct: number,
  openingLine: number,
  currentLine: number,
  threshold: number = 75
): { detected: boolean; reason?: string } => {
  if (publicTicketPct < threshold) {
    return { detected: false };
  }

  // Example: Public on Favorite (-5), line moves to -4.
  // Movement is toward the underdog (up).
  
  // Normalize movement: 
  // If public is on favorite (line < 0), RLM is if currentLine > openingLine (e.g., -4 > -5)
  // If public is on underdog (line > 0), RLM is if currentLine < openingLine (e.g., +4 < +5)

  const isFavorite = openingLine < 0;
  const movedTowardOpposite = isFavorite 
    ? currentLine > openingLine 
    : currentLine < openingLine;

  if (movedTowardOpposite) {
    return {
      detected: true,
      reason: `TRAP: Reverse Line Movement. Public is heavy (${publicTicketPct}%) on this side, but sharps moved the line the other way.`
    };
  }

  return { detected: false };
};
