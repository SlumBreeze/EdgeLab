
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { BookLines, QueuedGame, HighHitAnalysis, Game, Fact, InjuryFact } from '../types';
import { EXTRACTION_PROMPT, HIGH_HIT_SYSTEM_PROMPT } from '../constants';
import { validateAnalysis, hasVerifiedAvailabilityMismatch } from '../utils/analysisValidator';

const getAiClient = () => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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
// MAIN ANALYSIS
// ============================================

export const analyzeGame = async (game: QueuedGame): Promise<HighHitAnalysis> => {
  const ai = getAiClient();
  
  // STEP 1: PRICE VETOES
  const priceVeto = checkPriceVetoes(game);
  if (priceVeto.triggered) {
    return {
      decision: 'PASS',
      vetoTriggered: true,
      vetoReason: priceVeto.reason,
      researchSummary: 'Price veto triggered before research.',
    };
  }
  
  // STEP 2: MATH ANALYSIS
  let sharpImpliedProb = 50;
  let allSides: SideValue[] = [];

  if (game.sharpLines) {
    const noVig = calculateNoVigProb(game.sharpLines.mlOddsA, game.sharpLines.mlOddsB);
    sharpImpliedProb = noVig.probA;

    if (game.softLines.length > 0) {
      allSides = analyzeAllSides(game.sharpLines, game.softLines);
    }
  }
  
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

  // STEP 3: PREPARE PROMPT
  const dateObj = new Date(game.date);
  const readableDate = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric' });
  const refLines = getReferenceLines(game.id);

  let movementNarrative = "Movement: No reference line data available (first time seen).";
  if (refLines && game.sharpLines) {
    const refA = parseFloat(refLines.spreadLineA);
    const currA = parseFloat(game.sharpLines.spreadLineA);
    if (!isNaN(refA) && !isNaN(currA)) {
      const diff = currA - refA;
      const absDiff = Math.abs(diff);
      if (absDiff < 0.1) {
        movementNarrative = "Movement: Line is stable.";
      } else {
        const direction = diff < 0 ? "TOWARD" : "AGAINST";
        movementNarrative = `Movement: Sharps moved ${absDiff.toFixed(1)} points ${direction} ${game.awayTeam.name}.`;
      }
    }
  }

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

## SHARP LINES (Pinnacle)
Reference Line: ${refLines ? `${game.awayTeam.name} ${refLines.spreadLineA}` : 'N/A'}
Current Pinnacle: ${game.awayTeam.name} ${game.sharpLines?.spreadLineA} (${game.sharpLines?.spreadOddsA})
${movementNarrative}

## SIDES WITH POSITIVE VALUE
${valueSummary}

## YOUR TASK
1. **Search & Verify:** Check current injury reports and confirmed lineups using Google Search.
2. **Fade the Public Narrative:** Identify the "Public Story" (e.g., "Team A is hot," "Star Player revenge game"). Does the Sharp Math disagree? If Sharps are fading the story, we want to be on the Sharp side.
3. **Game Script Validation (Straight Bet Focus):**
   - Visualize the game flow. Does the wager make sense for the likely script?
   - *Example (Spread):* If betting the Favorite (-7), can they keep the lead late, or does the Underdog have a "backdoor cover" offense?
   - *Example (Total):* If betting the Under, are both teams slow-paced?
4. **Final Decision:** Does the "Math Edge" align with the "Game Reality"?

## CRITICAL OUTPUT
You MUST return strictly valid JSON.
`;

  const response = await generateWithRetry(ai, {
    model: 'gemini-3-pro-preview', // CONFIRMED: Using Gemini 3 Pro
    contents: holisticPrompt,
    config: {
      systemInstruction: HIGH_HIT_SYSTEM_PROMPT + `
      
      CRITICAL RULES FOR FACTUAL ACCURACY:
      1. ONLY cite injuries, roster moves, or player status that appear DIRECTLY in your search results
      2. If you cannot find current injury information for a team, say "No verified injury data found" — do NOT guess or infer
      3. NEVER invent trades, signings, or roster moves — if you didn't find it in search results, it didn't happen
      4. When citing a player's status, you must have seen it in a search result from the last 48 hours
      5. If your search returns limited results, acknowledge the uncertainty rather than filling gaps
      6. Distinguish between VERIFIED (from search) and INFERRED (your reasoning) — label them clearly
      7. Every factual statement in narrative_analysis MUST appear verbatim in facts_used.claim
      8. Any prior game result, stat line, ranking, or numeric performance claim MUST be in facts_used with source_type: "BOX_SCORE" and confidence: "HIGH"
      9. All injuries mentioned anywhere MUST be in injuries[]; narrative_analysis may only interpret injuries, never introduce them
      10. If data is missing, use "DATA NOT PROVIDED" instead of inference

      FORBIDDEN BEHAVIORS:
      - Do not claim a player was traded unless you found a news article about the trade
      - Do not claim a player is injured unless you found an injury report
      - Do not invent statistics or records you didn't find in search results
      - Do not assume roster changes between seasons

      IMPORTANT: You must return the result in this exact JSON format:
      {
        "decision": "PLAYABLE" or "PASS",
        "recommendedSide": "AWAY", "HOME", "OVER", "UNDER",
        "recommendedMarket": "Spread", "Moneyline", "Total",
        "narrative_analysis": "Interpretation only. Restate facts_used verbatim; do NOT add new facts.",
        "facts_used": [
          {
            "claim": "A verifiable fact found in search results",
            "source_type": "NBA_INJURY_REPORT" | "BOX_SCORE" | "ODDS_API",
            "confidence": "HIGH" | "MEDIUM",
            "source_ref": "Optional short source label"
          }
        ],
        "injuries": [
          {
            "team": "Team name",
            "player": "Player name",
            "status": "OUT" | "QUESTIONABLE" | "PROBABLE",
            "source": "NBA_INJURY_REPORT"
          }
        ],
        "publicNarrative": "Describe the public/media story (if any)",
        "gameScript": "Briefly describe the likely game flow (e.g. Slow pace, shootout)",
        "situationFavors": "AWAY", "HOME", "NEUTRAL",
        "confidence": "HIGH", "MEDIUM", "LOW",
        "dataQuality": "STRONG", "PARTIAL", "WEAK"
      }`,
      tools: [{ googleSearch: {} }],
      temperature: 0.1
    }
  });

  const fallback = {
    decision: 'PASS',
    recommendedSide: null,
    recommendedMarket: null,
    narrative_analysis: 'Analysis could not be completed.',
    facts_used: [] as Fact[],
    injuries: [] as InjuryFact[],
    publicNarrative: 'Unknown',
    gameScript: 'Unknown',
    situationFavors: 'NEUTRAL',
    confidence: 'LOW',
    dataQuality: 'WEAK'
  };

  const aiResult = cleanAndParseJson(response.text, fallback);

  const factsUsed: Fact[] = Array.isArray(aiResult.facts_used) ? aiResult.facts_used : [];
  const injuries: InjuryFact[] = Array.isArray(aiResult.injuries) ? aiResult.injuries : [];
  const narrativeAnalysis = typeof aiResult.narrative_analysis === 'string' ? aiResult.narrative_analysis : '';

  const baseValidation = validateAnalysis({
    narrativeAnalysis,
    factsUsed,
    injuries,
    confidence: aiResult.confidence,
    sport: game.sport
  });

  if (baseValidation.vetoTriggered) {
    return {
      decision: 'PASS',
      vetoTriggered: true,
      vetoReason: baseValidation.vetoReason,
      researchSummary: narrativeAnalysis || 'Validation veto triggered before research summary.',
      sharpImpliedProb,
      publicNarrative: aiResult.publicNarrative,
      gameScript: aiResult.gameScript,
      factsUsed,
      narrativeAnalysis,
      injuries,
      factConfidence: baseValidation.factConfidence,
      dominanceRatio: baseValidation.dominanceRatio
    };
  }

  const injuriesSummary = injuries.length > 0
    ? injuries.map(i => `${i.team}: ${i.player} (${i.status})`).join(', ')
    : 'No verified data';
  
  // NEW: Data Quality Gate
  if (aiResult.dataQuality === 'WEAK' && aiResult.decision === 'PLAYABLE') {
    return {
      decision: 'PASS',
      vetoTriggered: true,
      vetoReason: `DATA_QUALITY: AI recommended PLAYABLE but data quality was WEAK. Insufficient verified information to support the pick.`,
      researchSummary: `Injuries: ${injuries.length > 0 ? injuries.map(i => `${i.team}: ${i.player} (${i.status})`).join(', ') : 'No verified data'}

⚠️ Data Quality: WEAK - Search results were limited. Passing to avoid acting on unverified information.

📰 Public Narrative: ${aiResult.publicNarrative || 'None identified'}`,
      sharpImpliedProb,
      publicNarrative: aiResult.publicNarrative,
      gameScript: aiResult.gameScript,
      factsUsed,
      narrativeAnalysis,
      injuries,
      factConfidence: baseValidation.factConfidence,
      dominanceRatio: baseValidation.dominanceRatio
    };
  }

  // Filter alignment logic
  if (aiResult.decision !== 'PLAYABLE' || !aiResult.recommendedSide) {
    return {
      decision: 'PASS',
      vetoTriggered: false,
      vetoReason: narrativeAnalysis || 'AI did not find aligned edge',
      researchSummary: `Injuries: ${injuriesSummary}

📰 Public Narrative: ${aiResult.publicNarrative || 'None identified'}
🎬 Game Script: ${aiResult.gameScript || 'Standard flow expected'}

Situation favors: ${aiResult.situationFavors}`,
      edgeNarrative: narrativeAnalysis,
      sharpImpliedProb,
      publicNarrative: aiResult.publicNarrative,
      gameScript: aiResult.gameScript,
      factsUsed,
      narrativeAnalysis,
      injuries,
      factConfidence: baseValidation.factConfidence,
      dominanceRatio: baseValidation.dominanceRatio
    };
  }

  // UPDATED: Strict side selection from known value sides
  let selectedSide = sidesWithValue.find(s => 
    s.side === aiResult.recommendedSide && 
    s.market === aiResult.recommendedMarket
  ) || sidesWithValue.find(s => s.side === aiResult.recommendedSide);

  // BUG FIX 1: If AI recommends a side that has NO positive math value, we must PASS.
  // The previous fallback (|| sidesWithValue[0]) blindly picked the first valid side even if AI wanted something else.
  if (!selectedSide) {
    return {
      decision: 'PASS',
      vetoTriggered: true,
      vetoReason: `MATH VETO: AI recommended ${aiResult.recommendedSide} but no positive mathematical value exists on that side.`,
      researchSummary: `AI found situational edge on ${aiResult.recommendedSide} but the numbers don't support it.\n\nSituation favors: ${aiResult.situationFavors}`,
      sharpImpliedProb,
      publicNarrative: aiResult.publicNarrative,
      gameScript: aiResult.gameScript,
      factsUsed,
      narrativeAnalysis,
      injuries,
      factConfidence: baseValidation.factConfidence,
      dominanceRatio: baseValidation.dominanceRatio
    };
  }

  const lineValueCents = selectedSide.priceValue > 0 ? selectedSide.priceValue : 0;
  const availabilityMismatch = hasVerifiedAvailabilityMismatch(factsUsed, injuries);
  const finalValidation = validateAnalysis({
    narrativeAnalysis,
    factsUsed,
    injuries,
    confidence: baseValidation.adjustedConfidence,
    sport: game.sport,
    lineValueCents,
    hasVerifiedAvailabilityMismatch: availabilityMismatch
  });

  if (finalValidation.vetoTriggered) {
    return {
      decision: 'PASS',
      vetoTriggered: true,
      vetoReason: finalValidation.vetoReason,
      researchSummary: narrativeAnalysis || 'Validation veto triggered before recommendation.',
      sharpImpliedProb,
      publicNarrative: aiResult.publicNarrative,
      gameScript: aiResult.gameScript,
      factsUsed,
      narrativeAnalysis,
      injuries,
      factConfidence: finalValidation.factConfidence,
      dominanceRatio: finalValidation.dominanceRatio
    };
  }

  // BUG FIX 2: Contradiction Check
  // If AI says situation favors X but recommends Y, something is wrong.
  if (aiResult.situationFavors !== 'NEUTRAL' && 
      (selectedSide.side === 'AWAY' || selectedSide.side === 'HOME') && 
      aiResult.situationFavors !== selectedSide.side) {
      
      return {
        decision: 'PASS',
        vetoTriggered: true,
        vetoReason: `CONTRADICTION: AI says situation favors ${aiResult.situationFavors} but recommended ${selectedSide.side}.`,
        researchSummary: narrativeAnalysis,
        sharpImpliedProb,
        publicNarrative: aiResult.publicNarrative,
        gameScript: aiResult.gameScript,
        factsUsed,
        narrativeAnalysis,
        injuries,
        factConfidence: finalValidation.factConfidence,
        dominanceRatio: finalValidation.dominanceRatio
      };
  }

  // === UNDERDOG SAFETY PROTOCOL ===
  // If AI recommends Moneyline on a heavy underdog (> +200),
  // force a switch to the SPREAD if it has positive value.
  const impliedProb = americanToImpliedProb(selectedSide.bestSoftOdds);
  const isLongshot = impliedProb < 33; // Approx +200 odds or longer

  if (selectedSide.market === 'Moneyline' && isLongshot) {
    const safeSpreadOption = sidesWithValue.find(s => 
      s.side === selectedSide.side && 
      s.market === 'Spread' && 
      s.hasPositiveValue
    );

    if (safeSpreadOption) {
      console.log(`[Safety] Switched ${game.awayTeam.name}/${game.homeTeam.name} from Risky ML (${selectedSide.bestSoftOdds}) to Safe Spread (${safeSpreadOption.bestSoftLine})`);
      selectedSide = safeSpreadOption;
    } else {
      // BUG FIX 3: If no spread backup exists for a risky longshot, VETO it.
      return {
        decision: 'PASS',
        vetoTriggered: true,
        vetoReason: `RISKY_ML: Longshot moneyline (>+200) without positive spread value support.`,
        researchSummary: `AI liked the upset, but taking a >+200 ML without spread value is too high variance.\n\nSituation favors: ${aiResult.situationFavors}`,
        sharpImpliedProb,
        publicNarrative: aiResult.publicNarrative,
        gameScript: aiResult.gameScript,
        factsUsed,
        narrativeAnalysis,
        injuries,
        factConfidence: finalValidation.factConfidence,
        dominanceRatio: finalValidation.dominanceRatio
      };
    }
  }

  // JUICE VETO CHECK
  const bestOddsVal = parseFloat(selectedSide.bestSoftOdds);
  if (!isNaN(bestOddsVal) && bestOddsVal < -160) {
    return {
      decision: 'PASS',
      vetoTriggered: true,
      vetoReason: `JUICE_VETO: Recommended odds ${formatOddsForDisplay(bestOddsVal)} are worse than -160 limit.`,
      researchSummary: `AI liked the spot, but the price is too expensive.\n\nSituation favors: ${aiResult.situationFavors}`,
      sharpImpliedProb,
      publicNarrative: aiResult.publicNarrative,
      gameScript: aiResult.gameScript,
      factsUsed,
      narrativeAnalysis,
      injuries,
      factConfidence: finalValidation.factConfidence,
      dominanceRatio: finalValidation.dominanceRatio
    };
  }

  // Add caution for partial data
  let dataCaution: string | undefined;
  if (aiResult.dataQuality === 'PARTIAL') {
    dataCaution = "⚠️ Partial data: Some injury/roster information could not be verified.";
  }

  const teamName = selectedSide.side === 'AWAY' ? game.awayTeam.name :
                   selectedSide.side === 'HOME' ? game.homeTeam.name :
                   selectedSide.side;

  const recommendation = `${teamName} ${selectedSide.market}`;
  const recLine = selectedSide.market === 'Moneyline' 
    ? formatOddsForDisplay(selectedSide.bestSoftOdds)
    : `${selectedSide.bestSoftLine} (${formatOddsForDisplay(selectedSide.bestSoftOdds)})`;
  
  // NEW: Calculate Thresholds (Line Floors)
  let lineFloor: string | undefined;
  let oddsFloor: string | undefined;
  let floorReason: string | undefined;

  if (selectedSide.market === 'Spread' || selectedSide.market === 'Total') {
     lineFloor = selectedSide.market === 'Total' 
        ? `${selectedSide.side === 'OVER' ? 'o' : 'u'}${selectedSide.sharpLine}`
        : selectedSide.sharpLine;
        
     const sOdds = normalizeToAmerican(selectedSide.sharpOdds);
     // -130 standard limit. If sharp is worse (e.g. -140), match sharp.
     const threshold = -130;
     const floorVal = (sOdds < threshold) ? sOdds : threshold;
     oddsFloor = formatOddsForDisplay(floorVal);
     
     floorReason = selectedSide.market === 'Spread' 
        ? "Matches sharp line - no edge below this"
        : "Matches sharp line";
  } else if (selectedSide.market === 'Moneyline') {
     lineFloor = undefined; // N/A for ML
     oddsFloor = formatOddsForDisplay(selectedSide.sharpOdds);
     floorReason = "Matches sharp price";
  }

  return {
    decision: 'PLAYABLE',
    vetoTriggered: false,
    vetoReason: undefined,
    caution: dataCaution,
    researchSummary: `Injuries: ${injuriesSummary}

📰 Public Narrative: ${aiResult.publicNarrative || 'None identified'}
🎬 Game Script: ${aiResult.gameScript || 'Standard flow expected'}

Situation favors: ${aiResult.situationFavors}
Confidence: ${finalValidation.adjustedConfidence}
Data Quality: ${aiResult.dataQuality || 'UNKNOWN'}
Fact Confidence: ${finalValidation.factConfidence}
Dominance Ratio: ${finalValidation.dominanceRatio.toFixed(2)}`,
    edgeNarrative: narrativeAnalysis,
    recommendation,
    recLine,
    recProbability: selectedSide.side === 'AWAY' ? sharpImpliedProb : 100 - sharpImpliedProb,
    market: selectedSide.market,
    side: selectedSide.side,
    line: selectedSide.bestSoftLine,
    sharpImpliedProb,
    softBestOdds: formatOddsForDisplay(selectedSide.bestSoftOdds),
    softBestBook: selectedSide.bestSoftBook,
    lineValueCents,
    lineValuePoints: selectedSide.lineValue,
    
    // Thresholds
    lineFloor,
    oddsFloor,
    floorReason,

    // Pro Analysis Fields
    publicNarrative: aiResult.publicNarrative,
    gameScript: aiResult.gameScript,
    factsUsed,
    narrativeAnalysis,
    injuries,
    confidence: finalValidation.adjustedConfidence,
    factConfidence: finalValidation.factConfidence,
    dominanceRatio: finalValidation.dominanceRatio
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
