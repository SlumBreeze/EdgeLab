import { GoogleGenAI, Type } from "@google/genai";
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

export const analyzeGame = async (game: QueuedGame): Promise<HighHitAnalysis> => {
  const ai = getAiClient();
  
  const prompt = `
Analyze this matchup using the High-Hit Sports v2.2 framework.

MATCHUP: ${game.awayTeam.name} at ${game.homeTeam.name}
SPORT: ${game.sport}
TIME: ${game.date}

SHARP LINES (Pinnacle):
${JSON.stringify(game.sharpLines || {}, null, 2)}

SOFT LINES:
${JSON.stringify(game.softLines || [], null, 2)}

Follow the framework EXACTLY. Search for current injuries and context before analyzing.
Output your analysis in the specified format.
`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview', // Using the preview model for complex tasks
    contents: prompt,
    config: {
      systemInstruction: HIGH_HIT_SYSTEM_PROMPT,
      tools: [{ googleSearch: {} }],
      temperature: 1.0,
    }
  });

  return parseAnalysis(response.text || "Analysis failed.");
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

const parseAnalysis = (text: string): HighHitAnalysis => {
  const isPrimary = text.includes('PRIMARY PLAY');
  const isLean = text.includes('LEAN');
  const isPass = text.includes('PASS');
  
  // Basic extraction logic for metadata
  let winProb = 0;
  const probMatch = text.match(/Win Prob(?:ability)?:?\s*(\d+)%/i);
  if (probMatch) winProb = parseInt(probMatch[1]);

  let market = undefined;
  let side = undefined;
  let line = undefined;
  let odds = undefined;
  let book = undefined;

  // Robust parsing for the structured bet line
  // The system prompt asks for: Sport – Market – Side – Line – Odds – Book
  // We locate the line immediately following the decision header.
  if (isPrimary || isLean) {
    // Split by header and get the content after
    const chunks = text.split(/(?:PRIMARY PLAY|LEAN)(?:.*?\n)+/);
    if (chunks.length > 1) {
      const contentAfterHeader = chunks[1];
      // Get the first non-empty line which should contain the bet details
      const betLine = contentAfterHeader.split('\n').map(l => l.trim()).find(l => l.length > 5 && !l.toLowerCase().includes('win prob'));
      
      if (betLine) {
        // Try to split by common separators used by LLMs: " – " (en dash), " - " (hyphen padded), " | "
        // We use a regex that looks for these delimiters surrounded by optional whitespace
        const parts = betLine.split(/\s*(?:[|–—]|\s-\s)\s*/);

        // We expect at least Sport, Market, Side...
        if (parts.length >= 3) {
          // Attempt to map based on standard position
          // If we have many parts, assume the standard format:
          // 0:Sport, 1:Market, 2:Side, 3:Line, 4:Odds, 5:Book
          
          if (parts.length >= 6) {
             market = parts[1];
             side = parts[2];
             line = parts[3];
             odds = parts[4];
             book = parts[5].replace(/^@\s*/, '');
          } else if (parts.length >= 4) {
             // Compressed format? e.g. Sport | Market | Side/Line | Odds | Book
             side = parts[2]; 
             // If side looks like "Lakers -5", keep it there, otherwise try next part
             if (parts[3].startsWith('-') || parts[3].startsWith('+') || !isNaN(parseFloat(parts[3]))) {
               line = parts[3];
               if (parts[4]) odds = parts[4];
               if (parts[5]) book = parts[5];
             } else {
               // Maybe parts[3] is part of the side name?
               side = `${parts[2]} ${parts[3]}`;
             }
          } else {
             // Fallback: Just dump the raw line into 'side' so user sees it
             side = betLine;
          }
        } else {
          // If splitting failed completely, use the raw line
          side = betLine;
        }
      }
    }
  }

  return {
    decision: isPrimary ? 'PRIMARY' : isLean ? 'LEAN' : 'PASS',
    units: isPrimary ? 1.0 : isLean ? 0.5 : undefined,
    fullAnalysis: text,
    winProbability: winProb,
    market,
    side, // Will now contain the raw line if parsing fails, preventing empty "Team"
    line,
    odds,
    book
  };
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
