import { GoogleGenAI } from "@google/genai";
import { nowIso } from "../utils/time.js";
import type {
  AnalysisResult,
  AnalysisWithUsage,
  Bookmaker,
  GeminiUsage,
  OddsGame,
  OddsMarket,
  SlateGame,
  WnbaCandidate,
  WnbaDataPack,
  WnbaPassReasonCode,
} from "../types.js";
import { normalizeTeamName } from "./wnbaDataService.js";

type GeminiClient = {
  models: {
    generateContent(input: any): Promise<any>;
  };
};

export type GeminiCostConfig = {
  inputCostPerMillionTokens: number;
  outputCostPerMillionTokens: number;
  fallbackInputTokens: number;
  fallbackOutputTokens: number;
};

const DEFAULT_COST_CONFIG: GeminiCostConfig = {
  inputCostPerMillionTokens: 2,
  outputCostPerMillionTokens: 12,
  fallbackInputTokens: 6000,
  fallbackOutputTokens: 1200,
};
const GEMINI_TIMEOUT_MS = 45000;

export class AnalysisService {
  private readonly client: GeminiClient | null;
  private readonly model: string;
  private readonly costConfig: GeminiCostConfig;

  constructor(apiKey?: string, client?: GeminiClient, model = "gemini-3-pro-preview", costConfig = DEFAULT_COST_CONFIG) {
    this.client = client || (apiKey ? new GoogleGenAI({ apiKey }) : null);
    this.model = model;
    this.costConfig = costConfig;
  }

  async analyzeGame(dateEt: string, game: SlateGame, odds: OddsGame | null, dataPack?: WnbaDataPack | null): Promise<AnalysisWithUsage> {
    const candidate = selectBestWnbaCandidate(game, odds);
    if (!candidate) {
      return {
        result: passAnalysis(
          dateEt,
          game.id,
          "NO_EDGE",
          "No WNBA market cleared the 1.5% value floor against the available book consensus.",
        ),
        usage: null,
      };
    }

    if (!this.client) {
      return {
        result: fallbackAnalysis(dateEt, game.id, "Gemini is not configured."),
        usage: null,
      };
    }

    const prompt = buildWnbaPrompt(game, odds, candidate, dataPack || null);
    let response: any;
    try {
      response = await withTimeout(
        this.client.models.generateContent({
          model: this.model,
          contents: prompt,
          config: {
            tools: [{ googleSearch: {} }],
            temperature: 0.15,
          },
        }),
        GEMINI_TIMEOUT_MS,
      );
    } catch (error) {
      return {
        result: passAnalysis(
          dateEt,
          game.id,
          "AI_ERROR",
          error instanceof Error ? error.message : "Gemini analysis failed before returning a verified recommendation.",
          candidate,
        ),
        usage: null,
      };
    }

    const text = typeof response.text === "function" ? response.text() : response.text;
    const parsed = parseJson(text);
    const result = normalizeAnalysis(dateEt, game.id, parsed, candidate);
    return {
      result,
      usage: estimateGeminiUsage(this.model, game.id, response, this.costConfig),
    };
  }
}

export const estimatePlannedGeminiCostUsd = (gameCount: number, costConfig: GeminiCostConfig) =>
  gameCount *
  ((costConfig.fallbackInputTokens / 1_000_000) * costConfig.inputCostPerMillionTokens +
    (costConfig.fallbackOutputTokens / 1_000_000) * costConfig.outputCostPerMillionTokens);

export const buildWnbaPrompt = (
  game: SlateGame,
  odds: OddsGame | null,
  candidate: WnbaCandidate,
  dataPack: WnbaDataPack | null,
) => `
You are analyzing one WNBA betting market for EdgeLab.

Game:
${game.awayTeam.name} at ${game.homeTeam.name}
Tip: ${game.date}

Selected priced candidate:
${JSON.stringify(candidate)}

Official/free WNBA data pack:
${JSON.stringify(dataPack || null)}

Available odds snapshot for audit only:
${JSON.stringify(odds || null)}

Rules:
- Focus only on WNBA.
- Evaluate ONLY the selected priced candidate. Do not switch markets, sides, teams, or totals.
- Totals deserve priority only when pace plus offensive/defensive efficiency support the number.
- Spreads and moneylines require verified availability for high-usage players, primary creators, rim protectors, or defensive anchors.
- Use official/free WNBA data first. Use current search-backed facts only to verify gaps in the data pack.
- Treat weak injury, rotation, efficiency, pace, or market support as a reason to PASS.
- Do not invent player availability, team stats, or line movement.
- Return JSON only.

Schema:
{
  "recommendation": "BET" | "LEAN" | "PASS",
  "confidence": 0-100,
  "dataQuality": "STRONG" | "PARTIAL" | "WEAK",
  "selectedMarket": "Moneyline" | "Spread" | "Total",
  "selectedSide": "must match selected candidate side exactly",
  "marketValue": "short factual statement",
  "reasoning": "two sentences maximum",
  "riskFactors": ["short factual risks"],
  "passReasonCode": "NO_EDGE" | "STALE_INJURY_DATA" | "STATS_CONFLICT" | "MARKET_OVERREACTION" | "LOW_CONFIDENCE" | "MISSING_ROTATION_DATA"
}
`;

