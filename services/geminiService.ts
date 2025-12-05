import { GoogleGenAI, Type, Schema } from "@google/genai";
import { BookLines, QueuedGame, HighHitAnalysis, Game } from '../types';
import { EXTRACTION_PROMPT, HIGH_HIT_SYSTEM_PROMPT, VETO_RULES } from '../constants';

const getAiClient = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

// ============================================
// MATH FUNCTIONS (TypeScript, NOT LLM)
// ============================================

/**
 * Convert American odds to implied probability
 * -110 → 52.38%, +150 → 40.00%
 */
export const americanToImpliedProb = (odds: string | number): number => {
  const o = typeof odds === 'string' ? parseFloat(odds) : odds;
  if (isNaN(o)) return 50;
  if (o < 0) {
    return Math.abs(o) / (Math.abs(o) + 100) * 100;
  } else {
    return 100 / (o + 100) * 100;
  }
};

/**
 * Calculate no-vig fair probability from both sides
 */
export const calculateNoVigProb = (oddsA: string, oddsB: string): { probA: number, probB: number } => {
  const impliedA = americanToImpliedProb(oddsA);
  const impliedB = americanToImpliedProb(oddsB);
  const total = impliedA + impliedB;
  return {
    probA: Math.round((impliedA / total) * 1000) / 10,
    probB: Math.round((impliedB / total) * 1000) / 10
  };
};

/**
 * Calculate juice difference in cents
 * -108 vs -110 = +2 cents savings
 */
export const calculateJuiceDiff = (sharpOdds: string, softOdds: string): number => {
  const sharp = parseFloat(sharpOdds);
  const soft = parseFloat(softOdds);
  if (isNaN(sharp) || isNaN(soft)) return 0;
  
  // For negative odds, less negative is better (savings)
  // For positive odds, more positive is better
  if (sharp < 0 && soft < 0) {
    return Math.round(sharp - soft); // -108 - (-110) = +2
  } else if (sharp > 0 && soft > 0) {
    return Math.round(soft - sharp); // +155 - +150 = +5
  }
  return 0;
};

/**
 * Calculate point spread difference (line value in points)
 * Sharp -7, Soft -6.5 = +0.5 points value (better line for bettor)
 * Sharp +3, Soft +3.5 = +0.5 points value (better line for bettor)
 * 
 * For spreads, a more positive number is ALWAYS better:
 * -6.5 is better than -7.0 (easier to cover as favorite)
 * +3.5 is better than +3.0 (more cushion as underdog)
 */
export const calculateLineDiff = (sharpLine: string, softLine: string): number => {
  const sharp = parseFloat(sharpLine);
  const soft = parseFloat(softLine);
  if (isNaN(sharp) || isNaN(soft)) return 0;

  // soft - sharp gives positive value when soft book offers better number
  return Math.round((soft - sharp) * 10) / 10;
};

/**
 * Check price-based vetoes (done in TypeScript, not AI)
 */
export const checkPriceVetoes = (game: QueuedGame): { triggered: boolean, reason?: string } => {
  if (!game.sharpLines) return { triggered: false };
  
  // PRICE_CAP: Favorite worse than -170
  const mlA = parseFloat(game.sharpLines.mlOddsA);
  const mlB = parseFloat(game.sharpLines.mlOddsB);
  
  if (mlA < -170 || mlB < -170) {
    return { 
      triggered: true, 
      reason: `PRICE_CAP: Favorite priced at ${mlA < mlB ? game.sharpLines.mlOddsA : game.sharpLines.mlOddsB} (worse than -170)` 
    };
  }
  
  // SPREAD_CAP: Spread > 10
  const spreadA = Math.abs(parseFloat(game.sharpLines.spreadLineA));
  if (spreadA > 10) {
    return { 
      triggered: true, 
      reason: `SPREAD_CAP: Spread is ${spreadA} points (exceeds 10.0 limit)` 
    };
  }
  
  return { triggered: false };
};

// ============================================
// EXTRACTION SERVICE (Screenshot → Lines)
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

  const response = await ai.models.generateContent({
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
      temperature: 0.1 // Very low for extraction accuracy
    }
  });

  if (!response.text) throw new Error("No data extracted");
  return JSON.parse(response.text);
};

// ============================================
// ANALYSIS SERVICE (Research + Veto Check)
// ============================================

const analysisSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    decision: { type: Type.STRING, enum: ["PLAYABLE", "PASS"] },
    vetoTriggered: { type: Type.BOOLEAN },
    vetoReason: { type: Type.STRING, description: "Which veto rule was triggered and why" },
    researchSummary: { type: Type.STRING, description: "Bullet points of injuries, rest, efficiency data found" },
    edgeNarrative: { type: Type.STRING, description: "Plain English edge description, NO percentages" },
    market: { type: Type.STRING },
    side: { type: Type.STRING },
    line: { type: Type.STRING },
  },
  required: ["decision", "vetoTriggered", "researchSummary"]
};

