
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { BookLines, QueuedGame, HighHitAnalysis, Game } from '../types';
import { EXTRACTION_PROMPT } from '../constants';

const GoogleGenerativeAI = GoogleGenAI;
const getAiClient = () => new GoogleGenerativeAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

const SYSTEM_PROMPT = `
You are the Stoic Handicapper. You are cold, calculated, and indifferent to narratives.

NON-NEGOTIABLE RULES:
- Ignore sports narratives, media hype, and "vibes."
- Ignore ALL player props. Only evaluate Game Lines: Moneyline, Spread, Total.
- Only act on math and Positive Expected Value (+EV).

STRATEGIES:
- Fade the Public: If >80% of public bets are on one side and the line moves the opposite way, call it "Reverse Line Movement."
- Market Overreaction: Detect recency bias (e.g., a blowout last game) and avoid overreacting.
- Discipline: If edge <= 0%, recommendation must be PASS.

OUTPUT:
Return strict JSON with:
recommendation (BET | PASS | LEAN)
confidence (0-100)
reasoning (max 2 sentences; blunt, data-only)
trueProbability (number, win %)
impliedProbability (number, % from odds)
edge (number, true - implied)
wagerType (Moneyline | Spread | Total)

No extra keys. No props. No narrative fluff.
`;

// ============================================
// MATH FUNCTIONS (TypeScript, NOT LLM)
// ============================================

const normalizeToAmerican = (odds: string | number): number => {
  const val = typeof odds === 'string' ? parseFloat(odds) : odds;
  if (isNaN(val)) return 0;

  const isLikelyDecimal = Math.abs(val) < 50 && val > 1.0;

  if (isLikelyDecimal) {
    if (val >= 2.0) {
      return (val - 1) * 100;
    } else {
      return -100 / (val - 1);
    }
  }
  
  return val;
};

// Format odds for display - converts decimal to American string
export const formatOddsForDisplay = (odds: string | number): string => {
  if (!odds || odds === 'N/A') return 'N/A';
  
  const val = typeof odds === 'string' ? parseFloat(odds) : odds;
  if (isNaN(val)) return String(odds);

  // Check if it's likely decimal (between 1.01 and ~50)
  const isLikelyDecimal = val > 1.0 && val < 50;

  if (isLikelyDecimal) {
    let american: number;
    if (val >= 2.0) {
      american = Math.round((val - 1) * 100);
      return `+${american}`;
    } else {
      american = Math.round(-100 / (val - 1));
      return String(american);
    }
  }
  
  // Already American - format with + for positive
  const numVal = Math.round(val);
  return numVal > 0 ? `+${numVal}` : String(numVal);
};

export const americanToImpliedProb = (odds: string | number): number => {
  const o = normalizeToAmerican(odds);
  if (isNaN(o) || o === 0) return 50;
  
  if (o < 0) {
    return Math.abs(o) / (Math.abs(o) + 100) * 100;
  } else {
    return 100 / (o + 100) * 100;
  }
};

export const calculateNoVigProb = (oddsA: string, oddsB: string): { probA: number, probB: number } => {
  const impliedA = americanToImpliedProb(oddsA);
  const impliedB = americanToImpliedProb(oddsB);
  
  const total = impliedA + impliedB;
  if (total === 0) return { probA: 50, probB: 50 };

  return {
    probA: Math.round((impliedA / total) * 1000) / 10,
    probB: Math.round((impliedB / total) * 1000) / 10
  };
};

// HELPER: Linearizes odds centered around 0 (Even Money)
// +150 -> 50, +100 -> 0, -110 -> -10, -150 -> -50
const getLinearOddsValue = (odds: number): number => {
  return odds >= 100 ? odds - 100 : odds + 100;
};

export const calculateJuiceDiff = (sharpOdds: string, softOdds: string): number => {
  const sharp = normalizeToAmerican(sharpOdds);
  const soft = normalizeToAmerican(softOdds);
  
  if (isNaN(sharp) || isNaN(soft) || sharp === 0 || soft === 0) return 0;
  
  return getLinearOddsValue(soft) - getLinearOddsValue(sharp);
};

