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
// HELPER: ROBUST JSON PARSER
// ============================================

const cleanAndParseJson = (text: string | undefined): any => {
  if (!text) throw new Error("Empty response from AI");
  
  // Remove markdown code blocks
  let clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
  
  // Attempt to find JSON object structure (first { to last })
  const firstBrace = clean.indexOf('{');
  const lastBrace = clean.lastIndexOf('}');
  
  if (firstBrace !== -1 && lastBrace !== -1) {
    clean = clean.substring(firstBrace, lastBrace + 1);
  }
  
  return JSON.parse(clean);
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

// ============================================
// MARKET SCANNER
// ============================================

// === Find the best value for a SPECIFIC side with SANITY GUARDS ===
const findBestValue = (sharp: BookLines, softLines: BookLines[], sport: string, targetSide: 'AWAY' | 'HOME' | 'OVER' | 'UNDER' | 'ALL' = 'ALL') => {
  let best = {
    valueCents: -999,
    book: '',
    market: 'N/A',
    side: 'N/A',
    line: '',
    odds: '',
    fairProb: 0
  };

  const check = (sharpOdds: string, softOdds: string, market: string, side: string, line: string, bookName: string) => {
    if (!sharpOdds || !softOdds || sharpOdds === 'N/A' || softOdds === 'N/A') return;
    
    // Skip if we're targeting a specific side and this isn't it
    if (targetSide !== 'ALL') {
      if (targetSide === 'AWAY' && side !== 'Away') return;
      if (targetSide === 'HOME' && side !== 'Home') return;
      if (targetSide === 'OVER' && side !== 'Over') return;
      if (targetSide === 'UNDER' && side !== 'Under') return;
    }
    
    // SANITY CHECK 1: Filter out bad OCR scans
    // Real odds are between -2000 and +2000. Anything outside is garbage.
    const sharpNum = parseFloat(sharpOdds);
    const softNum = parseFloat(softOdds);
    if (isNaN(sharpNum) || isNaN(softNum)) return;
    if (Math.abs(sharpNum) > 2000) return;
    if (Math.abs(softNum) > 2000) return;
    
    const fairProb = americanToImpliedProb(sharpOdds);
    
    // SANITY CHECK 2: Probability Caps
    // No spread/puckline is 80% likely. No ML is 92% likely in competitive sports.
    if (market === 'Spread' && fairProb > 80) return;
    if (market === 'Total' && fairProb > 80) return;
    if (market === 'Moneyline' && fairProb > 92) return;

    // Calculate value
    const val = calculateJuiceDiff(sharpOdds, softOdds);
    
    // SANITY CHECK 3: Value Cap
    // If we find >50 cents of value, it's likely mismatched data (alt line vs main, or OCR error)
    // Real edges are 2-15 cents. 50+ is impossible.
    if (val > 50) return;
    
    // SANITY CHECK 4: Negative value cap
    // If value is worse than -50 cents, something is wrong with the data
    if (val < -50) return;

    if (val > best.valueCents) {
      best = { valueCents: val, book: bookName, market, side, line, odds: softOdds, fairProb };
    }
  };

  softLines.forEach(soft => {
    // Check Spreads (Away & Home)
    check(sharp.spreadOddsA, soft.spreadOddsA, 'Spread', 'Away', soft.spreadLineA, soft.bookName);
    check(sharp.spreadOddsB, soft.spreadOddsB, 'Spread', 'Home', soft.spreadLineB, soft.bookName);
    
    // Check Moneylines (Away & Home)
    check(sharp.mlOddsA, soft.mlOddsA, 'Moneyline', 'Away', 'ML', soft.bookName);
    check(sharp.mlOddsB, soft.mlOddsB, 'Moneyline', 'Home', 'ML', soft.bookName);
    
    // Check Totals — NHL ONLY per v2.1 rules
    if (sport === 'NHL') {
      check(sharp.totalOddsOver, soft.totalOddsOver, 'Total', 'Over', `o${soft.totalLine}`, soft.bookName);
      check(sharp.totalOddsUnder, soft.totalOddsUnder, 'Total', 'Under', `u${soft.totalLine}`, soft.bookName);
    }
  });

  return best;
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

  return cleanAndParseJson(response.text);
};

// ============================================
// ANALYSIS SERVICE (Research + Veto Check)
// ============================================

export const analyzeGame = async (game: QueuedGame): Promise<HighHitAnalysis> => {
  const ai = getAiClient();
  
  // STEP 1: Check price vetoes (TypeScript)
  const priceVeto = checkPriceVetoes(game);
  if (priceVeto.triggered) {
    return {
      decision: 'PASS',
      vetoTriggered: true,
      vetoReason: priceVeto.reason,
      researchSummary: 'Price veto triggered.',
    };
  }
  
  // STEP 2: Find the BEST mathematical edge across all markets
  let bestValue = { valueCents: 0, book: 'N/A', market: 'N/A', side: 'N/A', line: '', odds: '', fairProb: 0 };
  let sharpImpliedProb = 0;

  if (game.sharpLines && game.softLines.length > 0) {
    const noVig = calculateNoVigProb(game.sharpLines.mlOddsA, game.sharpLines.mlOddsB);
    sharpImpliedProb = noVig.probA;

    // Scan all markets for best value (with sanity guards)
    bestValue = findBestValue(game.sharpLines, game.softLines, game.sport);
  }
  
  // STEP 3: AI Research (Constrained)
  const dateObj = new Date(game.date);
  const readableDate = dateObj.toLocaleDateString('en-US', { 
    weekday: 'short', 
    month: 'long', 
    day: 'numeric' 
  });

  const researchPrompt = `
MATCHUP: ${game.awayTeam.name} at ${game.homeTeam.name}
SPORT: ${game.sport}
DATE: ${readableDate}

SHARP LINES (Pinnacle):
- Spread: ${game.sharpLines?.spreadLineA || 'N/A'} (${game.sharpLines?.spreadOddsA || 'N/A'})
- ML: ${game.sharpLines?.mlOddsA || 'N/A'} / ${game.sharpLines?.mlOddsB || 'N/A'}
- Total: ${game.sharpLines?.totalLine || 'N/A'}

MATHEMATICAL CONTEXT:
Best Value Found: ${bestValue.side} ${bestValue.market} (+${bestValue.valueCents} cents edge at ${bestValue.book})

YOUR TASK:
1. Search for injuries, rest, efficiency rankings, and lineup confirmations.
2. Check each VETO rule against what you find.
3. If ANY veto triggers, return decision: "PASS" with vetoReason.
4. If no veto triggers, return decision: "PLAYABLE" with researchSummary.
5. You MUST return ONLY valid JSON.

Remember: PASSING IS PROFITABLE.
`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: researchPrompt,
    config: {
      systemInstruction: HIGH_HIT_SYSTEM_PROMPT,
      tools: [{ googleSearch: {} }],
      // NOTE: Cannot use responseMimeType with tools for this model config
      temperature: 0.2
    }
  });

  const aiResult = cleanAndParseJson(response.text);

  // SANITY CHECK: If no valid value found after guards, something is wrong with the data
  if (bestValue.valueCents <= 0 && aiResult.decision === 'PLAYABLE') {
    console.warn("AI said PLAYABLE but no valid line value found after sanity checks. Check OCR data.");
  }
  
  // STEP 4: Build recommendation using MATH (not AI)
  const teamName = bestValue.side === 'Away' ? game.awayTeam.name : 
                   bestValue.side === 'Home' ? game.homeTeam.name :
                   bestValue.side; // For Over/Under
  
  const recommendation = bestValue.market === 'N/A' 
    ? undefined 
    : `${teamName} ${bestValue.market}`;

  const recLine = bestValue.market === 'Total' 
    ? `${bestValue.line} (${bestValue.odds})`
    : bestValue.market === 'Spread'
    ? `${bestValue.line} (${bestValue.odds})`
    : bestValue.odds; // ML just shows odds

  return {
    decision: aiResult.decision,
    vetoTriggered: aiResult.vetoTriggered,
    vetoReason: aiResult.vetoReason,
    researchSummary: aiResult.researchSummary,
    edgeNarrative: aiResult.edgeNarrative,
    
    // Math-derived recommendation
    recommendation: aiResult.decision === 'PLAYABLE' ? recommendation : undefined,
    recLine: aiResult.decision === 'PLAYABLE' ? recLine : undefined,
    recProbability: bestValue.fairProb,
    
    market: bestValue.market,
    side: bestValue.side,
    line: bestValue.line,
    
    sharpImpliedProb,
    softBestOdds: bestValue.odds,
    softBestBook: bestValue.book,
    lineValueCents: bestValue.valueCents,
    // Note: lineValuePoints was part of previous types but not fully used here, 
    // maintaining consistency with interface if needed but primarily using cents value now.
    lineValuePoints: 0 
  };
};