export const analyzeGame = async (game: QueuedGame): Promise<HighHitAnalysis> => {
  const ai = getAiClient();
  
  // STEP 1: Check price vetoes in TypeScript (no AI needed)
  const priceVeto = checkPriceVetoes(game);
  if (priceVeto.triggered) {
    return {
      decision: 'PASS',
      vetoTriggered: true,
      vetoReason: priceVeto.reason,
      researchSummary: 'Price veto triggered before research phase.',
    };
  }
  
  // STEP 2: Calculate sharp baseline (TypeScript math)
  let sharpImpliedProb: number | undefined;
  let lineValueCents: number | undefined;
  let lineValuePoints: number | undefined;
  let softBestOdds: string | undefined;
  let softBestBook: string | undefined;
  
  if (game.sharpLines && game.softLines.length > 0) {
    // Calculate no-vig probability from sharp
    const noVig = calculateNoVigProb(game.sharpLines.mlOddsA, game.sharpLines.mlOddsB);
    sharpImpliedProb = noVig.probA; // Away team's fair probability
    
    // Find best soft line (track index to use for line value calculation)
    let bestJuiceDiff = -999;
    let bestSoftIndex = 0;
    
    for (let i = 0; i < game.softLines.length; i++) {
      const soft = game.softLines[i];
      const juiceDiff = calculateJuiceDiff(game.sharpLines.spreadOddsA, soft.spreadOddsA);
      if (juiceDiff > bestJuiceDiff) {
        bestJuiceDiff = juiceDiff;
        bestSoftIndex = i;
        softBestOdds = soft.spreadOddsA;
        softBestBook = soft.bookName;
      }
    }
    
    lineValueCents = bestJuiceDiff;
    
    // Calculate line value (point difference) using the SAME best soft book
    const bestSoft = game.softLines[bestSoftIndex];
    lineValuePoints = calculateLineDiff(game.sharpLines.spreadLineA, bestSoft.spreadLineA);
  }
  
  // STEP 3: AI Research + Veto Check (constrained role)
  const researchPrompt = `
MATCHUP: ${game.awayTeam.name} at ${game.homeTeam.name}
SPORT: ${game.sport}
DATE: ${game.date}

SHARP LINES (Pinnacle):
- Spread: ${game.sharpLines?.spreadLineA || 'N/A'} (${game.sharpLines?.spreadOddsA || 'N/A'})
- ML: ${game.sharpLines?.mlOddsA || 'N/A'} / ${game.sharpLines?.mlOddsB || 'N/A'}
- Total: ${game.sharpLines?.totalLine || 'N/A'}

CALCULATED FAIR PROBABILITY (from sharp line): ${sharpImpliedProb?.toFixed(1) || 'N/A'}%
(This is MATH, not your estimate. Do not change it.)

YOUR TASK:
1. Search for injuries, rest, efficiency rankings, and lineup confirmations.
2. Check each VETO rule against what you find.
3. If ANY veto triggers, return decision: "PASS" with vetoReason.
4. If no veto triggers, return decision: "PLAYABLE" with researchSummary.

Remember: You do NOT estimate probability. The math is already done above.
PASSING IS PROFITABLE.
`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash', // Flash is fine for research, and more reliable than Pro for rule-following
    contents: researchPrompt,
    config: {
      systemInstruction: HIGH_HIT_SYSTEM_PROMPT,
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: analysisSchema,
      temperature: 0.2 // Low for strict rule adherence
    }
  });

  if (!response.text) throw new Error("Analysis failed");
  
  const aiResult = JSON.parse(response.text);
  
  // Combine AI research with TypeScript calculations
  return {
    decision: aiResult.decision,
    vetoTriggered: aiResult.vetoTriggered,
    vetoReason: aiResult.vetoReason,
    researchSummary: aiResult.researchSummary,
    edgeNarrative: aiResult.edgeNarrative,
    market: aiResult.market,
    side: aiResult.side,
    line: aiResult.line,
    // TypeScript-calculated values (the truth)
    sharpImpliedProb,
    softBestOdds,
    softBestBook,
    lineValueCents,
    lineValuePoints,
  };
};

// ============================================
// QUICK SCAN SERVICE
// ============================================

export const quickScanGame = async (game: Game): Promise<{ signal: 'RED' | 'YELLOW' | 'WHITE', description: string }> => {
  const ai = getAiClient();
  const prompt = `
Quick injury/rest scan for: ${game.awayTeam.name} at ${game.homeTeam.name} (${game.sport})
Date: ${game.date}

Search for:
1. Major injuries (stars OUT or Questionable)
2. Back-to-back or 3-in-4 rest disadvantage
3. NHL: Goalie confirmation
4. MLB: Pitcher confirmation

Return JSON:
{
  "signal": "RED" (major injury/rest), "YELLOW" (minor concern), "WHITE" (nothing notable),
  "description": "Brief summary under 15 words"
}
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0.2
      }
    });

    let text = response.text || "{}";
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    try {
      return JSON.parse(text);
    } catch {
      return { signal: 'WHITE', description: 'Could not parse scan result' };
    }
  } catch (e) {
    console.error("Quick scan failed", e);
    return { signal: 'WHITE', description: 'Scan failed' };
  }
};

// ============================================
// LINE COMPARISON HELPERS
// ============================================

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

// ============================================
// HELPERS
// ============================================

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