export const calculateLineDiff = (sharpLine: string, softLine: string): number => {
  const sharp = parseFloat(sharpLine);
  const soft = parseFloat(softLine);
  if (isNaN(sharp) || isNaN(soft)) return 0;
  return Math.round((soft - sharp) * 10) / 10;
};

export const checkPriceVetoes = (game: QueuedGame): { triggered: boolean, reason?: string } => {
  if (!game.sharpLines) return { triggered: false };
  
  const spreadA = Math.abs(parseFloat(game.sharpLines.spreadLineA));
  
  let spreadLimit = 10.0;
  switch (game.sport) {
    case 'NFL': spreadLimit = 14.0; break;
    case 'NBA': spreadLimit = 16.0; break;
    case 'CFB': spreadLimit = 24.0; break;
    case 'NHL': spreadLimit = 4.0; break;
    default: spreadLimit = 10.0;
  }

  if (spreadA > spreadLimit) {
    return { 
      triggered: true, 
      reason: `SPREAD_CAP: Spread is ${spreadA} points (exceeds ${spreadLimit} limit for ${game.sport})` 
    };
  }
  
  return { triggered: false };
};

// ============================================
// HELPERS
// ============================================

const cleanAndParseJson = (text: string | undefined, fallback: any = {}): any => {
  if (!text) {
    console.warn("cleanAndParseJson received empty text");
    return fallback;
  }
  
  try {
    let clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    const firstBrace = clean.indexOf('{');
    const lastBrace = clean.lastIndexOf('}');
    
    if (firstBrace !== -1 && lastBrace !== -1) {
      clean = clean.substring(firstBrace, lastBrace + 1);
    } else {
      console.warn("No JSON object found in response. Text was:", text);
      return fallback;
    }
    
    return JSON.parse(clean);
  } catch (e) {
    console.error("JSON Parse Error:", e, "Text:", text);
    return fallback;
  }
};

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      let encoded = reader.result?.toString().replace(/^data:(.*,)?/, '');
      if (encoded && (encoded.length % 4) > 0) {
        encoded += '='.repeat(4 - (encoded.length % 4));
      }
      resolve(encoded || '');
    };
    reader.onerror = error => reject(error);
  });
};

const generateWithRetry = async (ai: GoogleGenAI, params: any, retries = 1) => {
  for (let i = 0; i <= retries; i++) {
    try {
      const resp = await ai.models.generateContent(params);
      if (resp.text) return resp;
      console.warn(`Attempt ${i + 1} returned empty text. Retrying...`);
    } catch (e) {
      console.warn(`Attempt ${i + 1} failed:`, e);
      if (i === retries) throw e;
    }
    await new Promise(r => setTimeout(r, 1000 * (i + 1))); 
  }
  return { text: undefined };
};

const getReferenceLines = (gameId: string) => {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(`edgelab_reference_${gameId}`);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
};

