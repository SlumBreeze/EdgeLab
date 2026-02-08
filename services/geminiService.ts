import { GoogleGenAI, Type, Schema } from "@google/genai";
import {
  BookLines,
  QueuedGame,
  HighHitAnalysis,
  Game,
  AnalysisResult,
  UserPersona,
  BookBalanceDisplay,
  ScanResult,
} from "../types";
import { SportsDbTeam, SportsDbPlayer } from "../types/sportsDb";
import { EXTRACTION_PROMPT } from "../constants";
import { getRecommendedBook } from "../utils/calculations";
import { calculateNoVig3Way } from "../utils/edgeUtils";

export const getAiClient = () =>
  new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

type AiTaskType = "scan" | "analysis";
const MAX_AI_CALL_TIMEOUT_MS = 90000;
const MIN_NEXT_MATCHUP_DELAY_MS = 2000;
const MAX_NEXT_MATCHUP_DELAY_MS = 5000;

const aiQueue: Array<{
  type: AiTaskType;
  run: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
}> = [];

let aiWorkerRunning = false;
let aiStatus: "idle" | "scanning" | "analyzing" = "idle";
let aiTaskExecutionDepth = 0;

const getAiStatus = () => aiStatus;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const getNextMatchupDelayMs = () =>
  Math.floor(
    MIN_NEXT_MATCHUP_DELAY_MS +
      Math.random() * (MAX_NEXT_MATCHUP_DELAY_MS - MIN_NEXT_MATCHUP_DELAY_MS + 1),
  );

const enqueueAiTask = <T>(type: AiTaskType, run: () => Promise<T>): Promise<T> => {
  // Prevent deadlock: if we're already executing an AI task, run nested work inline.
  if (aiTaskExecutionDepth > 0) {
    return run();
  }

  return new Promise<T>((resolve, reject) => {
    aiQueue.push({ type, run, resolve, reject });
    void processAiQueue();
  });
};

const processAiQueue = async () => {
  if (aiWorkerRunning) return;
  aiWorkerRunning = true;
  try {
    while (aiQueue.length > 0) {
      // Prioritize scans ahead of analysis
      const nextIndex = aiQueue.findIndex((task) => task.type === "scan");
      const task = nextIndex >= 0 ? aiQueue.splice(nextIndex, 1)[0] : aiQueue.shift()!;
      aiStatus = task.type === "scan" ? "scanning" : "analyzing";
      try {
        aiTaskExecutionDepth += 1;
        const result = await task.run();
        task.resolve(result);
      } catch (err) {
        task.reject(err);
      } finally {
        aiTaskExecutionDepth = Math.max(0, aiTaskExecutionDepth - 1);
      }

      // Throttle between matchups to reduce provider rate spikes.
      if (task.type === "analysis" && aiQueue.length > 0) {
        const delayMs = getNextMatchupDelayMs();
        console.log(`[Gemini Queue] Cooling down ${delayMs}ms before next matchup.`);
        await sleep(delayMs);
      }
    }
  } finally {
    aiWorkerRunning = false;
    aiStatus = "idle";
  }
};

export const getSystemPrompt = (persona?: UserPersona) => `
You are the Professional AI Handicapper. Your goal is to identify the BEST side of every game. You treat mathematical edge (EV) as a key signal, but you prioritize finding a winning play using the full synthesis of stats, rosters, and news.

PERSONA SETTINGS:
- **Operational Mode:** ${persona?.volume_mode || 'Standard'} (If High Action, you MUST find a side for every game. If High Precision, be slightly more selective but aim for maximum slate coverage).
- **Risk Tolerance:** ${persona?.risk_tolerance || 'Balanced'} (Influences unit sizing and confidence).
- **Mathematical Thresholds:** Min Edge: ${persona?.min_edge_percentage || 0.1}%, Max Odds: ${persona?.max_odds_american || -175}.
- **Decision Mode:** ${persona?.decision_mode || 'MATH_STRICT'} (MATH_STRICT respects EV; HYBRID_PRO and QUALITATIVE_PRO prioritize situational/narrative edges over raw juice).

CORE PRINCIPLES:
- **Always Find a Play:** There is a "best" side to every game. Unless there is literally NO data available, do not return PASS. Use stats, matchups, and roster integrity to determine who has the higher probability of winning or covering.
- **Math & Logic Synthesis:** Use the provided rosters and situational data to find edges that the market (Pinnacle) might be missing. If math is negative but rosters are dominant, it's a "Playable" side.
- **Ground Truth Dominance:** You MUST use the provided roster and player data to verify your claims. Never hallucinate player/team pairings.
- **Favorite Evaluation:** Respect the user's Max Odds threshold (${persona?.max_odds_american || -175}). If a favorite is within this price, has a dominant statistical matchup, and verified roster integrity, they are "Playable."

STRATEGIES:
- **Roster Audit:** Use the verified rosters to identify mismatch opportunities.
- **Matchup Dominance:** Look for statistical outliers (e.g., #1 Offense vs. #30 Defense).
- **Situational Spots:** Flag travel fatigue, back-to-backs, and "Look Ahead" games.
- **Trap Detection:** Call out "Reverse Line Movement" (RLM) where public volume doesn't match the price action.

OUTPUT:
Return strict JSON with:
recommendation (BET | LEAN | PASS) - Use PASS only if data is missing.
confidence (0-100)
reasoning (max 2 sentences; blunt, data-only)
handicapper_logic (1-2 sentences; explain WHY this side is the best play using rosters/stats/situational data)
trueProbability (number, win %)
impliedProbability (number, % from odds)
edge (number, true - implied)
wagerType (Moneyline | Spread | Total)
riskFactors (string array)
trapAlert (string; ONLY if a trap/RLM is detected, otherwise empty)
expertSentiment (string; 1-sentence summary of expert consensus)

No extra keys. No props. No narrative fluff.
`;

const DEFAULT_EDGE_THRESHOLD = 0.0;

type UnitTier = {
  label: string;
  minTrueProb: number;
  minEdge: number;
  unitPct: number;
};

const UNIT_TIERS: UnitTier[] = [
  { label: "Tier 4", minTrueProb: 93, minEdge: 3, unitPct: 5 },
  { label: "Tier 3", minTrueProb: 90, minEdge: 5, unitPct: 3 },
  { label: "Tier 2", minTrueProb: 80, minEdge: 3, unitPct: 2 },
  { label: "Tier 1", minTrueProb: 70, minEdge: 3, unitPct: 1 },
];