const normalizeAnalysis = (dateEt: string, gameId: string, parsed: any, candidate: WnbaCandidate): AnalysisResult => {
  const recommendation = ["BET", "LEAN", "PASS"].includes(parsed?.recommendation) ? parsed.recommendation : "PASS";
  const dataQuality = ["STRONG", "PARTIAL", "WEAK"].includes(parsed?.dataQuality) ? parsed.dataQuality : "WEAK";
  const confidence = Number.isFinite(parsed?.confidence) ? Math.max(0, Math.min(100, Math.round(parsed.confidence))) : 0;
  const selectedMarket = ["Moneyline", "Spread", "Total"].includes(parsed?.selectedMarket)
    ? parsed.selectedMarket
    : candidate.market;
  const selectedSide = String(parsed?.selectedSide || candidate.side);
  const switchedMarket = selectedMarket !== candidate.market || normalizeName(selectedSide) !== normalizeName(candidate.side);
  const finalRecommendation = dataQuality === "WEAK" || switchedMarket ? "PASS" : recommendation;

  return {
    gameId,
    dateEt,
    recommendation: finalRecommendation,
    confidence,
    dataQuality,
    marketValue: String(parsed?.marketValue || `${candidate.edgePercent.toFixed(2)}% consensus edge on ${candidate.bookTitle}.`),
    reasoning: switchedMarket
      ? `AI attempted to evaluate ${selectedSide} ${selectedMarket} instead of the selected ${candidate.side} ${candidate.market}.`
      : String(parsed?.reasoning || "Insufficient verified WNBA data."),
    riskFactors: [
      ...(Array.isArray(parsed?.riskFactors) ? parsed.riskFactors.map(String) : []),
      ...(switchedMarket ? ["AI market switch veto"] : []),
    ],
    createdAt: nowIso(),
    selectedMarket: candidate.market,
    selectedSide: candidate.side,
    selectedBook: candidate.bookTitle,
    selectedOdds: candidate.odds,
    selectedPoint: candidate.point,
    edgePercent: candidate.edgePercent,
    passReasonCode: switchedMarket ? "AI_MARKET_SWITCH" : readPassReasonCode(parsed?.passReasonCode),
  };
};

const fallbackAnalysis = (dateEt: string, gameId: string, reason: string): AnalysisResult => ({
  gameId,
  dateEt,
  recommendation: "PASS",
  confidence: 0,
  dataQuality: "WEAK",
  marketValue: "Unavailable",
  reasoning: reason,
  riskFactors: ["Analysis unavailable"],
  createdAt: nowIso(),
  passReasonCode: "AI_ERROR",
});

const passAnalysis = (
  dateEt: string,
  gameId: string,
  passReasonCode: WnbaPassReasonCode,
  reason: string,
  candidate?: WnbaCandidate,
): AnalysisResult => ({
  gameId,
  dateEt,
  recommendation: "PASS",
  confidence: 0,
  dataQuality: "WEAK",
  marketValue: candidate ? `${candidate.edgePercent.toFixed(2)}% consensus edge did not clear final validation.` : "No valid WNBA candidate.",
  reasoning: reason,
  riskFactors: [passReasonCode],
  createdAt: nowIso(),
  selectedMarket: candidate?.market,
  selectedSide: candidate?.side,
  selectedBook: candidate?.bookTitle,
  selectedOdds: candidate?.odds,
  selectedPoint: candidate?.point,
  edgePercent: candidate?.edgePercent,
  passReasonCode,
});