const parseFloorNumber = (value?: string): number | null => {
  if (!value || value === 'N/A') return null;
  const cleaned = value.replace(/^[ou]/i, '');
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

const isLineWithinFloor = (
  market: SideValue['market'],
  side: SideValue['side'],
  bestSoftLine: string,
  lineFloor?: string
): boolean => {
  if (!lineFloor) return true;
  const softVal = parseFloorNumber(bestSoftLine);
  const floorVal = parseFloorNumber(lineFloor);
  if (softVal === null || floorVal === null) return true;

  if (market === 'Total') {
    if (side === 'OVER') return softVal <= floorVal;
    if (side === 'UNDER') return softVal >= floorVal;
  }

  if (market === 'Spread') {
    return softVal >= floorVal;
  }

  return true;
};

const isOddsWithinFloor = (bestSoftOdds: string, oddsFloor?: string): boolean => {
  if (!oddsFloor) return true;
  const bestVal = normalizeToAmerican(bestSoftOdds);
  const floorVal = normalizeToAmerican(oddsFloor);
  if (!bestVal || !floorVal) return true;
  return bestVal >= floorVal;
};

// ============================================
// LINE VALUE CALCULATOR
// ============================================

interface SideValue {
  side: 'AWAY' | 'HOME' | 'OVER' | 'UNDER';
  market: 'Spread' | 'Moneyline' | 'Total';
  sharpLine: string;
  sharpOdds: string;
  bestSoftLine: string;
  bestSoftOdds: string;
  bestSoftBook: string;
  lineValue: number;
  priceValue: number;
  hasPositiveValue: boolean;
}

const analyzeAllSides = (sharp: BookLines, softLines: BookLines[]): SideValue[] => {
  const results: SideValue[] = [];

  const checkSide = (
    side: 'AWAY' | 'HOME' | 'OVER' | 'UNDER',
    market: 'Spread' | 'Moneyline' | 'Total',
    sharpLine: string,
    sharpOdds: string,
    getSoftLine: (s: BookLines) => string,
    getSoftOdds: (s: BookLines) => string
  ) => {
    let bestValue = -999;
    let bestBook = '';
    let bestLine = '';
    let bestOdds = '';
    let bestLineValue = 0;
    let bestPriceValue = 0;

    softLines.forEach(soft => {
      const softLine = getSoftLine(soft);
      const softOdds = getSoftOdds(soft);
      
      if (!softOdds || softOdds === 'N/A' || !sharpOdds || sharpOdds === 'N/A') return;

      const sVal = parseFloat(softOdds);
      if (Math.abs(sVal) > 2000) return;

      const lineValue = calculateLineDiff(sharpLine, softLine);
      const priceValue = calculateJuiceDiff(sharpOdds, softOdds);
      
      if (Math.abs(priceValue) > 50) return;

      // Prioritize points over juice for spreads
      const totalValue = (market === 'Spread' ? lineValue * 10 : 0) + priceValue;

      if (totalValue > bestValue) {
        bestValue = totalValue;
        bestBook = soft.bookName;
        bestLine = softLine;
        bestOdds = softOdds;
        bestLineValue = lineValue;
        bestPriceValue = priceValue;
      }
    });

    if (bestBook) {
      const hasPositiveValue = market === 'Spread' 
        ? bestLineValue > 0 || (bestLineValue === 0 && bestPriceValue > 0)
        : bestPriceValue > 0;

      results.push({
        side,
        market,
        sharpLine,
        sharpOdds,
        bestSoftLine: bestLine,
        bestSoftOdds: bestOdds,
        bestSoftBook: bestBook,
        lineValue: bestLineValue,
        priceValue: bestPriceValue,
        hasPositiveValue
      });
    }
  };

  checkSide('AWAY', 'Spread', sharp.spreadLineA, sharp.spreadOddsA, s => s.spreadLineA, s => s.spreadOddsA);
  checkSide('HOME', 'Spread', sharp.spreadLineB, sharp.spreadOddsB, s => s.spreadLineB, s => s.spreadOddsB);
  checkSide('AWAY', 'Moneyline', 'ML', sharp.mlOddsA, () => 'ML', s => s.mlOddsA);
  checkSide('HOME', 'Moneyline', 'ML', sharp.mlOddsB, () => 'ML', s => s.mlOddsB);
  checkSide('OVER', 'Total', sharp.totalLine, sharp.totalOddsOver, s => s.totalLine, s => s.totalOddsOver);
  checkSide('UNDER', 'Total', sharp.totalLine, sharp.totalOddsUnder, s => s.totalLine, s => s.totalOddsUnder);

  return results;
};

// ============================================
// EXTRACTION SERVICE
// ============================================

const bookLinesSchema = {
  type: Type.OBJECT,
  properties: {
    bookName: { type: Type.STRING },
    spreadLineA: { type: Type.STRING },
    spreadOddsA: { type: Type.STRING },
    spreadLineB: { type: Type.STRING },
    spreadOddsB: { type: Type.STRING },
    totalLine: { type: Type.STRING },
    totalOddsOver: { type: Type.STRING },
    totalOddsUnder: { type: Type.STRING },
    mlOddsA: { type: Type.STRING },
    mlOddsB: { type: Type.STRING },
  },
  required: ['bookName', 'spreadLineA', 'spreadLineB']
};

export const extractLinesFromScreenshot = async (file: File): Promise<BookLines> => {
  const ai = getAiClient();
  const base64 = await fileToBase64(file);

  const response = await generateWithRetry(ai, {
    model: 'gemini-2.5-flash', 
    contents: {
      parts: [
        { text: EXTRACTION_PROMPT },
        { inlineData: { data: base64, mimeType: file.type } }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: bookLinesSchema,
      temperature: 0.1
    }
  });

  const fallback: BookLines = {
    bookName: 'Unknown',
    spreadLineA: 'N/A', spreadOddsA: 'N/A',
    spreadLineB: 'N/A', spreadOddsB: 'N/A',
    totalLine: 'N/A', totalOddsOver: 'N/A', totalOddsUnder: 'N/A',
    mlOddsA: 'N/A', mlOddsB: 'N/A'
  };

  return cleanAndParseJson(response.text, fallback);
};

// ============================================
// MAIN ANALYSIS (Stoic Handicapper)
// ============================================

type GameData = QueuedGame;
type AnalysisResult = HighHitAnalysis;

type StoicAiResult = {
  recommendation: 'BET' | 'PASS' | 'LEAN';
  confidence: number;
  reasoning: string;
  trueProbability: number;
  impliedProbability: number;
  edge: number;
  wagerType: 'Moneyline' | 'Spread' | 'Total';
};

const stoicResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    recommendation: { type: Type.STRING },
    confidence: { type: Type.NUMBER },
    reasoning: { type: Type.STRING },
    trueProbability: { type: Type.NUMBER },
    impliedProbability: { type: Type.NUMBER },
    edge: { type: Type.NUMBER },
    wagerType: { type: Type.STRING }
  },
  required: ['recommendation', 'confidence', 'reasoning', 'trueProbability', 'impliedProbability', 'edge', 'wagerType']
};