const getUnitTier = (trueProb: number, edge: number): UnitTier | null => {
  for (const tier of UNIT_TIERS) {
    if (trueProb >= tier.minTrueProb && edge >= tier.minEdge) {
      return tier;
    }
  }
  return null;
};

const appendUnitNote = (text: string, tier: UnitTier | null): string => {
  if (!tier) return text;
  const note = `Unit ${tier.unitPct}% (${tier.label}).`;
  if (!text) return note;
  return `${text} ${note}`;
};

// ============================================
// MATH FUNCTIONS (TypeScript, NOT LLM)
// ============================================

const normalizeToAmerican = (odds: string | number): number => {
  const val = typeof odds === "string" ? parseFloat(odds) : odds;
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
  if (!odds || odds === "N/A") return "N/A";

  const val = typeof odds === "string" ? parseFloat(odds) : odds;
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
    return (Math.abs(o) / (Math.abs(o) + 100)) * 100;
  } else {
    return (100 / (o + 100)) * 100;
  }
};

export const calculateNoVigProb = (
  oddsA: string,
  oddsB: string,
): { probA: number; probB: number } => {
  const impliedA = americanToImpliedProb(oddsA);
  const impliedB = americanToImpliedProb(oddsB);

  const total = impliedA + impliedB;
  if (total === 0) return { probA: 50, probB: 50 };

  return {
    probA: Math.round((impliedA / total) * 1000) / 10,
    probB: Math.round((impliedB / total) * 1000) / 10,
  };
};

// HELPER: Linearizes odds centered around 0 (Even Money)
// +150 -> 50, +100 -> 0, -110 -> -10, -150 -> -50
const getLinearOddsValue = (odds: number): number => {
  return odds >= 100 ? odds - 100 : odds + 100;
};

export const calculateJuiceDiff = (
  sharpOdds: string,
  softOdds: string,
): number => {
  const sharp = normalizeToAmerican(sharpOdds);
  const soft = normalizeToAmerican(softOdds);

  if (isNaN(sharp) || isNaN(soft) || sharp === 0 || soft === 0) return 0;

  return getLinearOddsValue(soft) - getLinearOddsValue(sharp);
};

export const calculateLineDiff = (
  sharpLine: string,
  softLine: string,
): number => {
  const sharp = parseFloat(sharpLine);
  const soft = parseFloat(softLine);
  if (isNaN(sharp) || isNaN(soft)) return 0;
  return Math.round((soft - sharp) * 10) / 10;
};

export const checkPriceVetoes = (
  game: QueuedGame,
): { triggered: boolean; reason?: string } => {
  if (!game.sharpLines) return { triggered: false };

  const spreadA = Math.abs(parseFloat(game.sharpLines.spreadLineA));

  let spreadLimit = 10.0;
  switch (game.sport) {
    case "NFL":
      spreadLimit = 14.0;
      break;
    case "NBA":
      spreadLimit = 16.0;
      break;
    case "NHL":
      spreadLimit = 4.0;
      break;
    default:
      spreadLimit = 10.0;
  }

  if (spreadA > spreadLimit) {
    return {
      triggered: true,
      reason: `SPREAD_CAP: Spread is ${spreadA} points (exceeds ${spreadLimit} limit for ${game.sport})`,
    };
  }

  return { triggered: false };
};

// ============================================
// HELPERS
// ============================================

const cleanAndParseJson = (
  text: string | undefined,
  fallback: any = {},
): any => {
  if (!text) {
    console.warn("cleanAndParseJson received empty text");
    return fallback;
  }

  try {
    let clean = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const firstBrace = clean.indexOf("{");
    const lastBrace = clean.lastIndexOf("}");

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
      let encoded = reader.result?.toString().replace(/^data:(.*,)?/, "");
      if (encoded && encoded.length % 4 > 0) {
        encoded += "=".repeat(4 - (encoded.length % 4));
      }
      resolve(encoded || "");
    };
    reader.onerror = (error) => reject(error);
  });
};

