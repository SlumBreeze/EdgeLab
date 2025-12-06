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
  
  if (impliedA > 90 || impliedB > 90) {
    // Soft sanity check warning, but don't break flow
    // console.warn(`Sanity check: impliedA=${impliedA.toFixed(1)}%, impliedB=${impliedB.toFixed(1)}%`);
  }
  
  const total = impliedA + impliedB;
  // Prevent divide by zero
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
    // Simple backoff
    await new Promise(r => setTimeout(r, 1000 * (i + 1))); 
  }
  // Return a dummy response to prevent crash if retries exhausted
  return { text: undefined };
};

// ============================================
// MARKET SCANNER - FINDS THE MATH EDGE
// ============================================

const findBestValue = (sharp: BookLines, softLines: BookLines[], sport: string) => {
  let best = {
    valueCents: -999,
    valuePoints: 0,
    book: '',
    market: 'N/A',
    side: 'N/A',
    line: '',
    odds: '',
    fairProb: 0,
    teamType: '' as 'AWAY' | 'HOME' | 'OVER' | 'UNDER' | ''
  };

  const check = (
    sharpOdds: string, 
    softOdds: string, 
    sharpLine: string,
    softLine: string,
    market: string, 
    side: string, 
    bookName: string,
    teamType: 'AWAY' | 'HOME' | 'OVER' | 'UNDER'
  ) => {
    if (!sharpOdds || !softOdds || sharpOdds === 'N/A' || softOdds === 'N/A') return;
    
    const sharpNum = parseFloat(sharpOdds);
    const softNum = parseFloat(softOdds);
    if (isNaN(sharpNum) || isNaN(softNum)) return;
    if (Math.abs(sharpNum) > 2000 || Math.abs(softNum) > 2000) return;
    
    const fairProb = americanToImpliedProb(sharpOdds);
    
    if (market === 'Spread' && fairProb > 80) return;
    if (market === 'Total' && fairProb > 80) return;
    if (market === 'Moneyline' && fairProb > 92) return;

    const valueCents = calculateJuiceDiff(sharpOdds, softOdds);
    const valuePoints = calculateLineDiff(sharpLine, softLine);
    
    if (valueCents > 50 || valueCents < -50) return;

    // Prioritize: 1) Line value (points), 2) Price value (cents)
    const totalScore = (Math.abs(valuePoints) * 10) + valueCents;
    const bestScore = (Math.abs(best.valuePoints) * 10) + best.valueCents;

    if (totalScore > bestScore) {
      best = { 
        valueCents, 
        valuePoints,
        book: bookName, 
        market, 
        side, 
        line: softLine, 
        odds: softOdds, 
        fairProb,
        teamType
      };
    }
  };

  softLines.forEach(soft => {
    // Spreads
    check(sharp.spreadOddsA, soft.spreadOddsA, sharp.spreadLineA, soft.spreadLineA, 'Spread', 'Away', soft.bookName, 'AWAY');
    check(sharp.spreadOddsB, soft.spreadOddsB, sharp.spreadLineB, soft.spreadLineB, 'Spread', 'Home', soft.bookName, 'HOME');
    
    // Moneylines
    check(sharp.mlOddsA, soft.mlOddsA, 'ML', 'ML', 'Moneyline', 'Away', soft.bookName, 'AWAY');
    check(sharp.mlOddsB, soft.mlOddsB, 'ML', 'ML', 'Moneyline', 'Home', soft.bookName, 'HOME');
    
    // Totals
    check(sharp.totalOddsOver, soft.totalOddsOver, sharp.totalLine, soft.totalLine, 'Total', 'Over', soft.bookName, 'OVER');
    check(sharp.totalOddsUnder, soft.totalOddsUnder, sharp.totalLine, soft.totalLine, 'Total', 'Under', soft.bookName, 'UNDER');
  });

  return best;
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
// MAIN ANALYSIS - MATH FIRST, THEN VETO CHECK
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
  
  // ========== STEP 2: FIND MATH EDGE ==========
  let sharpImpliedProb = 50;
  let mathEdge = { 
    valueCents: 0, 
    valuePoints: 0,
    book: 'N/A', 
    market: 'N/A', 
    side: 'N/A', 
    line: '', 
    odds: '', 
    fairProb: 0,
    teamType: '' as 'AWAY' | 'HOME' | 'OVER' | 'UNDER' | ''
  };

  if (game.sharpLines) {
    const noVig = calculateNoVigProb(game.sharpLines.mlOddsA, game.sharpLines.mlOddsB);
    sharpImpliedProb = noVig.probA;

    if (game.softLines.length > 0) {
      mathEdge = findBestValue(game.sharpLines, game.softLines, game.sport);
    }
  }
  
  // ========== STEP 3: NO MATH EDGE = PASS ==========
  const hasLineValue = Math.abs(mathEdge.valuePoints) >= 0.5;
  const hasPriceValue = mathEdge.valueCents >= 5;
  
  if (!hasLineValue && !hasPriceValue) {
    return {
      decision: 'PASS',
      vetoTriggered: true,
      vetoReason: "NO_VALUE: No line or price edge found vs sharp book.",
      researchSummary: "Math scan complete. Soft books match or are worse than Pinnacle.",
      sharpImpliedProb,
      lineValueCents: mathEdge.valueCents,
      lineValuePoints: mathEdge.valuePoints
    };
  }
  
  // ========== STEP 4: MATH EDGE EXISTS - ASK AI TO VETO CHECK ==========
  const dateObj = new Date(game.date);
  const readableDate = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric' });
  
  const teamToBet = mathEdge.side === 'Away' ? game.awayTeam.name : 
                    mathEdge.side === 'Home' ? game.homeTeam.name :
                    mathEdge.side; // Over/Under

  const researchPrompt = `
MATH EDGE IDENTIFIED - VETO CHECK REQUIRED

MATCHUP: ${game.awayTeam.name} (AWAY) at ${game.homeTeam.name} (HOME)
SPORT: ${game.sport}
DATE: ${readableDate}

## THE MATH EDGE WE FOUND
- Market: ${mathEdge.market}
- Side: ${teamToBet} (${mathEdge.side})
- Line: ${mathEdge.line}
- Odds: ${mathEdge.odds} at ${mathEdge.book}
- Value: ${mathEdge.valuePoints >= 0.5 ? `+${mathEdge.valuePoints} points` : ''} ${mathEdge.valueCents > 0 ? `+${mathEdge.valueCents} cents` : ''}

## YOUR JOB
We have a MATH EDGE. Your job is to CHECK if anything VETOES this bet.

Search for:
1. "${teamToBet} injury report" - Is any KEY player OUT?
2. "${teamToBet} offensive efficiency ranking" - Are they Bottom 10?
3. Sport-specific confirmations (goalie/pitcher/QB if applicable)

## VETO CONDITIONS (Only these can trigger PASS)
- EFFICIENCY_FLOOR: ${teamToBet} is Bottom 10 in offensive efficiency
- KEY_PLAYER_OUT: Star player (All-Star/All-Pro level) is OUT for ${teamToBet}
- GOALIE_UNKNOWN (NHL): Goalie unconfirmed for ${teamToBet}
- PITCHER_UNKNOWN (MLB): Pitcher unconfirmed for ${teamToBet}
- QB_UNCERTAINTY (CFB): QB unconfirmed or freshman for ${teamToBet}

## NOT A VETO
- Opponent has injuries (this HELPS our bet)
- Role players out (not stars)
- Team is underdog (the math accounts for this)
- Weather, travel, etc. (not disqualifying)

## OUTPUT JSON
{
  "decision": "PLAYABLE" or "PASS",
  "vetoTriggered": true or false,
  "vetoReason": "Specific veto rule and evidence" or null,
  "researchSummary": "What you found about ${teamToBet} and opponent",
  "edgeConfirmation": "Why the math edge is valid OR why it's vetoed"
}

DEFAULT TO PLAYABLE. Only PASS if you find specific disqualifying evidence.
`;

  const response = await generateWithRetry(ai, {
    model: 'gemini-2.5-flash',
    contents: researchPrompt,
    config: {
      systemInstruction: HIGH_HIT_SYSTEM_PROMPT,
      tools: [{ googleSearch: {} }],
      temperature: 0.2
    }
  });

  const fallback = {
    decision: 'PASS',
    vetoTriggered: true,
    vetoReason: 'AI Service Error (Empty Response)',
    researchSummary: 'Analysis could not be completed due to AI service unavailability.',
    edgeConfirmation: 'Validation failed.'
  };

  const aiResult = cleanAndParseJson(response.text, fallback);
  
  // ========== STEP 5: BUILD RECOMMENDATION ==========
  const recommendation = `${teamToBet} ${mathEdge.market}`;
  
  const recLine = mathEdge.market === 'Total' 
    ? `${mathEdge.line} (${mathEdge.odds})`
    : mathEdge.market === 'Spread'
    ? `${mathEdge.line} (${mathEdge.odds})`
    : mathEdge.odds;

  return {
    decision: aiResult.vetoTriggered ? 'PASS' : 'PLAYABLE',
    vetoTriggered: aiResult.vetoTriggered || false,
    vetoReason: aiResult.vetoReason,
    researchSummary: aiResult.researchSummary,
    edgeNarrative: aiResult.edgeConfirmation,
    
    recommendation: !aiResult.vetoTriggered ? recommendation : undefined,
    recLine: !aiResult.vetoTriggered ? recLine : undefined,
    recProbability: mathEdge.fairProb,
    
    market: mathEdge.market,
    side: mathEdge.side,
    line: mathEdge.line,
    
    sharpImpliedProb,
    softBestOdds: mathEdge.odds,
    softBestBook: mathEdge.book,
    lineValueCents: mathEdge.valueCents > 0 ? mathEdge.valueCents : 0,
    lineValuePoints: mathEdge.valuePoints
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
      "signal": "RED" (star player OUT), "YELLOW" (key player questionable), or "WHITE" (normal),
      "description": "Max 10 words - who is out and for which team"
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