const clampConfidence = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const normalizeRecommendation = (value?: string): 'BET' | 'PASS' | 'LEAN' => {
  if (!value) return 'PASS';
  const upper = value.toUpperCase();
  if (upper === 'BET' || upper === 'PASS' || upper === 'LEAN') return upper as 'BET' | 'PASS' | 'LEAN';
  return 'PASS';
};

const normalizeWagerType = (value?: string): 'Moneyline' | 'Spread' | 'Total' | null => {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (normalized === 'moneyline') return 'Moneyline';
  if (normalized === 'spread') return 'Spread';
  if (normalized === 'total') return 'Total';
  return null;
};

const trimToTwoSentences = (text: string) => {
  if (!text) return '';
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  return sentences.slice(0, 2).join(' ');
};

const confidenceToLabel = (score: number): 'HIGH' | 'MEDIUM' | 'LOW' => {
  if (score >= 70) return 'HIGH';
  if (score >= 50) return 'MEDIUM';
  return 'LOW';
};

const getNoVigForMarket = (market: SideValue['market'], sharp: BookLines) => {
  if (market === 'Moneyline') {
    return calculateNoVigProb(sharp.mlOddsA, sharp.mlOddsB);
  }
  if (market === 'Spread') {
    return calculateNoVigProb(sharp.spreadOddsA, sharp.spreadOddsB);
  }
  return calculateNoVigProb(sharp.totalOddsOver, sharp.totalOddsUnder);
};

const getTrueProbability = (market: SideValue['market'], side: SideValue['side'], sharp: BookLines) => {
  const noVig = getNoVigForMarket(market, sharp);
  if (market === 'Total') {
    return side === 'OVER' ? noVig.probA : noVig.probB;
  }
  return side === 'AWAY' ? noVig.probA : noVig.probB;
};