// GENERATE WITH FALLBACK
export const generateWithFallback = async (
  models: string[],
  paramsWithoutModel: any,
  options?: { disableFallback?: boolean; timeoutMs?: number }
) => {
  const ai = geminiService.getAiClient();
  
  const disableFallback = options?.disableFallback === true;

  // MANDATE: Strict Gemini 3 Pro -> Gemini 3 Flash fallback (unless disabled)
  const mandateModels = ["gemini-3-pro-preview", "gemini-3-flash-preview"];
  
  // Use mandate models if the requested list contains a Pro or Flash variant
  const targetModels = disableFallback
    ? [models[0]]
    : (models.some(m => m.includes("pro") || m.includes("flash"))
        ? mandateModels
        : models);

  const timeoutFromOptions = options?.timeoutMs;
  const TIMEOUT_MS =
    Number.isFinite(timeoutFromOptions) && (timeoutFromOptions as number) > 0
      ? Math.min(timeoutFromOptions as number, MAX_AI_CALL_TIMEOUT_MS)
      : 45000;

  for (const model of targetModels) {
    try {
      console.log(`[Gemini] Attempting generation with ${model}... (Timeout: ${TIMEOUT_MS}ms)`);
      
      const generationPromise = ai.models.generateContent({
        model: model,
        ...paramsWithoutModel,
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout: ${model} failed to respond within ${TIMEOUT_MS}ms`)), TIMEOUT_MS)
      );

      const resp = await Promise.race([generationPromise, timeoutPromise]) as any;

      // Robust response text extraction
      let text = "";
      if (typeof resp.text === "function") {
        text = resp.text();
      } else if (resp.text) {
        text = resp.text;
      } else if (resp.candidates?.[0]?.content?.parts?.[0]?.text) {
        text = resp.candidates[0].content.parts[0].text;
      }

      if (text) {
        console.log(`[Gemini] ${model} succeeded.`);
        return { text };
      }
      
      console.warn(`[Gemini] ${model} returned empty text.`);
    } catch (e: any) {
      const isTimeout = e?.message?.includes("Timeout");
      if (isTimeout) {
        e.code = "AI_TIMEOUT";
      }
      console.error(`[Gemini] ${model} ${isTimeout ? 'TIMED OUT' : 'FAILED'}:`, e.message || e);
      
      if (model === targetModels[targetModels.length - 1]) {
        if (targetModels.length === 1) {
          console.error(`[Gemini] ${model} failed. Aborting.`);
        } else {
          console.error(`[Gemini] All models failed. Aborting.`);
        }
        throw e;
      }
      
      console.log(`[Gemini] Falling back to next available model...`);
    }
  }
  return { text: undefined };
};

export const isTimeoutError = (error: any) =>
  error?.code === "AI_TIMEOUT" || error?.message?.includes("Timeout");

const getReferenceLines = (gameId: string) => {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(`edgelab_reference_${gameId}`);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
};

const parseFloorNumber = (value?: string): number | null => {
  if (!value || value === "N/A") return null;
  const cleaned = value.replace(/^[ou]/i, "");
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

const isLineWithinFloor = (
  market: SideValue["market"],
  side: SideValue["side"],
  bestSoftLine: string,
  lineFloor?: string,
): boolean => {
  if (!lineFloor) return true;
  const softVal = parseFloorNumber(bestSoftLine);
  const floorVal = parseFloorNumber(lineFloor);
  if (softVal === null || floorVal === null) return true;

  if (market === "Total") {
    if (side === "OVER") return softVal <= floorVal;
    if (side === "UNDER") return softVal >= floorVal;
  }

  if (market === "Spread") {
    return softVal >= floorVal;
  }

  return true;
};

const isOddsWithinFloor = (
  bestSoftOdds: string,
  oddsFloor?: string,
): boolean => {
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
  side: "AWAY" | "HOME" | "OVER" | "UNDER" | "DRAW";
  market: "Spread" | "Moneyline" | "Total";
  sharpLine: string;
  sharpOdds: string;
  bestSoftLine: string;
  bestSoftOdds: string;
  bestSoftBook: string;
  lineValue: number;
  priceValue: number;
  hasPositiveValue: boolean;
  booksWithEdge: number;
}

const analyzeAllSides = (
  sharp: BookLines,
  softLines: BookLines[],
): SideValue[] => {
  const results: SideValue[] = [];

  const checkSide = (
    side: "AWAY" | "HOME" | "OVER" | "UNDER",
    market: "Spread" | "Moneyline" | "Total",
    sharpLine: string,
    sharpOdds: string,
    getSoftLine: (s: BookLines) => string,
    getSoftOdds: (s: BookLines) => string,
  ) => {
    softLines.forEach((soft) => {
      const softLine = getSoftLine(soft);
      const softOdds = getSoftOdds(soft);

      if (!softOdds || softOdds === "N/A" || !sharpOdds || sharpOdds === "N/A")
        return;

      const sVal = parseFloat(softOdds);
      if (Math.abs(sVal) > 2000) return;

      const lineValue = calculateLineDiff(sharpLine, softLine);
      const priceValue = calculateJuiceDiff(sharpOdds, softOdds);

      if (Math.abs(priceValue) > 50) return;

      // ADJUSTED EDGE LOGIC: Correctly account for direction in Totals
      let hasEdge = false;
      if (market === "Spread") {
        hasEdge = lineValue > 0 || (lineValue === 0 && priceValue > 0);
      } else if (market === "Total") {
        // OVER: we want a LOWER line (sharp - soft > 0)
        // UNDER: we want a HIGHER line (soft - sharp > 0)
        if (side === "OVER") {
          const totalLineVal = -lineValue; // negate because calculateLineDiff is soft - sharp
          hasEdge = totalLineVal > 0 || (totalLineVal === 0 && priceValue > 0);
        } else {
          hasEdge = lineValue > 0 || (lineValue === 0 && priceValue > 0);
        }
      } else {
        hasEdge = priceValue > 0;
      }

      results.push({
        side,
        market,
        sharpLine,
        sharpOdds,
        bestSoftLine: softLine,
        bestSoftOdds: softOdds,
        bestSoftBook: soft.bookName,
        lineValue,
        priceValue,
        hasPositiveValue: hasEdge,
        booksWithEdge: hasEdge ? 1 : 0,
      });
    });
  };

  checkSide(
    "AWAY",
    "Spread",
    sharp.spreadLineA,
    sharp.spreadOddsA,
    (s) => s.spreadLineA,
    (s) => s.spreadOddsA,
  );
  checkSide(
    "HOME",
    "Spread",
    sharp.spreadLineB,
    sharp.spreadOddsB,
    (s) => s.spreadLineB,
    (s) => s.spreadOddsB,
  );
  checkSide(
    "AWAY",
    "Moneyline",
    "ML",
    sharp.mlOddsA,
    () => "ML",
    (s) => s.mlOddsA,
  );
  checkSide(
    "HOME",
    "Moneyline",
    "ML",
    sharp.mlOddsB,
    () => "ML",
    (s) => s.mlOddsB,
  );

  // Soccer Draw Support
  if (sharp.mlOddsDraw) {
    checkSide(
      "DRAW",
      "Moneyline",
      "ML",
      sharp.mlOddsDraw,
      () => "ML",
      (s) => s.mlOddsDraw || "N/A",
    );
  }

  checkSide(
    "OVER",
    "Total",
    sharp.totalLine,
    sharp.totalOddsOver,
    (s) => s.totalLine,
    (s) => s.totalOddsOver,
  );
  checkSide(
    "UNDER",
    "Total",
    sharp.totalLine,
    sharp.totalOddsUnder,
    (s) => s.totalLine,
    (s) => s.totalOddsUnder,
  );

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
  required: ["bookName", "spreadLineA", "spreadLineB"],
};

export const extractLinesFromScreenshot = async (
  file: File,
): Promise<BookLines> => {
  const base64 = await fileToBase64(file);

  const response = await geminiService.generateWithFallback(
    ["gemini-3-flash-preview"],
    {
      contents: {
        parts: [
          { text: EXTRACTION_PROMPT },
          { inlineData: { data: base64, mimeType: file.type } },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: bookLinesSchema,
        temperature: 0.1,
      },
    },
  );

  const fallback: BookLines = {
    bookName: "Unknown",
    spreadLineA: "N/A",
    spreadOddsA: "N/A",
    spreadLineB: "N/A",
    spreadOddsB: "N/A",
    totalLine: "N/A",
    totalOddsOver: "N/A",
    totalOddsUnder: "N/A",
    mlOddsA: "N/A",
    mlOddsB: "N/A",
  };

  return cleanAndParseJson(response.text, fallback);
};

// ============================================
// MAIN ANALYSIS (Stoic Handicapper)
// ============================================

type GameData = QueuedGame;

type StoicAiResult = {
  recommendation: "BET" | "PASS" | "LEAN";
  confidence: number;
  reasoning: string;
  handicapper_logic: string;
  trueProbability: number;
  impliedProbability: number;
  edge: number;
  wagerType: "Moneyline" | "Spread" | "Total";
  riskFactors?: string[];
  trapAlert?: string;
  expertSentiment?: string;
};

const stoicResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    recommendation: { type: Type.STRING },
    confidence: { type: Type.NUMBER },
    reasoning: { type: Type.STRING },
    handicapper_logic: { type: Type.STRING },
    trueProbability: { type: Type.NUMBER },
    impliedProbability: { type: Type.NUMBER },
    edge: { type: Type.NUMBER },
    wagerType: { type: Type.STRING },
    riskFactors: { 
      type: Type.ARRAY,
      items: { type: Type.STRING }
    },
    trapAlert: { type: Type.STRING },
    expertSentiment: { type: Type.STRING },
  },
  required: [
    "recommendation",
    "confidence",
    "reasoning",
    "handicapper_logic",
    "trueProbability",
    "impliedProbability",
    "edge",
    "wagerType",
  ],
};

const clampConfidence = (value: number) =>
  Math.max(0, Math.min(100, Math.round(value)));

const normalizeRecommendation = (value?: string): "BET" | "PASS" | "LEAN" => {
  if (!value) return "PASS";
  const upper = value.toUpperCase();
  if (upper === "BET" || upper === "PASS" || upper === "LEAN")
    return upper as "BET" | "PASS" | "LEAN";
  return "PASS";
};

const normalizeWagerType = (
  value?: string,
): "Moneyline" | "Spread" | "Total" | null => {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (normalized === "moneyline") return "Moneyline";
  if (normalized === "spread") return "Spread";
  if (normalized === "total") return "Total";
  return null;
};

const trimToTwoSentences = (text: string) => {
  if (!text) return "";
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  return sentences.slice(0, 2).join(" ");
};

const confidenceToLabel = (score: number): "HIGH" | "MEDIUM" | "LOW" => {
  if (score >= 70) return "HIGH";
  if (score >= 50) return "MEDIUM";
  return "LOW";
};

const getNoVigForMarket = (market: SideValue["market"], sharp: BookLines) => {
  if (market === "Moneyline") {
    if (sharp.mlOddsDraw) {
      const { probA, probB, probDraw } = calculateNoVig3Way(
        normalizeToAmerican(sharp.mlOddsA),
        normalizeToAmerican(sharp.mlOddsB),
        normalizeToAmerican(sharp.mlOddsDraw)
      );
      return { probA: probA * 100, probB: probB * 100, probDraw: probDraw * 100 };
    }
    return calculateNoVigProb(sharp.mlOddsA, sharp.mlOddsB);
  }
  if (market === "Spread") {
    return calculateNoVigProb(sharp.spreadOddsA, sharp.spreadOddsB);
  }
  return calculateNoVigProb(sharp.totalOddsOver, sharp.totalOddsUnder);
};

const getTrueProbability = (
  market: SideValue["market"],
  side: SideValue["side"],
  sharp: BookLines,
) => {
  const noVig = getNoVigForMarket(market, sharp) as any;
  if (market === "Total") {
    return side === "OVER" ? noVig.probA : noVig.probB;
  }
  if (side === "DRAW") return noVig.probDraw;
  return side === "AWAY" ? noVig.probA : noVig.probB;
};

/**
 * HELPER: Adjusts probability based on point differences.
 * Rule of thumb: 1 point in NBA/NFL is roughly 2-4% in win probability.
 */
const adjustProbForPoints = (
  baseProb: number, 
  pointDiff: number, 
  sport: Sport,
  market: "Spread" | "Total"
): number => {
  if (pointDiff === 0) return baseProb;
  
  // Point values vary by sport and market
  let pointValue = 3.0; // Default 3% per point
  
  if (sport === 'NBA') {
    pointValue = market === 'Total' ? 1.5 : 2.5;
  } else if (sport === 'NFL') {
    pointValue = market === 'Total' ? 1.0 : 4.0;
  } else if (sport === 'NHL') {
    pointValue = 10.0; // Huge value in hockey
  }

  // pointDiff is soft - sharp.
  // For Spreads: higher soft line is better for AWAY (+7 vs +6.5), worse for HOME (-7 vs -6.5).
  // This is already handled by analyzeAllSides giving us the signed lineValue.
  
  return Math.max(1, Math.min(99, baseProb + (pointDiff * pointValue)));
};

export const analyzeGame = async (
  game: GameData,
  persona?: UserPersona,
  balances?: BookBalanceDisplay[],
  groundTruth?: {
    awayRoster?: SportsDbPlayer[];
    homeRoster?: SportsDbPlayer[];
  }
): Promise<AnalysisResult> => {
  return enqueueAiTask("analysis", async () => {
  const edgeThreshold = persona?.min_edge_percentage ?? DEFAULT_EDGE_THRESHOLD;
  const decisionMode = persona?.decision_mode || "MATH_STRICT";

  if (!game.sharpLines || game.softLines.length === 0) {
    return {
      decision: "PASS",
      vetoTriggered: true,
      vetoReason: "DATA_MISSING: Sharp or soft lines missing.",
      recommendation: "PASS",
      reasoning: "Insufficient pricing data.",
      researchSummary: "Insufficient pricing data.",
      confidenceScore: 0,
    };
  }

  const allSides = analyzeAllSides(game.sharpLines, game.softLines);
  if (allSides.length === 0) {
    return {
      decision: "PASS",
      vetoTriggered: true,
      vetoReason: game.softLines.length === 0 ? "DATA_MISSING: Soft lines missing." : "NO_MARKET_DATA: No valid lines found.",
      recommendation: "PASS",
      reasoning: "Insufficient pricing data.",
      researchSummary: "Insufficient pricing data.",
      confidenceScore: 0,
    };
  }

  const candidates = allSides.map((s) => {
    let trueProbability = getTrueProbability(
      s.market,
      s.side,
      game.sharpLines!,
    );

    // Adjust probability for point differences
    if (s.market === "Spread" || s.market === "Total") {
      // For Totals, we need to handle direction
      let pointDiff = s.lineValue;
      if (s.market === "Total" && s.side === "OVER") {
        pointDiff = -s.lineValue; // OVER: lower line is better
      }
      trueProbability = adjustProbForPoints(trueProbability, pointDiff, game.sport, s.market);
    }

    const impliedProbability = americanToImpliedProb(s.bestSoftOdds);
    const edge = Math.round((trueProbability - impliedProbability) * 10) / 10;
    return { ...s, trueProbability, impliedProbability, edge };
  });

  const candidatePool = [...candidates]
    .sort((a, b) => {
    const lineDiff = Math.abs(b.lineValue) - Math.abs(a.lineValue);
    if (lineDiff !== 0) return lineDiff;
    const priceDiff = b.priceValue - a.priceValue;
    if (priceDiff !== 0) return priceDiff;
    return b.trueProbability - a.trueProbability;
  });

  if (candidatePool.length === 0) {
    const bestOverall = [...candidates].sort((a, b) => b.edge - a.edge)[0];
    return {
      decision: "PASS",
      vetoTriggered: true,
      vetoReason: "NO_MARKET_DATA: No valid lines found.",
      recommendation: "PASS",
      reasoning: "No valid lines found.",
      researchSummary: "No valid lines found.",
      confidenceScore: 0,
      trueProbability: bestOverall?.trueProbability ?? 0,
      impliedProbability: bestOverall?.impliedProbability ?? 0,
      edge: bestOverall?.edge ?? 0,
      wagerType: bestOverall?.market ?? undefined,
    };
  }

  // LIQUIDITY FILTER: Find the best candidate that actually has funds
  let best = candidatePool[0];
  let fundedCandidate = null;

  if (balances) {
    for (const cand of candidatePool) {
      const rec = getRecommendedBook([cand.bestSoftBook], balances);
      if (rec.book) {
        fundedCandidate = cand;
        break;
      }
    }
  } else {
    // If no balance context provided (e.g. initial scan), assume best is funded for now
    fundedCandidate = best;
  }

  // If we found positive edge plays but NONE are funded, trigger veto
  if (!fundedCandidate) {
    return {
      decision: "PASS",
      vetoTriggered: true,
      vetoReason: "INSUFFICIENT_FUNDS: No funded books available for candidate plays.",
      recommendation: "PASS",
      reasoning: "No funded books available for available lines.",
      researchSummary: "Liquidity Veto: Candidate books have insufficient balance.",
      confidenceScore: 0,
      trueProbability: best.trueProbability,
      impliedProbability: best.impliedProbability,
      edge: best.edge,
      wagerType: best.market,
    };
  }

  best = fundedCandidate;

  const refLines = getReferenceLines(game.id);
  const lineMovement =
    refLines && best.market === "Spread"
      ? `Reference spread: ${refLines.spreadLineA} -> Current: ${game.sharpLines.spreadLineA}`
      : "No reference line data available.";

  const teamName =
    best.side === "AWAY"
      ? game.awayTeam.name
      : best.side === "HOME"
        ? game.homeTeam.name
        : best.side;

  const pick = `${teamName} ${best.market}`;
  const recLine =
    best.market === "Moneyline"
      ? formatOddsForDisplay(best.bestSoftOdds)
      : `${best.bestSoftLine} (${formatOddsForDisplay(best.bestSoftOdds)})`;

  let lineFloor: string | undefined;
  let oddsFloor: string | undefined;
  let floorReason: string | undefined;

  if (best.market === "Spread" || best.market === "Total") {
    lineFloor =
      best.market === "Total"
        ? `${best.side === "OVER" ? "o" : "u"}${best.sharpLine}`
        : best.sharpLine;

    // Floor is sharp book's odds - where edge disappears
    oddsFloor = formatOddsForDisplay(best.sharpOdds);
    floorReason =
      best.market === "Spread"
        ? "Matches sharp line - no edge below this"
        : "Matches sharp line";
  } else {
    oddsFloor = formatOddsForDisplay(best.sharpOdds);
    floorReason = "Matches sharp price";
  }

  // Fetch qualitative context for AI context + UI display (no hard veto)
  // OPTIMIZATION: Skip redundant scan if already performed (e.g. from manual scan button)
  const context = game.scanResult || await geminiService.quickScanGame(game, groundTruth);

  const awayRosterStr = (groundTruth?.awayRoster && groundTruth.awayRoster.length > 0)
    ? groundTruth.awayRoster.slice(0, 15).map(p => `${p.strPlayer} (${p.strPosition})`).join(", ")
    : "NO VERIFIED ROSTER DATA AVAILABLE. DO NOT NAME SPECIFIC PLAYERS FOR THIS TEAM UNLESS YOU ARE CERTAIN FROM LIVE SEARCH.";
  const homeRosterStr = (groundTruth?.homeRoster && groundTruth.homeRoster.length > 0)
    ? groundTruth.homeRoster.slice(0, 15).map(p => `${p.strPlayer} (${p.strPosition})`).join(", ")
    : "NO VERIFIED ROSTER DATA AVAILABLE. DO NOT NAME SPECIFIC PLAYERS FOR THIS TEAM UNLESS YOU ARE CERTAIN FROM LIVE SEARCH.";

  const prompt = `
Matchup: ${game.awayTeam.name} at ${game.homeTeam.name}
Sport: ${game.sport}

Ground Truth Rosters (Verified):
- ${game.awayTeam.name}: ${awayRosterStr}
- ${game.homeTeam.name}: ${homeRosterStr}

CRITICAL: Use the verified rosters above. If a team has "NO VERIFIED ROSTER DATA AVAILABLE", do not assume or invent player/team pairings. 

Market: ${best.market}
Side: ${best.side}
Sharp line/odds: ${best.sharpLine} (${best.sharpOdds})
Soft best line/odds: ${best.bestSoftLine} (${best.bestSoftOdds}) at ${best.bestSoftBook}

TrueProbability: ${best.trueProbability}%
ImpliedProbability: ${best.impliedProbability}%
Edge: ${best.edge}%

Situational Context:
- Injuries: ${context.injuryContext}
- Spot: ${context.situationalContext}
- Game Script: ${context.gameScript}

Line Movement: ${lineMovement}

Tasks:
- Synthesize the provided Situational Context with Ground Truth rosters to ensure the impact of injuries is correctly weighted.
- If Ground Truth rosters show a key player is active/present who was previously reported as doubtful, prioritize the Ground Truth data.
- Reasoning max 2 sentences, blunt and data-only.
- Handicapper Logic: 1-2 sentences synthesising math + ground truth + situational data.
Return JSON only.
`;

  let analysis: StoicAiResult;
  try {
    const response = await geminiService.generateWithFallback(
      ["gemini-3-pro-preview"],
      {
        contents: prompt,
        config: {
          systemInstruction: getSystemPrompt(persona),
          responseMimeType: "application/json",
          responseSchema: stoicResponseSchema,
          temperature: 0.1,
        },
      },
      { disableFallback: true, timeoutMs: 60000 },
    );
    analysis = cleanAndParseJson(response.text, {
      recommendation: "PASS",
      confidence: 0,
      reasoning: "No actionable edge.",
      trueProbability: best.trueProbability,
      impliedProbability: best.impliedProbability,
      edge: best.edge,
      wagerType: best.market,
      riskFactors: [],
    });
  } catch (error: any) {
    if (isTimeoutError(error)) {
      try {
        const retryResponse = await geminiService.generateWithFallback(
          ["gemini-3-pro-preview"],
          {
            contents: prompt,
            config: {
              systemInstruction: getSystemPrompt(persona),
              responseMimeType: "application/json",
              responseSchema: stoicResponseSchema,
              temperature: 0.1,
            },
          },
          { disableFallback: true, timeoutMs: 30000 },
        );
        analysis = cleanAndParseJson(retryResponse.text, {
          recommendation: "PASS",
          confidence: 0,
          reasoning: "No actionable edge.",
          trueProbability: best.trueProbability,
          impliedProbability: best.impliedProbability,
          edge: best.edge,
          wagerType: best.market,
          riskFactors: [],
        });
      } catch (retryError: any) {
        if (isTimeoutError(retryError)) {
          const timeoutError = new Error("AI_TIMEOUT");
          (timeoutError as any).code = "AI_TIMEOUT";
          throw timeoutError;
        }
        return {
          decision: "PASS",
          vetoTriggered: true,
          vetoReason: "AI_ERROR: Stoic analysis failed.",
          recommendation: "PASS",
          reasoning: "AI error.",
          researchSummary: "AI error.",
          confidenceScore: 0,
          trueProbability: best.trueProbability,
          impliedProbability: best.impliedProbability,
          edge: best.edge,
          wagerType: best.market,
        };
      }
      // Retry succeeded, continue flow with parsed `analysis`.
    } else {
      return {
        decision: "PASS",
        vetoTriggered: true,
        vetoReason: "AI_ERROR: Stoic analysis failed.",
        recommendation: "PASS",
        reasoning: "AI error.",
        researchSummary: "AI error.",
        confidenceScore: 0,
        trueProbability: best.trueProbability,
        impliedProbability: best.impliedProbability,
        edge: best.edge,
        wagerType: best.market,
      };
    }
  }

  // DATA QUALITY VETO: Cross-reference AI reasoning with Ground Truth
  if (groundTruth && analysis.recommendation !== "PASS") {
    const combinedRosterNames = [
      ...(groundTruth.awayRoster || []).map(p => p.strPlayer.toLowerCase()),
      ...(groundTruth.homeRoster || []).map(p => p.strPlayer.toLowerCase())
    ];
    
    const reasoningLower = (analysis.reasoning + " " + analysis.handicapper_logic).toLowerCase();
    
    // Check for high-risk hallucination names and abbreviations
    const riskPlayers = [
      { names: ['davis', 'ad'], display: 'Anthony Davis' },
      { names: ['lebron', 'lbj'], display: 'LeBron James' },
      { names: ['durant', 'kd'], display: 'Kevin Durant' },
      { names: ['curry', 'steph'], display: 'Stephen Curry' },
      { names: ['embiid'], display: 'Joel Embiid' },
      { names: ['jokic'], display: 'Nikola Jokic' }
    ];

    for (const player of riskPlayers) {
      // Check if ANY of the player's names/aliases are mentioned with word boundaries
      const isMentioned = player.names.some(n => {
        const regex = new RegExp(`\\b${n}\\b`, 'i');
        return regex.test(reasoningLower);
      });

      if (isMentioned && !combinedRosterNames.some(rn => {
        // Roster names usually contain the full name, e.g. "Anthony Davis"
        return player.names.some(n => rn.includes(n));
      })) {
        return {
          decision: "PASS",
          vetoTriggered: true,
          vetoReason: `DATA_QUALITY_VETO: AI mentioned ${player.display} who is not on the verified rosters.`,
          recommendation: "PASS",
          reasoning: `Hallucination detected regarding ${player.display}.`,
          researchSummary: `Data quality failure: ${player.display} not on rosters.`,
          confidenceScore: 0,
        };
      }
    }
  }

    const normalizedRec = normalizeRecommendation(analysis.recommendation);

    const normalizedWagerType = normalizeWagerType(analysis.wagerType);

    const confidenceScore = clampConfidence(analysis.confidence);

    const reasoning = trimToTwoSentences(analysis.reasoning || "");

    const maxOdds = persona?.max_odds_american ?? -160;

    const bestOddsVal = normalizeToAmerican(best.bestSoftOdds);

  

    let finalRecommendation = normalizedRec;

    

    // LOGIC VETO 1: Max Odds (Hard Price Cap)

    if (Number.isFinite(bestOddsVal) && bestOddsVal < maxOdds) {

      finalRecommendation = "PASS";

    }

  

    if (finalRecommendation === "PASS" && normalizedRec !== "PASS") {

      console.log(`[DEBUG] analyzeGame vetoed result. Reasons:`, {

        oddsBelowLimit: Number.isFinite(bestOddsVal) ? bestOddsVal < maxOdds : false,

        bestOddsVal,

        maxOdds,

        aiRecommendation: normalizedRec

      });

    }

  

    const decision = (finalRecommendation === "BET" || finalRecommendation === "LEAN") ? "PLAYABLE" : "PASS";

    const unitTier =

      finalRecommendation === "BET"

        ? getUnitTier(best.trueProbability, best.edge)

        : null;

  

    const summary = appendUnitNote(

      reasoning || "Stoic: No narrative, math only.",

      unitTier,

    );

  

    // Smart Wallet: Calculate recommended book based on liquidity

    let recommendedBook: string | undefined;

    let balanceStatus: "SUFFICIENT" | "LOW" | "CRITICAL" | undefined;

  

    if (balances && finalRecommendation === "BET") {

      const candidateBooks = [best.bestSoftBook];

      const rec = getRecommendedBook(candidateBooks, balances);

      if (rec.book) {

        recommendedBook = rec.book;

        balanceStatus = rec.status || undefined;

      }

    }

  

      return {

  

        decision,

  

        vetoTriggered: finalRecommendation === "PASS",

  

        vetoReason:

  

          finalRecommendation === "PASS"

  

            ? (Number.isFinite(bestOddsVal) && bestOddsVal < maxOdds)

  

              ? `JUICE_VETO: Recommended odds ${formatOddsForDisplay(bestOddsVal)} are worse than ${formatOddsForDisplay(maxOdds)} limit.`

  

              : "AI_PASS: AI did not find a playable side."

  

            : undefined,

  

        caution:

  

    

  
      finalRecommendation === "LEAN" ? "Lean only: marginal edge." : undefined,
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
    researchSummary: summary,
    edgeNarrative: summary,
    confidence: confidenceToLabel(confidenceScore),
    confidenceScore,
    reasoning,
    handicapper_logic: analysis.handicapper_logic,
    trueProbability: best.trueProbability,
    impliedProbability: best.impliedProbability,
    edge: best.edge,
    wagerType: normalizedWagerType || best.market,
    riskFactors: analysis.riskFactors,
    trapAlert: analysis.trapAlert,
    expertSentiment: analysis.expertSentiment,
    recommendedBook,
    balanceStatus,
  };
  });
};

export const refreshAnalysisMathOnly = (
  game: QueuedGame,
  persona?: UserPersona,
  balances?: BookBalanceDisplay[],
): HighHitAnalysis => {
  const prior = game.analysis;
  if (!prior) {
    return {
      decision: "PASS",
      vetoTriggered: true,
      vetoReason: "REFRESH_FAILED: No prior analysis.",
      researchSummary: "No prior analysis found to refresh.",
    };
  }

  const maxOdds = persona?.max_odds_american ?? -160;

  if (prior.decision !== "PLAYABLE") {
    return { ...prior };
  }

  if (!game.sharpLines || game.softLines.length === 0) {
    return {
      ...prior,
      decision: "PASS",
      vetoTriggered: true,
      vetoReason: "REFRESH_FAILED: Missing sharp/soft lines.",
    };
  }

  const allSides = analyzeAllSides(game.sharpLines, game.softLines);

  const candidates = allSides.map((s) => {
    let trueProbability = getTrueProbability(
      s.market,
      s.side,
      game.sharpLines!,
    );

    if (s.market === "Spread" || s.market === "Total") {
      let pointDiff = s.lineValue;
      if (s.market === "Total" && s.side === "OVER") {
        pointDiff = -s.lineValue;
      }
      trueProbability = adjustProbForPoints(trueProbability, pointDiff, game.sport, s.market);
    }

    const impliedProbability = americanToImpliedProb(s.bestSoftOdds);
    const edge = Math.round((trueProbability - impliedProbability) * 10) / 10;
    return { ...s, trueProbability, impliedProbability, edge };
  });

  const rankedCandidates = [...candidates]
    .sort((a, b) => {
    const lineDiff = Math.abs(b.lineValue) - Math.abs(a.lineValue);
    if (lineDiff !== 0) return lineDiff;
    const priceDiff = b.priceValue - a.priceValue;
    if (priceDiff !== 0) return priceDiff;
    return b.trueProbability - a.trueProbability;
  });

  if (rankedCandidates.length === 0) {
    return {
      ...prior,
      decision: "PASS",
      vetoTriggered: true,
      vetoReason: "NO_MARKET_DATA: No valid lines found in refresh.",
      recommendation: "PASS",
    };
  }

  // LIQUIDITY FILTER: Find the best candidate that actually has funds
  let best = null;

  if (balances) {
    for (const cand of rankedCandidates) {
      const rec = getRecommendedBook([cand.bestSoftBook], balances);
      if (rec.book) {
        best = cand;
        break;
      }
    }
  } else {
    best = rankedCandidates[0];
  }

  if (!best) {
    return {
      ...prior,
      decision: "PASS",
      vetoTriggered: true,
      vetoReason: "INSUFFICIENT_FUNDS: No funded books available for candidate plays.",
    };
  }

  const lineValueCents = best.priceValue > 0 ? best.priceValue : 0;

  const bestOddsVal = parseFloat(best.bestSoftOdds);
  if (!isNaN(bestOddsVal) && bestOddsVal < maxOdds) {
    return {
      ...prior,
      decision: "PASS",
      vetoTriggered: true,
      vetoReason: `JUICE_VETO: Recommended odds ${formatOddsForDisplay(bestOddsVal)} are worse than ${formatOddsForDisplay(maxOdds)} limit.`,
      sharpImpliedProb: best.trueProbability,
      lineValueCents,
      lineValuePoints: best.lineValue,
    };
  }

  let lineFloor: string | undefined;
  let oddsFloor: string | undefined;
  let floorReason: string | undefined;

  if (best.market === "Spread" || best.market === "Total") {
    lineFloor =
      best.market === "Total"
        ? `${best.side === "OVER" ? "o" : "u"}${best.sharpLine}`
        : best.sharpLine;

    // Floor is sharp book's odds - where edge disappears
    oddsFloor = formatOddsForDisplay(best.sharpOdds);
    floorReason =
      best.market === "Spread"
        ? "Matches sharp line - no edge below this"
        : "Matches sharp line";
  } else if (best.market === "Moneyline") {
    lineFloor = undefined;
    oddsFloor = formatOddsForDisplay(best.sharpOdds);
    floorReason = "Matches sharp price";
  }

  const teamName =
    best.side === "AWAY"
      ? game.awayTeam.name
      : best.side === "HOME"
        ? game.homeTeam.name
        : best.side;

  const recLine =
    best.market === "Moneyline"
      ? formatOddsForDisplay(best.bestSoftOdds)
      : `${best.bestSoftLine} (${formatOddsForDisplay(best.bestSoftOdds)})`;

  // Smart Wallet: Calculate recommended book based on liquidity
  let recommendedBook: string | undefined;
  let balanceStatus: "SUFFICIENT" | "LOW" | "CRITICAL" | undefined;

  if (balances) {
    const candidateBooks = [best.bestSoftBook];
    const rec = getRecommendedBook(candidateBooks, balances);
    if (rec.book) {
      recommendedBook = rec.book;
      balanceStatus = rec.status || undefined;
    }
  }

  return {
    ...prior,
    decision: "PLAYABLE",
    vetoTriggered: false,
    vetoReason: undefined,
    recommendation: prior.recommendation ?? "BET",
    pick: `${teamName} ${best.market}`,
    recLine,
    recProbability: best.trueProbability,
    market: best.market,
    side: best.side,
    line: best.bestSoftLine,
    sharpImpliedProb: best.trueProbability,
    softBestOdds: formatOddsForDisplay(best.bestSoftOdds),
    softBestBook: best.bestSoftBook,
    lineValueCents,
    lineValuePoints: best.lineValue,
    lineFloor,
    oddsFloor,
    floorReason,
    recommendedBook,
    balanceStatus,
  };
};

// ============================================
// QUICK SCAN SERVICE
// ============================================

export const quickScanGame = async (
  game: Game,
  groundTruth?: {
    awayRoster?: SportsDbPlayer[];
    homeRoster?: SportsDbPlayer[];
  }
): Promise<ScanResult> => {
  return enqueueAiTask("scan", async () => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    return {
      signal: "WHITE",
      description: "Scan unavailable: missing API key.",
      injuryContext: "Unavailable",
      situationalContext: "Unavailable",
      gameScript: "Unavailable",
    };
  }

  const dateObj = new Date(game.date);
  const readableDate = dateObj.toLocaleDateString("en-US", {
    weekday: "short",
    month: "long",
    day: "numeric",
  });

  const awayRosterStr = (groundTruth?.awayRoster && groundTruth.awayRoster.length > 0)
    ? groundTruth.awayRoster.slice(0, 15).map(p => `${p.strPlayer} (${p.strPosition})`).join(", ")
    : "NO VERIFIED ROSTER DATA AVAILABLE. DO NOT NAME SPECIFIC PLAYERS FOR THIS TEAM UNLESS YOU ARE CERTAIN FROM LIVE SEARCH.";
  const homeRosterStr = (groundTruth?.homeRoster && groundTruth.homeRoster.length > 0)
    ? groundTruth.homeRoster.slice(0, 15).map(p => `${p.strPlayer} (${p.strPosition})`).join(", ")
    : "NO VERIFIED ROSTER DATA AVAILABLE. DO NOT NAME SPECIFIC PLAYERS FOR THIS TEAM UNLESS YOU ARE CERTAIN FROM LIVE SEARCH.";

  const prompt = `
    Conduct a deep situational scan for ${game.awayTeam.name} vs ${game.homeTeam.name} (${game.sport}) on ${readableDate}.
    
    Ground Truth Rosters (Verified):
    - ${game.awayTeam.name}: ${awayRosterStr}
    - ${game.homeTeam.name}: ${homeRosterStr}

    CRITICAL: Use the verified rosters above. If a team has "NO VERIFIED ROSTER DATA AVAILABLE", do not assume or invent player/team pairings.

    Research:
    1. Injuries: Who is OUT or Questionable? Cross-reference with Ground Truth rosters to ensure impact players are correctly identified.
    2. Situational Spot: Is this a back-to-back? Rest advantage? Travel fatigue?
    3. Expert Sentiment: What is the consensus from reputable beat writers and sharp handicappers? Are there any "trap" warnings?
    4. Game Script: How is the game likely to play out based on matchups?
    
    Return JSON only:
    {
      "signal": "RED" | "YELLOW" | "WHITE",
      "description": "Short summary (10 words)",
      "injuryContext": "Detailed injury info",
      "situationalContext": "Rest/Travel context",
      "expertSentiment": "Expert consensus/warnings",
      "gameScript": "Expected game flow"
    }
  `;

  try {
    const response = await geminiService.generateWithFallback(
      ["gemini-3-flash-preview"],
      {
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          temperature: 0.2,
        },
      },
      { disableFallback: true, timeoutMs: 45000 },
    );

    return cleanAndParseJson(response.text, {
      signal: "WHITE",
      description: "Scan completed",
      injuryContext: "No injury data found.",
      situationalContext: "Standard rest.",
      expertSentiment: "No expert consensus found.",
      gameScript: "No specific script detected."
    });
  } catch (e: any) {
    console.error("Quick scan failed (with search tool)", e);
    // Fallback: retry without external tools
    try {
      const response = await geminiService.generateWithFallback(
        ["gemini-3-flash-preview"],
        {
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            temperature: 0.2,
          },
        },
        { disableFallback: true, timeoutMs: 30000 },
      );

      return cleanAndParseJson(response.text, {
        signal: "WHITE", 
        description: "Scan completed (retry)",
        injuryContext: "No injury data found.",
        situationalContext: "Standard rest.",
        expertSentiment: "No expert consensus found.",
        gameScript: "No specific script detected."
      });
    } catch (fallbackError: any) {
      console.error("Quick scan failed (retry)", fallbackError);
      if (isTimeoutError(fallbackError)) {
        return {
          signal: "WHITE",
          description: "Scan deferred: AI timeout",
          injuryContext: "Unavailable",
          situationalContext: "Unavailable",
          expertSentiment: "Unavailable",
          gameScript: "Unavailable",
          deferred: true,
          error: "AI_TIMEOUT"
        };
      }
      const message =
        (fallbackError?.message || e?.message || "Unknown error").slice(0, 120);
      return { 
        signal: "WHITE", 
        description: `Scan unavailable: ${message}`,
        injuryContext: "Unavailable",
        situationalContext: "Unavailable",
        expertSentiment: "Unavailable",
        gameScript: "Unavailable"
      };
    }
  }
  });
};

export const detectMarketDiff = (
  sharpVal: string,
  softVal: string,
  type: "SPREAD" | "TOTAL" | "ML",
): boolean => {
  if (!sharpVal || !softVal || sharpVal === "N/A" || softVal === "N/A")
    return false;

  const s1 = parseFloat(sharpVal);
  const s2 = parseFloat(softVal);
  if (isNaN(s1) || isNaN(s2)) return false;

  if (type === "SPREAD" || type === "TOTAL") {
    return Math.abs(s1 - s2) >= 0.5;
  }
  if (type === "ML") {
    return Math.abs(s1 - s2) > 15;
  }
  return false;
};

// Create a named export object for internal spying
export const geminiService = {
  getAiClient,
  getAiStatus,
  getSystemPrompt,
  generateWithFallback,
  analyzeGame,
  refreshAnalysisMathOnly,
  quickScanGame,
  detectMarketDiff,
  formatOddsForDisplay,
  americanToImpliedProb,
  calculateNoVigProb,
  calculateJuiceDiff,
  calculateLineDiff,
  checkPriceVetoes,
  extractLinesFromScreenshot
};