const parseJson = (text: string | undefined) => {
  if (!text) return {};
  try {
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch {
    return {};
  }
};

const estimateGeminiUsage = (
  model: string,
  gameId: string,
  response: any,
  costConfig: GeminiCostConfig,
): GeminiUsage => {
  const usageMetadata = response?.usageMetadata || response?.usage_metadata;
  const promptTokens = readTokenCount(usageMetadata, ["promptTokenCount", "prompt_token_count", "inputTokenCount"]);
  const outputTokens = readTokenCount(usageMetadata, ["candidatesTokenCount", "candidates_token_count", "outputTokenCount"]);
  const inputTokens = promptTokens ?? costConfig.fallbackInputTokens;
  const finalOutputTokens = outputTokens ?? costConfig.fallbackOutputTokens;

  return {
    model,
    gameId,
    inputTokens,
    outputTokens: finalOutputTokens,
    estimatedCostUsd:
      (inputTokens / 1_000_000) * costConfig.inputCostPerMillionTokens +
      (finalOutputTokens / 1_000_000) * costConfig.outputCostPerMillionTokens,
    usedFallbackTokens: promptTokens === null || outputTokens === null,
  };
};

const readTokenCount = (metadata: any, keys: string[]) => {
  for (const key of keys) {
    const value = Number(metadata?.[key]);
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return null;
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(`Gemini timed out after ${timeoutMs}ms.`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

export const findOddsForSlateGame = (game: SlateGame, odds: OddsGame[]): OddsGame | null => {
  const home = normalizeName(game.homeTeam.name);
  const away = normalizeName(game.awayTeam.name);
  return (
    odds.find((candidate) => normalizeName(candidate.home_team) === home && normalizeName(candidate.away_team) === away) ||
    null
  );
};

export const selectBestWnbaCandidate = (game: SlateGame, odds: OddsGame | null): WnbaCandidate | null => {
  if (!odds || odds.bookmakers.length < 2) return null;
  const candidates = [
    ...buildMoneylineCandidates(game, odds),
    ...buildPointMarketCandidates(game, odds, "spreads"),
    ...buildPointMarketCandidates(game, odds, "totals"),
  ].filter((candidate) => candidate.edgePercent >= 1.5);

  return candidates.sort((a, b) => b.rankingScore - a.rankingScore)[0] || null;
};

const buildMoneylineCandidates = (game: SlateGame, odds: OddsGame): WnbaCandidate[] => {
  const outcomes = odds.bookmakers.flatMap((book) =>
    getMarket(book, "h2h")?.outcomes.map((outcome) => ({ book, outcome })) || [],
  );
  return outcomes.flatMap(({ book, outcome }) => {
    const sameSide = outcomes.filter((item) => normalizeName(item.outcome.name) === normalizeName(outcome.name));
    if (sameSide.length < 2) return [];
    const fairProbability = average(sameSide.map((item) => americanToImpliedProbability(item.outcome.price)));
    const impliedProbability = americanToImpliedProbability(outcome.price);
    const edgePercent = (fairProbability - impliedProbability) * 100;
    return [
      {
        gameId: game.id,
        market: "Moneyline",
        side: outcome.name,
        teamName: outcome.name,
        bookKey: book.key,
        bookTitle: book.title,
        odds: outcome.price,
        fairProbability,
        impliedProbability,
        edgePercent,
        rankingScore: edgePercent,
        supportNotes: ["Consensus moneyline value versus available supported books."],
      },
    ];
  });
};

const buildPointMarketCandidates = (game: SlateGame, odds: OddsGame, marketKey: "spreads" | "totals"): WnbaCandidate[] => {
  const market = marketKey === "totals" ? "Total" : "Spread";
  const outcomes = odds.bookmakers.flatMap((book) =>
    getMarket(book, marketKey)?.outcomes.map((outcome) => ({ book, outcome })) || [],
  );
  return outcomes.flatMap(({ book, outcome }) => {
    if (outcome.point === undefined) return [];
    const sameSideAndPoint = outcomes.filter(
      (item) => normalizeName(item.outcome.name) === normalizeName(outcome.name) && item.outcome.point === outcome.point,
    );
    if (sameSideAndPoint.length < 2) return [];
    const fairProbability = average(sameSideAndPoint.map((item) => americanToImpliedProbability(item.outcome.price)));
    const impliedProbability = americanToImpliedProbability(outcome.price);
    const edgePercent = (fairProbability - impliedProbability) * 100;
    return [
      {
        gameId: game.id,
        market,
        side: market === "Total" ? outcome.name.toUpperCase() : outcome.name,
        teamName: market === "Spread" ? outcome.name : undefined,
        bookKey: book.key,
        bookTitle: book.title,
        odds: outcome.price,
        point: outcome.point,
        fairProbability,
        impliedProbability,
        edgePercent,
        rankingScore: edgePercent + (market === "Total" ? 0.35 : 0),
        supportNotes:
          market === "Total"
            ? ["Totals receive a ranking bonus because pace and efficiency are more modelable in WNBA."]
            : ["Consensus spread value versus available supported books."],
      },
    ];
  });
};

const getMarket = (book: Bookmaker, key: OddsMarket["key"]) => book.markets.find((market) => market.key === key);

const americanToImpliedProbability = (odds: number) => {
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
};

const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

const readPassReasonCode = (value: unknown): WnbaPassReasonCode | undefined => {
  const allowed = new Set<WnbaPassReasonCode>([
    "NO_EDGE",
    "NO_MARKET_DATA",
    "STALE_INJURY_DATA",
    "STATS_CONFLICT",
    "MARKET_OVERREACTION",
    "LOW_CONFIDENCE",
    "MISSING_ROTATION_DATA",
    "AI_MARKET_SWITCH",
    "AI_ERROR",
  ]);
  return typeof value === "string" && allowed.has(value as WnbaPassReasonCode) ? (value as WnbaPassReasonCode) : undefined;
};

const normalizeName = (name: string) =>
  normalizeTeamName(name);