export const analyzeGame = async (game: GameData): Promise<AnalysisResult> => {
  if (!game.sharpLines || game.softLines.length === 0) {
    return {
      decision: 'PASS',
      vetoTriggered: true,
      vetoReason: 'DATA_MISSING: Sharp or soft lines missing.',
      recommendation: 'PASS',
      reasoning: 'Insufficient pricing data.',
      researchSummary: 'Insufficient pricing data.',
      confidenceScore: 0
    };
  }

  const allSides = analyzeAllSides(game.sharpLines, game.softLines);
  if (allSides.length === 0) {
    return {
      decision: 'PASS',
      vetoTriggered: true,
      vetoReason: 'NO_MARKET_DATA: No valid lines found.',
      recommendation: 'PASS',
      reasoning: 'No valid market lines available.',
      researchSummary: 'No valid market lines available.',
      confidenceScore: 0
    };
  }

  const candidates = allSides.map(s => {
    const trueProbability = getTrueProbability(s.market, s.side, game.sharpLines!);
    const impliedProbability = americanToImpliedProb(s.bestSoftOdds);
    const edge = Math.round((trueProbability - impliedProbability) * 10) / 10;
    return { ...s, trueProbability, impliedProbability, edge };
  });

  const best = candidates.sort((a, b) => b.edge - a.edge)[0];
  if (!best || best.edge <= 0) {
    return {
      decision: 'PASS',
      vetoTriggered: true,
      vetoReason: 'NO_EDGE: No positive EV.',
      recommendation: 'PASS',
      reasoning: 'Edge <= 0%.',
      researchSummary: 'Edge <= 0%.',
      confidenceScore: 0,
      trueProbability: best?.trueProbability ?? 0,
      impliedProbability: best?.impliedProbability ?? 0,
      edge: best?.edge ?? 0,
      wagerType: best?.market ?? undefined
    };
  }

  const refLines = getReferenceLines(game.id);
  const lineMovement = refLines && best.market === 'Spread'
    ? `Reference spread: ${refLines.spreadLineA} -> Current: ${game.sharpLines.spreadLineA}`
    : 'No reference line data available.';

  const teamName = best.side === 'AWAY' ? game.awayTeam.name :
                   best.side === 'HOME' ? game.homeTeam.name :
                   best.side;

  const pick = `${teamName} ${best.market}`;
  const recLine = best.market === 'Moneyline'
    ? formatOddsForDisplay(best.bestSoftOdds)
    : `${best.bestSoftLine} (${formatOddsForDisplay(best.bestSoftOdds)})`;

  let lineFloor: string | undefined;
  let oddsFloor: string | undefined;
  let floorReason: string | undefined;

  if (best.market === 'Spread' || best.market === 'Total') {
    lineFloor = best.market === 'Total'
      ? `${best.side === 'OVER' ? 'o' : 'u'}${best.sharpLine}`
      : best.sharpLine;

    const sOdds = normalizeToAmerican(best.sharpOdds);
    const threshold = -130;
    const floorVal = (sOdds < threshold) ? sOdds : threshold;
    oddsFloor = formatOddsForDisplay(floorVal);
    floorReason = best.market === 'Spread'
      ? 'Matches sharp line - no edge below this'
      : 'Matches sharp line';
  } else {
    oddsFloor = formatOddsForDisplay(best.sharpOdds);
    floorReason = 'Matches sharp price';
  }

  const prompt = `
Matchup: ${game.awayTeam.name} at ${game.homeTeam.name}
Sport: ${game.sport}

Market: ${best.market}
Side: ${best.side}
Sharp line/odds: ${best.sharpLine} (${best.sharpOdds})
Soft best line/odds: ${best.bestSoftLine} (${best.bestSoftOdds}) at ${best.bestSoftBook}

TrueProbability: ${best.trueProbability}%
ImpliedProbability: ${best.impliedProbability}%
Edge: ${best.edge}%

Line Movement: ${lineMovement}

Tasks:
- Use search to find public betting % and line movement. If >80% public on one side and line moves opposite, call "Reverse Line Movement."
- Check if recency bias is driving the move (market overreaction).
- Ignore player props entirely. Only evaluate Moneyline/Spread/Total.
- Reasoning max 2 sentences, blunt and data-only.
Return JSON only.
`;

  const ai = getAiClient();
  let aiResult: StoicAiResult;
  try {
    const response = await generateWithRetry(ai, {
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: stoicResponseSchema,
        temperature: 0.1
      }
    });
    aiResult = cleanAndParseJson(response.text, {
      recommendation: 'PASS',
      confidence: 0,
      reasoning: 'No actionable edge.',
      trueProbability: best.trueProbability,
      impliedProbability: best.impliedProbability,
      edge: best.edge,
      wagerType: best.market
    });
  } catch (error) {
    return {
      decision: 'PASS',
      vetoTriggered: true,
      vetoReason: 'AI_ERROR: Stoic analysis failed.',
      recommendation: 'PASS',
      reasoning: 'AI error.',
      researchSummary: 'AI error.',
      confidenceScore: 0,
      trueProbability: best.trueProbability,
      impliedProbability: best.impliedProbability,
      edge: best.edge,
      wagerType: best.market
    };
  }

  const normalizedRec = normalizeRecommendation(aiResult.recommendation);
  const normalizedWagerType = normalizeWagerType(aiResult.wagerType);
  const confidenceScore = clampConfidence(aiResult.confidence);
  const reasoning = trimToTwoSentences(aiResult.reasoning || '');

  const finalRecommendation = best.edge <= 0 || normalizedWagerType !== best.market
    ? 'PASS'
    : normalizedRec;

  const decision = finalRecommendation === 'BET' ? 'PLAYABLE' : 'PASS';

  return {
    decision,
    vetoTriggered: finalRecommendation !== 'BET',
    vetoReason: finalRecommendation === 'PASS'
      ? (best.edge <= 0 ? 'NO_EDGE: Edge <= 0%.' : 'STOIC_PASS: No bet.')
      : finalRecommendation === 'LEAN'
        ? 'LEAN_ONLY: Not strong enough to bet.'
        : undefined,
    caution: finalRecommendation === 'LEAN' ? 'Lean only: marginal edge.' : undefined,
    recommendation: finalRecommendation,
    pick,
    recLine,
    recProbability: best.trueProbability,
    market: best.market,
    side: best.side,
    line: best.bestSoftLine,
    sharpImpliedProb: best.trueProbability,
    softBestOdds: formatOddsForDisplay(best.bestSoftOdds),
    softBestBook: best.bestSoftBook,
    lineValueCents: best.priceValue > 0 ? best.priceValue : 0,
    lineValuePoints: best.lineValue,
    lineFloor,
    oddsFloor,
    floorReason,
    researchSummary: reasoning || 'Stoic: No narrative, math only.',
    edgeNarrative: reasoning || 'Stoic: No narrative, math only.',
    confidence: confidenceToLabel(confidenceScore),
    confidenceScore,
    reasoning,
    trueProbability: best.trueProbability,
    impliedProbability: best.impliedProbability,
    edge: best.edge,
    wagerType: best.market
  };
};

