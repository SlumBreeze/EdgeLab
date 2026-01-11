import type { Sportsbook } from '../types';

// Keep this small and stable: it’s the payload you pass from EdgeLab -> Tracker form.
export type DraftBet = {
  sport: string;
  league?: string;

  gameId?: string;
  gameDate?: string; // ISO string if available

  homeTeam?: string;
  awayTeam?: string;

  pickTeam?: string;     // the side / team you’re betting
  market?: string;       // e.g., "ML", "Spread", "Total"
  line?: number | null;  // spread/total number if applicable
  odds?: number | null;  // American odds like -110

  sportsbook?: Sportsbook | string;

  stake?: number | null;

  // freeform notes from EdgeLab analysis
  rationale?: string;

  // optional EV fields if you have them
  evPct?: number | null;
  edge?: number | null;
};

// Helper: Extract American Odds (e.g. -110, +145) from a string
function parseOdds(text: string | undefined | null): number | null {
  if (!text) return null;
  const cleanText = text.toString();

  // 1. Keywords
  if (/\b(EVEN|EV|PK|PICK|PICKEM)\b/i.test(cleanText)) return 100;

  // 2. Priority: Odds in parentheses (-105)
  const parenMatch = cleanText.match(/\((-?\+?\d+)\)/);
  if (parenMatch) return parseInt(parenMatch[1], 10);

  // 3. Priority: Odds after @ or at
  const atMatch = cleanText.match(/(?:@|at)\s*(-?\+?\d+)/i);
  if (atMatch) return parseInt(atMatch[1], 10);

  // 4. Fallback: Last standalone signed number
  // e.g. "Spread -7 -110" -> -110
  // e.g. "Total 238.5 -105" -> -105
  // We look for numbers with explicit + or - signs.
  const signedMatches = cleanText.match(/[-+]\d+/g);
  if (signedMatches && signedMatches.length > 0) {
    return parseInt(signedMatches[signedMatches.length - 1], 10);
  }

  return null;
}

// Helper: Extract Line (e.g. -6.5, 238.5) from a string
function parseLine(text: string | undefined | null): number | null {
  if (!text) return null;
  let cleanText = text.toString();

  // Remove explicit odds to avoid confusion
  cleanText = cleanText.replace(/\((-?\+?\d+)\)/g, ''); // Remove (-110)
  cleanText = cleanText.replace(/(?:@|at)\s*(-?\+?\d+)/gi, ''); // Remove @ -110

  // 1. Prefer decimal numbers (e.g. 238.5, -6.5)
  const decimalMatch = cleanText.match(/[-+]?\d+\.\d+/);
  if (decimalMatch) return parseFloat(decimalMatch[0]);

  // 2. Fallback: First signed integer if no decimal?
  // Be careful with this. For "Spread -7 -110", if we stripped explicit odds, 
  // we might be left with "-7".
  // But if odds were just "-110" (no parens), we rely on the odds parser to grab the last one.
  // Here we just want a line.
  
  // If there's a standalone signed number left after cleaning explicit odds, take it.
  const signedMatch = cleanText.match(/[-+]\d+/);
  if (signedMatch) return parseFloat(signedMatch[0]);

  return null;
}

// This mapper should be adapted to your EdgeLab QueuedGame shape.
// Start conservative: only map fields you’re confident exist.
export function mapQueuedGameToDraftBet(q: any, wager?: number): DraftBet {
  // Determine source string for parsing (prefer recLine as it usually has the numbers)
  const rawString = q?.analysis?.recLine || q?.analysis?.recommendation || '';
  
  // Calculate parsed values
  const parsedOdds = parseOdds(rawString);
  const parsedLine = parseLine(rawString);

  return {
    sport: q?.sport ?? q?.league ?? 'Unknown',

    gameId: q?.id ?? q?.gameId,
    gameDate: q?.date ?? q?.gameDate,

    homeTeam: q?.homeTeam?.name ?? q?.homeTeam ?? q?.home,
    awayTeam: q?.awayTeam?.name ?? q?.awayTeam ?? q?.away,

    pickTeam: q?.analysis?.side ?? q?.analysis?.recommendation ?? q?.pick,
    market: q?.analysis?.market ?? q?.market,
    
    // Prefer explicit line field if valid, otherwise use parsed line
    line: (q?.analysis?.line && !isNaN(parseFloat(q?.analysis?.line))) 
      ? parseFloat(q?.analysis?.line) 
      : parsedLine,
      
    // Use robust odds parser
    odds: parsedOdds,

    sportsbook: q?.analysis?.softBestBook ?? 'Other',

    stake: wager ?? null,
    rationale: q?.analysis?.researchSummary ?? q?.analysis?.edgeNarrative ?? '',
    evPct: q?.analysis?.lineValueCents ?? null, // Using lineValueCents as a proxy for EV
    edge: q?.analysis?.sharpImpliedProb ?? null,
  };
}