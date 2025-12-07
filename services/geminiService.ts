import { GoogleGenAI, Type, Schema } from "@google/genai";
import { BookLines, QueuedGame, HighHitAnalysis, Game } from '../types';
import { EXTRACTION_PROMPT, HIGH_HIT_SYSTEM_PROMPT } from '../constants';

const getAiClient = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

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

export const calculateJuiceDiff = (sharpOdds: string, softOdds: string): number => {
  const sharp = normalizeToAmerican(sharpOdds);
  const soft = normalizeToAmerican(softOdds);
  
  if (isNaN(sharp) || isNaN(soft) || sharp === 0 || soft === 0) return 0;
  
  return Math.round(soft - sharp);
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
    case 'NHL': 
    case 'MLB': spreadLimit = 4.0; break;
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

// Helper to get reference lines (safe for SSR/Node, though this runs in browser)
const getReferenceLines = (gameId: string) => {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(`edgelab_reference_${gameId}`);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
};

// ============================================
// LINE VALUE CALCULATOR - ANALYZES ALL SIDES
// ============================================

interface SideValue {
  side: 'AWAY' | 'HOME' | 'OVER' | 'UNDER';
  market: 'Spread' | 'Moneyline' | 'Total';
  sharpLine: string;
  sharpOdds: string;
  bestSoftLine: string;
  bestSoftOdds: string;
  bestSoftBook: string;
  lineValue: number;      // positive = getting better number
  priceValue: number;     // cents of juice saved
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

      // SANITY CHECK 1: Filter out bad OCR scans 
      // Odds > 2000 or < -2000 are usually errors or massive longshots we ignore
      const sVal = parseFloat(softOdds);
      if (Math.abs(sVal) > 2000) return;

      const lineValue = calculateLineDiff(sharpLine, softLine);
      const priceValue = calculateJuiceDiff(sharpOdds, softOdds);
      
      // SANITY CHECK 2: The "Ghost Edge" Killer
      // If the price difference is massive (> 50 cents), it's likely a data error, not a real edge.
      // Real edges are boring: +5 to +15 cents. Not +219 cents.
      if (Math.abs(priceValue) > 50) return;

      // For underdogs (positive spread), MORE points is better (positive lineValue)
      // For favorites (negative spread), FEWER points is better (lineValue should be positive when soft is less negative)
      // The calculateLineDiff returns soft - sharp, so:
      // - Underdog: sharp +12.5, soft +13.5 → lineValue = +1 (good!)
      // - Favorite: sharp -12.5, soft -13.5 → lineValue = -1 (bad!)
      
      // Score: lineValue (for spreads) + priceValue/10 (juice matters less than points)
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
      // Determine if this side has positive value
      // For spreads: positive line value (getting more points as dog, laying fewer as fav)
      // For ML/Totals: positive price value
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

  // Check all sides
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
// MAIN ANALYSIS - HOLISTIC APPROACH
// ============================================

export const analyzeGame = async (game: QueuedGame): Promise<HighHitAnalysis> => {
  const ai = getAiClient();
  
  // ========== STEP 1: PRICE VETO (TypeScript) ==========
  const priceVeto = checkPriceVetoes(game);
  if (priceVeto.triggered) {
    return {
      decision: 'PASS',
      vetoTriggered: true,
      vetoReason: priceVeto.reason,
      researchSummary: 'Price veto triggered before research.',
    };
  }
  
  // ========== STEP 2: ANALYZE ALL SIDES ==========
  let sharpImpliedProb = 50;
  let allSides: SideValue[] = [];

  if (game.sharpLines) {
    const noVig = calculateNoVigProb(game.sharpLines.mlOddsA, game.sharpLines.mlOddsB);
    sharpImpliedProb = noVig.probA;

    if (game.softLines.length > 0) {
      allSides = analyzeAllSides(game.sharpLines, game.softLines);
    }
  }
  
  // ========== STEP 3: CHECK IF ANY VALUE EXISTS ==========
  const sidesWithValue = allSides.filter(s => s.hasPositiveValue);
  
  if (sidesWithValue.length === 0) {
    return {
      decision: 'PASS',
      vetoTriggered: true,
      vetoReason: "NO_VALUE: No positive line or price value found on any side.",
      researchSummary: "Math scan complete. All soft book lines are equal or worse than Pinnacle.",
      sharpImpliedProb,
      lineValueCents: 0,
      lineValuePoints: 0
    };
  }

  // ========== STEP 4: PREPARE DATA FOR AI ==========
  const dateObj = new Date(game.date);
  const readableDate = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric' });
  
  // Retrieve Reference Lines
  const refLines = getReferenceLines(game.id);

  // Calculate Movement
  let movementNarrative = "Movement: No reference line data available (first time seen).";
  if (refLines && game.sharpLines) {
    const refA = parseFloat(refLines.spreadLineA);
    const currA = parseFloat(game.sharpLines.spreadLineA);
    
    if (!isNaN(refA) && !isNaN(currA)) {
      const diff = currA - refA; // e.g. -4.0 - (-3.0) = -1.0
      const absDiff = Math.abs(diff);
      
      if (absDiff < 0.1) {
        movementNarrative = "Movement: Line is stable (no significant sharp movement).";
      } else {
        // If diff is negative (-3 -> -4), line moved TOWARD Away (Away is stronger/favored more)
        // If diff is positive (-4 -> -3), line moved AGAINST Away (Away is weaker/favored less)
        const direction = diff < 0 ? "TOWARD" : "AGAINST";
        movementNarrative = `Movement: Sharps moved ${absDiff.toFixed(1)} points ${direction} ${game.awayTeam.name}.`;
      }
    }
  }

  // Build the value summary for AI
  const valueSummary = sidesWithValue.map(s => {
    const teamName = s.side === 'AWAY' ? game.awayTeam.name : 
                     s.side === 'HOME' ? game.homeTeam.name : s.side;
    const valueDesc = [];
    if (s.lineValue > 0) valueDesc.push(`+${s.lineValue} points`);
    if (s.lineValue < 0) valueDesc.push(`${s.lineValue} points`);
    if (s.priceValue > 0) valueDesc.push(`+${s.priceValue} cents juice`);
    return `- ${teamName} ${s.market} ${s.bestSoftLine} @ ${s.bestSoftBook}: ${valueDesc.join(', ')}`;
  }).join('\n');

  const holisticPrompt = `
## GAME ANALYSIS REQUEST

**Matchup:** ${game.awayTeam.name} (AWAY) at ${game.homeTeam.name} (HOME)
**Sport:** ${game.sport}
**Date:** ${readableDate}

## SHARP LINES (Pinnacle - Market Truth)
Reference Line (First Seen): ${refLines ? `${game.awayTeam.name} ${refLines.spreadLineA}` : 'N/A'}
Current Pinnacle: ${game.awayTeam.name} ${game.sharpLines?.spreadLineA} (${game.sharpLines?.spreadOddsA})
${movementNarrative}

## SIDES WITH POSITIVE VALUE (Soft Books Offering Better Numbers)
${valueSummary}

## YOUR TASK

**Search for current information on BOTH teams:**
1. "${game.awayTeam.name} injury report injuries out" 
2. "${game.homeTeam.name} injury report injuries out"
3. "${game.awayTeam.name} vs ${game.homeTeam.name} preview"

**Then analyze:**
- Which team has MORE injuries / key players OUT?
- Which team is healthier and more likely to perform to expectations?
- Do the injuries favor one side covering the spread?
- Does the LINE VALUE align with the SITUATIONAL EDGE?
- Does the SHARP MOVEMENT align with the VALUE?

## DECISION FRAMEWORK

**PLAYABLE** requires ALL of the following:
1. **Value:** Positive line/price value exists on a side (soft book vs current sharp).
2. **Alignment:** Sharp movement is TOWARD that same side (or neutral).
3. **Situation:** Situational factors (injuries, rest) favor that side (or are neutral).

**PASS** if ANY of the following are true:
- Sharps moved AGAINST the side showing value (Trap Line).
- Situation favors the opponent (betting on bad team just for value).
- Information is unclear.

## OUTPUT JSON
{
  "decision": "PLAYABLE" or "PASS",
  "recommendedSide": "AWAY" or "HOME" or "OVER" or "UNDER",
  "recommendedMarket": "Spread" or "Moneyline" or "Total",
  "reasoning": "2-3 sentences explaining why math + situation + movement align (or don't)",
  "awayTeamInjuries": "Key injuries for away team",
  "homeTeamInjuries": "Key injuries for home team", 
  "situationFavors": "AWAY" or "HOME" or "NEUTRAL",
  "confidence": "HIGH" or "MEDIUM" or "LOW"
}
`;

  const response = await generateWithRetry(ai, {
    model: 'gemini-2.5-flash',
    contents: holisticPrompt,
    config: {
      systemInstruction: `You are EdgeLab v3, a sports betting analyst that synthesizes LINE VALUE, LINE MOVEMENT, and SITUATIONAL FACTORS to find aligned edges.

Your job:
1. Search for injuries and news on BOTH teams
2. Check if Sharp Movement aligns with the Value Side (e.g. if we have value on Home, did Sharps move Toward Home?)
3. Check if Situation aligns with the Value Side (e.g. is Home healthy?)
4. Only recommend PLAYABLE when ALL factors align.

Key Rule: NEVER recommend a side where sharps have moved significantly AGAINST the value (e.g. Value on Home -3, but sharps moved from -5 to -3). This is a trap.

DEFAULT TO PASS if any factor conflicts.`,
      tools: [{ googleSearch: {} }],
      temperature: 0.2
    }
  });

  const fallback = {
    decision: 'PASS',
    recommendedSide: null,
    recommendedMarket: null,
    reasoning: 'Analysis could not be completed.',
    awayTeamInjuries: 'Unknown',
    homeTeamInjuries: 'Unknown',
    situationFavors: 'NEUTRAL',
    confidence: 'LOW'
  };

  const aiResult = cleanAndParseJson(response.text, fallback);
  
  // ========== STEP 5: BUILD RECOMMENDATION ==========
  if (aiResult.decision !== 'PLAYABLE' || !aiResult.recommendedSide) {
    return {
      decision: 'PASS',
      vetoTriggered: false,
      vetoReason: aiResult.reasoning || 'AI did not find aligned edge',
      researchSummary: `Away (${game.awayTeam.name}): ${aiResult.awayTeamInjuries || 'No data'}\nHome (${game.homeTeam.name}): ${aiResult.homeTeamInjuries || 'No data'}\n\nSituation favors: ${aiResult.situationFavors}`,
      edgeNarrative: aiResult.reasoning,
      sharpImpliedProb
    };
  }

  // Find the matching side value
  const selectedSide = sidesWithValue.find(s => 
    s.side === aiResult.recommendedSide && 
    s.market === aiResult.recommendedMarket
  ) || sidesWithValue.find(s => s.side === aiResult.recommendedSide) || sidesWithValue[0];

  const teamName = selectedSide.side === 'AWAY' ? game.awayTeam.name :
                   selectedSide.side === 'HOME' ? game.homeTeam.name :
                   selectedSide.side;

  const recommendation = `${teamName} ${selectedSide.market}`;
  const recLine = selectedSide.market === 'Moneyline' 
    ? formatOddsForDisplay(selectedSide.bestSoftOdds)
    : `${selectedSide.bestSoftLine} (${formatOddsForDisplay(selectedSide.bestSoftOdds)})`;

  return {
    decision: 'PLAYABLE',
    vetoTriggered: false,
    vetoReason: undefined,
    researchSummary: `Away (${game.awayTeam.name}): ${aiResult.awayTeamInjuries || 'No major injuries'}\nHome (${game.homeTeam.name}): ${aiResult.homeTeamInjuries || 'No major injuries'}\n\nSituation favors: ${aiResult.situationFavors}\nConfidence: ${aiResult.confidence}`,
    edgeNarrative: aiResult.reasoning,
    
    recommendation,
    recLine,
    recProbability: selectedSide.side === 'AWAY' ? sharpImpliedProb : 100 - sharpImpliedProb,
    
    market: selectedSide.market,
    side: selectedSide.side,
    line: selectedSide.bestSoftLine,
    
    sharpImpliedProb,
    softBestOdds: formatOddsForDisplay(selectedSide.bestSoftOdds),
    softBestBook: selectedSide.bestSoftBook,
    lineValueCents: selectedSide.priceValue > 0 ? selectedSide.priceValue : 0,
    lineValuePoints: selectedSide.lineValue
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
    Teams: ${game.awayTeam.name} (Away) vs ${game.homeTeam.name} (Home)
    
    Return JSON:
    {
      "signal": "RED" (star player OUT or major injury disparity), "YELLOW" (key player questionable), or "WHITE" (both teams healthy),
      "description": "Max 15 words - summarize injury situation for BOTH teams"
    }
  `;

  try {
    const response = await generateWithRetry(ai, {
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0.2
      }
    });

    return cleanAndParseJson(response.text, { signal: 'WHITE', description: 'Scan completed (no data)' });
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