export const refreshAnalysisMathOnly = (game: QueuedGame): HighHitAnalysis => {
  const prior = game.analysis;
  if (!prior) {
    return {
      decision: 'PASS',
      vetoTriggered: true,
      vetoReason: 'REFRESH_FAILED: No prior analysis.',
      researchSummary: 'No prior analysis found to refresh.'
    };
  }

  if (prior.decision !== 'PLAYABLE') {
    return { ...prior };
  }

  if (!game.sharpLines || game.softLines.length === 0) {
    return {
      ...prior,
      decision: 'PASS',
      vetoTriggered: true,
      vetoReason: 'REFRESH_FAILED: Missing sharp/soft lines.'
    };
  }

  const allSides = analyzeAllSides(game.sharpLines, game.softLines);

  const selectedSide = allSides.find(s =>
    s.side === prior.side && s.market === prior.market
  );

  let sharpImpliedProb = prior.sharpImpliedProb ?? 50;

  if (!selectedSide || !selectedSide.hasPositiveValue) {
    return {
      ...prior,
      decision: 'PASS',
      vetoTriggered: true,
      vetoReason: 'LINE_MOVED: No longer positive value.',
      sharpImpliedProb,
      lineValueCents: 0,
      lineValuePoints: 0
    };
  }

  sharpImpliedProb = getTrueProbability(selectedSide.market, selectedSide.side, game.sharpLines);

  const lineValueCents = selectedSide.priceValue > 0 ? selectedSide.priceValue : 0;

  const bestOddsVal = parseFloat(selectedSide.bestSoftOdds);
  if (!isNaN(bestOddsVal) && bestOddsVal < -160) {
    return {
      ...prior,
      decision: 'PASS',
      vetoTriggered: true,
      vetoReason: `JUICE_VETO: Recommended odds ${formatOddsForDisplay(bestOddsVal)} are worse than -160 limit.`,
      sharpImpliedProb,
      lineValueCents,
      lineValuePoints: selectedSide.lineValue
    };
  }

  let lineFloor: string | undefined;
  let oddsFloor: string | undefined;
  let floorReason: string | undefined;

  if (selectedSide.market === 'Spread' || selectedSide.market === 'Total') {
    lineFloor = selectedSide.market === 'Total'
      ? `${selectedSide.side === 'OVER' ? 'o' : 'u'}${selectedSide.sharpLine}`
      : selectedSide.sharpLine;

    const sOdds = normalizeToAmerican(selectedSide.sharpOdds);
    const threshold = -130;
    const floorVal = (sOdds < threshold) ? sOdds : threshold;
    oddsFloor = formatOddsForDisplay(floorVal);
    floorReason = selectedSide.market === 'Spread'
      ? 'Matches sharp line - no edge below this'
      : 'Matches sharp line';
  } else if (selectedSide.market === 'Moneyline') {
    lineFloor = undefined;
    oddsFloor = formatOddsForDisplay(selectedSide.sharpOdds);
    floorReason = 'Matches sharp price';
  }

  const isLineOk = isLineWithinFloor(selectedSide.market, selectedSide.side, selectedSide.bestSoftLine, lineFloor);
  const isOddsOk = isOddsWithinFloor(selectedSide.bestSoftOdds, oddsFloor);

  if (!isLineOk || !isOddsOk) {
    return {
      ...prior,
      decision: 'PASS',
      vetoTriggered: true,
      vetoReason: 'LINE_MOVED: Outside floor thresholds.',
      sharpImpliedProb,
      lineValueCents,
      lineValuePoints: selectedSide.lineValue,
      lineFloor,
      oddsFloor,
      floorReason
    };
  }

  const teamName = selectedSide.side === 'AWAY' ? game.awayTeam.name :
                   selectedSide.side === 'HOME' ? game.homeTeam.name :
                   selectedSide.side;

  const recLine = selectedSide.market === 'Moneyline'
    ? formatOddsForDisplay(selectedSide.bestSoftOdds)
    : `${selectedSide.bestSoftLine} (${formatOddsForDisplay(selectedSide.bestSoftOdds)})`;

  return {
    ...prior,
    decision: 'PLAYABLE',
    vetoTriggered: false,
    vetoReason: undefined,
    recommendation: prior.recommendation ?? 'BET',
    pick: `${teamName} ${selectedSide.market}`,
    recLine,
    recProbability: sharpImpliedProb,
    market: selectedSide.market,
    side: selectedSide.side,
    line: selectedSide.bestSoftLine,
    sharpImpliedProb,
    softBestOdds: formatOddsForDisplay(selectedSide.bestSoftOdds),
    softBestBook: selectedSide.bestSoftBook,
    lineValueCents,
    lineValuePoints: selectedSide.lineValue,
    lineFloor,
    oddsFloor,
    floorReason
  };
};

