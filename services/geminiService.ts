import { GoogleGenAI, Type, Schema } from "@google/genai";
import { BookLines, QueuedGame, HighHitAnalysis, Game } from '../types';
import { EXTRACTION_PROMPT, HIGH_HIT_SYSTEM_PROMPT, VETO_RULES } from '../constants';

const getAiClient = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

// ============================================
// MATH FUNCTIONS (TypeScript, NOT LLM)
// ============================================

/**
 * Helper: Convert any odds format to American Number
 * Handles Decimal (1.91) vs American (-110) distinction automatically.
 */
const normalizeToAmerican = (odds: string | number): number => {
  const val = typeof odds === 'string' ? parseFloat(odds) : odds;
  if (isNaN(val)) return 0;

  // Heuristic: If odds are between 1.0 and 9.0 (exclusive of 0), it's likely Decimal.
  // American odds of 1 to 9 would be +1 to +9 (impossible in betting).
  // Smallest favorite -10000, Smallest dog +100.
  // Exception: Huge longshots in Decimal (e.g. 50.0) vs American (+4900).
  // We assume values < 100 and > 1.0 are Decimal.
  
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

/**
 * Convert American odds to implied probability
 * -110 → 52.38%, +150 → 40.00%
 */
export const americanToImpliedProb = (odds: string | number): number => {
  const o = normalizeToAmerican(odds);
  if (isNaN(o) || o === 0) return 50;
  
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
  
  // SANITY CHECK: If either side is >90%, data is corrupted (no real game is 90%+ likely)
  if (impliedA > 90 || impliedB > 90) {
    console.warn(`Sanity check failed: impliedA=${impliedA.toFixed(1)}%, impliedB=${impliedB.toFixed(1)}%. Returning 50/50.`);
    return { probA: 50, probB: 50 };
  }
  
  const total = impliedA + impliedB;
  return {
    probA: Math.round((impliedA / total) * 1000) / 10,
    probB: Math.round((impliedB / total) * 1000) / 10
  };
};

/**
 * Calculate juice difference (Value) in cents
 * Postive Result = Soft Book is Better (Value)
 * Negative Result = Sharp Book is Better (No Value)
 */
export const calculateJuiceDiff = (sharpOdds: string, softOdds: string): number => {
  const sharp = normalizeToAmerican(sharpOdds);
  const soft = normalizeToAmerican(softOdds);
  
  if (isNaN(sharp) || isNaN(soft) || sharp === 0 || soft === 0) return 0;
  
  // Logic: Always "Soft - Sharp" works for both positive and negative American odds
  // Example Neg: Soft -105 (better), Sharp -110. (-105) - (-110) = +5. (Value)
  // Example Pos: Soft +150 (better), Sharp +140. 150 - 140 = +10. (Value)
  // Example Mixed: Soft +105, Sharp -105. 105 - (-105) = 210 (Huge value/Arb)
  
  return Math.round(soft - sharp);
};

/**
 * Calculate point spread difference (line value in points)
 */
export const calculateLineDiff = (sharpLine: string, softLine: string): number => {
  const sharp = parseFloat(sharpLine);
  const soft = parseFloat(softLine);
  if (isNaN(sharp) || isNaN(soft)) return 0;
  return Math.round((soft - sharp) * 10) / 10;
};

/**
 * Check price-based vetoes (done in TypeScript, not AI)
 */
export const checkPriceVetoes = (game: QueuedGame): { triggered: boolean, reason?: string } => {
  if (!game.sharpLines) return { triggered: false };
  
  const spreadA = Math.abs(parseFloat(game.sharpLines.spreadLineA));
  
  // Sport-specific spread caps
  let spreadLimit = 10.0;
  switch (game.sport) {
    case 'NFL': spreadLimit = 14.0; break;   // Two TDs
    case 'NBA': spreadLimit = 16.0; break;
    case 'CFB': spreadLimit = 24.0; break;   // Three TDs + FG
    case 'NHL': 
    case 'MLB': spreadLimit = 4.0; break;    // Puckline/Runline max
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
// HELPER: ROBUST JSON PARSER
// ============================================

const cleanAndParseJson = (text: string | undefined): any => {
  if (!text) throw new Error("Empty response from AI");
  
  let clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
  
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
// MARKET SCANNER WITH SANITY GUARDS
// ============================================

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
    const sharpNum = parseFloat(sharpOdds);
    const softNum = parseFloat(softOdds);
    if (isNaN(sharpNum) || isNaN(softNum)) return;
    if (Math.abs(sharpNum) > 2000) return;
    if (Math.abs(softNum) > 2000) return;
    
    const fairProb = americanToImpliedProb(sharpOdds);
    
    // SANITY CHECK 2: Probability Caps
    if (market === 'Spread' && fairProb > 80) return;
    if (market === 'Total' && fairProb > 80) return;
    if (market === 'Moneyline' && fairProb > 92) return;

    const val = calculateJuiceDiff(sharpOdds, softOdds);
    
    // SANITY CHECK 3: Value Cap
    if (val > 50) return;
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
    
    // Check Totals (All Sports)
    check(sharp.totalOddsOver, soft.totalOddsOver, 'Total', 'Over', `o${soft.totalLine}`, soft.bookName);
    check(sharp.totalOddsUnder, soft.totalOddsUnder, 'Total', 'Under', `u${soft.totalLine}`, soft.bookName);
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
      temperature: 0.1
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
      researchSummary: 'Price veto triggered before research.',
    };
  }
  
  // STEP 2: Get sharp probabilities AND run initial math scan
  let sharpImpliedProb = 50;
  let initialBestValue = { valueCents: 0, book: 'N/A', market: 'N/A', side: 'N/A', line: '', odds: '', fairProb: 0 };

  if (game.sharpLines) {
    const noVig = calculateNoVigProb(game.sharpLines.mlOddsA, game.sharpLines.mlOddsB);
    sharpImpliedProb = noVig.probA;

    // Scan ALL markets immediately to see if ANY value exists
    if (game.softLines.length > 0) {
      initialBestValue = findBestValue(game.sharpLines, game.softLines, game.sport, 'ALL');
    }
  }
  
  // STEP 2.5: MATH_VETO - Skip AI call if no mathematical edge exists
  if (initialBestValue.valueCents <= 0 || initialBestValue.market === 'N/A') {
    return {
      decision: 'PASS',
      vetoTriggered: true,
      vetoReason: "MATH_VETO: No positive value found on any market after sanity checks.",
      researchSummary: "Mathematical scan completed. No edge found. Skipped AI research to save costs.",
      edgeNarrative: "No mathematical edge - passing.",
      market: "N/A",
      side: "N/A",
      line: "N/A",
      sharpImpliedProb,
      softBestOdds: "N/A",
      softBestBook: "N/A",
      lineValueCents: 0,
      lineValuePoints: 0
    };
  }
  
  // STEP 3: AI Research - NOW ASKS FOR edgeFavors
  const dateObj = new Date(game.date);
  const readableDate = dateObj.toLocaleDateString('en-US', { 
    weekday: 'short', 
    month: 'long', 
    day: 'numeric' 
  });

  const researchPrompt = `
MATCHUP: ${game.awayTeam.name} (AWAY) at ${game.homeTeam.name} (HOME)
SPORT: ${game.sport}
DATE: ${readableDate}

SHARP LINES (Pinnacle):
- Spread: ${game.awayTeam.name} ${game.sharpLines?.spreadLineA || 'N/A'} (${game.sharpLines?.spreadOddsA || 'N/A'})
- ML: ${game.awayTeam.name} ${game.sharpLines?.mlOddsA || 'N/A'} / ${game.homeTeam.name} ${game.sharpLines?.mlOddsB || 'N/A'}
- Total: ${game.sharpLines?.totalLine || 'N/A'}

YOUR TASK:
1. Search for injuries, rest, efficiency rankings, and lineup confirmations.
2. Check each VETO rule against what you find.
3. If ANY veto triggers → decision: "PASS"
4. If no veto triggers → decision: "PLAYABLE"

5. **CRITICAL NEW FIELD - edgeFavors**: Based on your research, which side does the situational edge favor?
   - "AWAY" = Research suggests ${game.awayTeam.name} has an edge (injuries to opponent, rest advantage, etc.)
   - "HOME" = Research suggests ${game.homeTeam.name} has an edge
   - "OVER" = Research suggests high-scoring game (both teams healthy offense, pace-up, etc.)
   - "UNDER" = Research suggests low-scoring game (strong defenses, key offensive players out)
   - "NONE" = No clear situational edge found (coin flip)

If edgeFavors is "NONE", you MUST set decision to "PASS" - we don't bet coin flips.

OUTPUT JSON:
{
  "decision": "PLAYABLE" or "PASS",
  "edgeFavors": "AWAY" | "HOME" | "OVER" | "UNDER" | "NONE",
  "vetoTriggered": true/false,
  "vetoReason": "Which veto and why" or null,
  "researchSummary": "Bullet points of injuries, rest, efficiency findings",
  "edgeNarrative": "Plain English: Why does the edge favor this side?"
}

Remember: PASSING IS PROFITABLE. When in doubt, edgeFavors = "NONE" → decision = "PASS"
`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: researchPrompt,
    config: {
      systemInstruction: HIGH_HIT_SYSTEM_PROMPT,
      tools: [{ googleSearch: {} }],
      temperature: 0.2
    }
  });

  const aiResult = cleanAndParseJson(response.text);
  
  // STEP 4: If AI found no edge, auto-PASS
  if (aiResult.edgeFavors === 'NONE' || !aiResult.edgeFavors) {
    return {
      decision: 'PASS',
      vetoTriggered: false,
      vetoReason: 'No clear situational edge identified',
      researchSummary: aiResult.researchSummary || 'Research found no compelling edge.',
      edgeNarrative: 'Coin flip - no bet.'
    };
  }
  
  // STEP 5: AI found an edge direction - now find best price for THAT SIDE
  // Reset bestValue to ensure we only pick something that matches the AI's narrative
  let bestValue = { valueCents: 0, book: 'N/A', market: 'N/A', side: 'N/A', line: '', odds: '', fairProb: 0 };
  
  if (game.sharpLines && game.softLines.length > 0) {
    // Map AI's edgeFavors to our targetSide format
    const targetSide = aiResult.edgeFavors as 'AWAY' | 'HOME' | 'OVER' | 'UNDER';
    
    bestValue = findBestValue(game.sharpLines, game.softLines, game.sport, targetSide);
    
    // STEP 5.5: If no value found for AI's side, build fallback recommendation
    if (bestValue.market === 'N/A' || bestValue.valueCents <= 0) {
      let fallbackOdds = '';
      let fallbackLine = '';
      let fallbackFairProb = 50;
      let fallbackMarket = 'Moneyline';
      let fallbackSide = '';
      
      if (targetSide === 'AWAY') {
        fallbackOdds = game.sharpLines!.mlOddsA;
        fallbackLine = 'ML';
        fallbackFairProb = sharpImpliedProb;
        fallbackMarket = 'Moneyline';
        fallbackSide = 'Away';
      } else if (targetSide === 'HOME') {
        fallbackOdds = game.sharpLines!.mlOddsB;
        fallbackLine = 'ML';
        fallbackFairProb = 100 - sharpImpliedProb;
        fallbackMarket = 'Moneyline';
        fallbackSide = 'Home';
      } else if (targetSide === 'OVER') {
        fallbackOdds = game.sharpLines!.totalOddsOver || '-110';
        fallbackLine = `o${game.sharpLines!.totalLine}`;
        fallbackFairProb = 50;
        fallbackMarket = 'Total';
        fallbackSide = 'Over';
      } else if (targetSide === 'UNDER') {
        fallbackOdds = game.sharpLines!.totalOddsUnder || '-110';
        fallbackLine = `u${game.sharpLines!.totalLine}`;
        fallbackFairProb = 50;
        fallbackMarket = 'Total';
        fallbackSide = 'Under';
      }
      
      bestValue = {
        valueCents: 0,
        book: 'Sharp Price (no soft edge)',
        market: fallbackMarket,
        side: fallbackSide,
        line: fallbackLine,
        odds: fallbackOdds,
        fairProb: fallbackFairProb
      };
    }
  }
  
  // STEP 6: Build final recommendation
  const teamName = bestValue.side === 'Away' ? game.awayTeam.name : 
                   bestValue.side === 'Home' ? game.homeTeam.name :
                   bestValue.side;
  
  const recommendation = `${teamName} ${bestValue.market}`;

  const recLine = bestValue.market === 'Total' 
    ? `${bestValue.line} (${bestValue.odds})`
    : bestValue.market === 'Spread'
    ? `${bestValue.line} (${bestValue.odds})`
    : bestValue.odds;

  return {
    decision: aiResult.decision === 'PASS' ? 'PASS' : 'PLAYABLE',
    vetoTriggered: aiResult.vetoTriggered || false,
    vetoReason: aiResult.vetoReason,
    researchSummary: aiResult.researchSummary,
    edgeNarrative: aiResult.edgeNarrative,
    
    // Math-derived recommendation (filtered by AI's edge direction)
    recommendation: aiResult.decision !== 'PASS' ? recommendation : undefined,
    recLine: aiResult.decision !== 'PASS' ? recLine : undefined,
    recProbability: bestValue.fairProb,
    
    market: bestValue.market,
    side: bestValue.side,
    line: bestValue.line,
    
    sharpImpliedProb,
    softBestOdds: bestValue.odds,
    softBestBook: bestValue.book,
    lineValueCents: bestValue.valueCents > 0 ? bestValue.valueCents : 0,
    lineValuePoints: 0 
  };
};

// ============================================
// QUICK SCAN SERVICE
// ============================================

export const quickScanGame = async (game: Game): Promise<{ signal: 'RED' | 'YELLOW' | 'WHITE', description: string }> => {
  const ai = getAiClient();
  
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
