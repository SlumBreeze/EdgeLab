import { GoogleGenAI, Type, Schema } from "@google/genai";
import { BookLines, QueuedGame, HighHitAnalysis } from '../types';
import { EXTRACTION_PROMPT, HIGH_HIT_SYSTEM_PROMPT } from '../constants';

const getAiClient = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- Extraction Service ---

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
      temperature: 0.3
    }
  });

  if (!response.text) throw new Error("No data extracted");
  return JSON.parse(response.text);
};

// --- Analysis Service ---

const analysisSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    decision: { type: Type.STRING, enum: ["PRIMARY", "LEAN", "PASS"] },
    winProbability: { type: Type.NUMBER, description: "Win probability percentage as an integer (e.g. 58)" },
    market: { type: Type.STRING, description: "Market type (Spread, Moneyline, Total)" },
    side: { type: Type.STRING, description: "The team or side (e.g. Lakers, Over 219.5)" },
    line: { type: Type.STRING, description: "The handicap or total line (e.g. -6.5)" },
    odds: { type: Type.STRING, description: "The price (e.g. -110)" },
    book: { type: Type.STRING, description: "The sportsbook offering this line" },
    reasoning: { type: Type.STRING, description: "Short 1-sentence justification" },
    fullAnalysis: { type: Type.STRING, description: "Detailed bullet points and breakdown of the analysis" }
  },
  required: ["decision", "winProbability", "market", "side", "line", "odds", "book", "reasoning", "fullAnalysis"]
};

export const analyzeGame = async (game: QueuedGame): Promise<HighHitAnalysis> => {
  const ai = getAiClient();
  
  // Step 1: Research Phase
  // We use the search tool to gather current info (injuries, goalie confirmations, etc.)
  // We cannot use strict JSON schema with Search tools in the same call.
  const researchPrompt = `
    Research critical betting context for the following matchup to prepare for a high-probability betting analysis.
    
    MATCHUP: ${game.awayTeam.name} at ${game.homeTeam.name}
    SPORT: ${game.sport}
    DATE: ${game.date}

    Find current information on:
    1. Key Injuries (confirmed OUT or Questionable stars).
    2. Starting Goalies (NHL) or Pitchers (MLB).
    3. Rest spots / Schedule fatigue (back-to-backs).
    4. Recent form trends (last 3-5 games).
    5. Weather (if NFL/CFB/MLB outdoors).
  `;

  const researchResponse = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: researchPrompt,
    config: {
      tools: [{ googleSearch: {} }],
      temperature: 0.3, // Lower temp for factual research
    }
  });

  const researchContext = researchResponse.text || "No research data found.";

  // Step 2: Decision Phase
  // We feed the research context + lines into the framework and request strict JSON.
  const analysisPrompt = `
    Analyze this matchup using the High-Hit Sports v2.2 framework.
    
    MATCHUP: ${game.awayTeam.name} at ${game.homeTeam.name}
    SPORT: ${game.sport}
    
    === RESEARCH CONTEXT (FROM STEP 1) ===
    ${researchContext}
    
    === SHARP LINES (Pinnacle) ===
    ${JSON.stringify(game.sharpLines || {}, null, 2)}
    
    === SOFT LINES (Available) ===
    ${JSON.stringify(game.softLines || [], null, 2)}
    
    INSTRUCTIONS:
    1. Use the Research Context to identify edges (injuries, rest, etc.).
    2. Compare Sharp vs Soft lines.
    3. Apply the High-Hit internal probability engine.
    4. Make a strict decision (PRIMARY, LEAN, or PASS).
    5. Output the result strictly as JSON matching the schema.
  `;

  const analysisResponse = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: analysisPrompt,
    config: {
      systemInstruction: HIGH_HIT_SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseSchema: analysisSchema,
      temperature: 1.0, // Best for reasoning
    }
  });

  if (!analysisResponse.text) throw new Error("Analysis failed to generate text");
  
  return JSON.parse(analysisResponse.text) as HighHitAnalysis;
};

// --- Quick Scan Service ---

export const quickScanGame = async (game: QueuedGame): Promise<{ signal: 'RED' | 'YELLOW' | 'WHITE', description: string }> => {
  const ai = getAiClient();
  const prompt = `
    Quickly scan this matchup for critical betting edges using Google Search.
    Matchup: ${game.awayTeam.name} vs ${game.homeTeam.name} (${game.sport}).
    Date: ${game.date}.
    
    Look for:
    1. Major injuries (Stars OUT/Questionable)
    2. Severe rest disadvantages (Back-to-backs)
    3. Confirmed goalie/pitcher mismatches
    
    Output a valid JSON object EXACTLY like this (do not use Markdown code blocks if possible, just the raw JSON):
    {
      "signal": "RED" (if major injury/edge), "YELLOW" (if minor/rest), "WHITE" (no signal),
      "description": "Short 10-word summary of the edge"
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        // responseMimeType is NOT used here to avoid conflict with googleSearch
      }
    });

    let text = response.text || "{}";
    // Sanitize markdown if the model wraps it
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    // Attempt parse
    try {
      return JSON.parse(text);
    } catch (parseError) {
      console.warn("Could not parse scan result as JSON, returning default.", text);
      return { signal: 'WHITE', description: 'Could not parse signal' };
    }
  } catch (e) {
    console.error("Quick scan failed", e);
    return { signal: 'WHITE', description: 'Scan failed' };
  }
};

// --- Helpers ---

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

export const detectSpreadEdge = (sharp: BookLines, soft: BookLines): 'better' | 'worse' | 'equal' => {
  if (!sharp?.spreadLineA || !soft?.spreadLineA) return 'equal';
  const sharpVal = parseFloat(sharp.spreadLineA);
  const softVal = parseFloat(soft.spreadLineA);
  
  // Basic spread logic: 
  // If betting favorite (-), less negative is better (e.g. -4 better than -5)
  // If betting underdog (+), more positive is better (e.g. +6 better than +5)
  
  if (sharpVal < 0) {
      if (softVal > sharpVal) return 'better'; // -4 > -5
      if (softVal < sharpVal) return 'worse';
  } else {
      if (softVal > sharpVal) return 'better'; // +6 > +5
      if (softVal < sharpVal) return 'worse';
  }
  return 'equal';
};