// ============================================
// QUICK SCAN SERVICE
// ============================================

export const quickScanGame = async (game: Game): Promise<{ signal: 'RED' | 'YELLOW' | 'WHITE', description: string }> => {
  const ai = getAiClient();
  const dateObj = new Date(game.date);
  const readableDate = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric' });

  const prompt = `
    Search for: "${game.awayTeam.name} vs ${game.homeTeam.name} ${game.sport} injury report ${readableDate}"
    
    Sport: ${game.sport}
    
    CRITICAL: You MUST return a valid JSON object.
    
    Return JSON format:
    {
      "signal": "RED" | "YELLOW" | "WHITE",
      "description": "Max 15 words"
    }
  `;

  try {
    const response = await generateWithRetry(ai, {
      model: 'gemini-3-flash-preview', // CHANGED: Using Gemini 3 Flash for speed
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0.2
      }
    });

    return cleanAndParseJson(response.text, { signal: 'WHITE', description: 'Scan completed (no data/unrecognized)' });
  } catch (e) {
    console.error("Quick scan failed", e);
    return { signal: 'WHITE', description: 'Scan unavailable' };
  }
};

export const detectMarketDiff = (sharpVal: string, softVal: string, type: 'SPREAD' | 'TOTAL' | 'ML'): boolean => {
  if (!sharpVal || !softVal || sharpVal === 'N/A' || softVal === 'N/A') return false;
  
  const s1 = parseFloat(sharpVal);
  const s2 = parseFloat(softVal);
  if (isNaN(s1) || isNaN(s2)) return false;

  if (type === 'SPREAD' || type === 'TOTAL') {
    return Math.abs(s1 - s2) >= 0.5;
  }
  if (type === 'ML') {
    return Math.abs(s1 - s2) > 15;
  }
  return false;
};