// ============================================
// QUICK SCAN SERVICE
// ============================================

export const quickScanGame = async (game: Game): Promise<{ signal: 'RED' | 'YELLOW' | 'WHITE', description: string }> => {
  const ai = getAiClient();
  
  // FIX: Format the date to be human-readable for the Search Engine
  // This prevents the "Game not scheduled" error caused by ISO timestamps
  const dateObj = new Date(game.date);
  const readableDate = dateObj.toLocaleDateString('en-US', { 
    weekday: 'short', 
    month: 'long', 
    day: 'numeric' 
  });

  const prompt = `
    You are a sports betting researcher. Perform a Google Search for this specific matchup:
    "${game.awayTeam.name} vs ${game.homeTeam.name} ${game.sport} injury report ${readableDate}"
    
    CONTEXT:
    - Sport: ${game.sport}
    - Teams: ${game.awayTeam.name} (Away) vs ${game.homeTeam.name} (Home)
    - Date: ${readableDate}
    
    TASK:
    1. Check for **Major Injuries** to star players (OUT/Doubtful).
    2. Check for **Rest Disadvantage** (Back-to-backs).
    3. (NHL Only) Check for **Goalie Confirmation**.
    
    CRITICAL RULES:
    - Do NOT invent team names. Use the exact names provided above.
    - If the exact date search fails, look for the most recent news for these two teams.
    - If no major news is found, return WHITE signal.
    
    Output valid JSON:
    {
      "signal": "RED" (if Star OUT or huge rest disadv), "YELLOW" (minor injury/unconfirmed goalie), "WHITE" (standard game),
      "description": "Max 10 words. Be specific (e.g. 'Matthews OUT', 'Utah B2B', 'Oettinger Confirmed')"
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
      const json = JSON.parse(text);
      return {
        signal: json.signal || 'WHITE',
        description: json.description || 'Scan completed'
      };
    } catch (parseError) {
      console.warn("Could not parse scan result, returning default.", text);
      return { signal: 'WHITE', description: 'No significant news found' };
    }
  } catch (e) {
    console.error("Quick scan failed", e);
    return { signal: 'WHITE', description: 'Scan unavailable' };
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
