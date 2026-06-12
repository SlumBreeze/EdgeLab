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
  WnbaNarrativeSignal,
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
const GEMINI_TIMEOUT_MS = 90000;
const BET_EDGE_FLOOR = 1.5;
const NARRATIVE_WATCH_EDGE_FLOOR = 0.5;
const MAX_FAVORITE_ODDS = -165;
const FALLBACK_ANALYSIS_MODEL = "gemini-2.5-pro";

export class AnalysisService {
  private readonly client: GeminiClient | null;
  private readonly model: string;
  private readonly costConfig: GeminiCostConfig;

  constructor(apiKey?: string, client?: GeminiClient, model = "gemini-3.1-pro-preview", costConfig = DEFAULT_COST_CONFIG) {
    this.client = client || (apiKey ? new GoogleGenAI({ apiKey }) : null);
    this.model = model;
    this.costConfig = costConfig;
  }

  async analyzeGame(dateEt: string, game: SlateGame, odds: OddsGame | null, dataPack?: WnbaDataPack | null): Promise<AnalysisWithUsage> {
    const candidateBoard = buildWnbaCandidateBoard(game, odds);
    const candidate = selectBestWnbaCandidate(game, odds);
    if (!candidate) {
      return {
        result: passAnalysis(
          dateEt,
          game.id,
          game.sport,
          "NO_EDGE",
          `No ${game.sport} moneyline, ${game.sport === "MLB" ? "run line" : "spread"}, or total cleared the narrative-watch value floor against the available book consensus.`,
        ),
        usage: null,
      };
    }

    if (!this.client) {
      return {
        result: fallbackAnalysis(dateEt, game.id, game.sport, "Gemini is not configured."),
        usage: null,
      };
    }

    const prompt = buildWnbaPrompt(game, odds, candidate, candidateBoard, dataPack || null);
    const models = getAnalysisModels(this.model);
    let response: any;
    let usedModel = models[0];
    let lastError: unknown = null;

    for (const model of models) {
      try {
        response = await withTimeout(
          this.client.models.generateContent({
            model,
            contents: prompt,
            config: {
              tools: [{ googleSearch: {} }],
              temperature: 0.15,
            },
          }),
          GEMINI_TIMEOUT_MS,
          model,
        );
        usedModel = model;
        break;
      } catch (error) {
        lastError = error;
        if (model === models[models.length - 1]) {
          throw lastError;
        }
      }
    }

    const text = typeof response.text === "function" ? response.text() : response.text;
    const parsed = parseJson(text);
    const result = normalizeAnalysis(dateEt, game.id, game.sport, parsed, candidate, candidateBoard);
    return {
      result,
      usage: estimateGeminiUsage(usedModel, game.id, response, this.costConfig),
    };
  }
}

const getAnalysisModels = (primaryModel: string) => {
  const models = [primaryModel];
  if (primaryModel !== FALLBACK_ANALYSIS_MODEL) {
    models.push(FALLBACK_ANALYSIS_MODEL);
  }
  return models;
};

export const estimatePlannedGeminiCostUsd = (gameCount: number, costConfig: GeminiCostConfig) =>
  gameCount *
  ((costConfig.fallbackInputTokens / 1_000_000) * costConfig.inputCostPerMillionTokens +
    (costConfig.fallbackOutputTokens / 1_000_000) * costConfig.outputCostPerMillionTokens);

export const buildWnbaPrompt = (
  game: SlateGame,
  odds: OddsGame | null,
  candidate: WnbaCandidate,
  candidateBoard: WnbaCandidate[],
  dataPack: WnbaDataPack | null,
) => `
You are analyzing one ${game.sport} game for EdgeLab.

Game:
${game.awayTeam.name} at ${game.homeTeam.name}
Tip: ${game.date}

Initial best priced candidate:
${JSON.stringify(candidate)}

Candidate board across moneyline, spread, and total:
${JSON.stringify(candidateBoard)}

Official/free WNBA data pack:
${JSON.stringify(dataPack || null)}

Available odds snapshot for audit only:
${JSON.stringify(odds || null)}

Rules:
- Focus only on ${game.sport}.
- Evaluate moneyline, ${game.sport === "MLB" ? "run line" : "spread"}, and total candidates on the candidate board.
- You may recommend only a candidate that appears in the candidate board. Do not invent a side, market, line, book, or price.
- If the initial best candidate is weak but another listed candidate has stronger price plus hard-data/narrative support, select the stronger listed candidate.
- BET requires positive price value plus hard factual or supported narrative confirmation. LEAN is allowed for thin value with strong narrative/news support.
- Exclude expensive favorites. Any candidate priced shorter than -165 is not playable, regardless of edge percentage.
- ${game.sport === "MLB" ? "Moneylines require confirmed starting pitchers, bullpen status, lineup context, and price value." : "Spreads and moneylines require verified availability for high-usage players, primary creators, rim protectors, or defensive anchors."}
- ${game.sport === "MLB" ? "Run lines require price value plus a plausible margin path from starter gap, bullpen gap, lineup edge, or late-game scoring setup." : "Totals deserve priority only when pace plus offensive/defensive efficiency support the number."}
- ${game.sport === "MLB" ? "Totals require pitcher profile, bullpen fatigue, weather/park context, lineup quality, and market number support." : "Incorporate game previews, AP/ESPN/CBS/WNBA/team news, injury reports, rotation notes, coach comments, rematch context, rest/travel, and recent form as narrative signals."}
- ${game.sport === "MLB" ? "Incorporate probable starters, lineup news, bullpen usage over the last three days, weather, park factors, umpire tendencies, recent form, matchup splits, and market context as narrative signals." : "Use official/free WNBA data first. Use current search-backed facts only to verify gaps in the data pack and cite the source name in the signal."}
- Grade every narrative signal as HARD_FACT, SUPPORTED_ANGLE, or SOFT_NARRATIVE.
- Soft narrative can support a LEAN or watchlist note, but cannot rescue a negative-value or unsupported wager.
- Treat weak ${game.sport === "MLB" ? "starting pitcher, lineup, bullpen, weather, park, total environment, or market" : "injury, rotation, efficiency, pace, or market"} support as a reason to PASS.
- Do not invent player availability, team stats, or line movement.
- Return JSON only.

Schema:
{
  "recommendation": "BET" | "LEAN" | "PASS",
  "confidence": 0-100,
  "dataQuality": "STRONG" | "PARTIAL" | "WEAK",
  "selectedCandidateId": "must match a listed candidateId exactly",
  "selectedMarket": "Moneyline" | "Spread" | "Total",
  "selectedSide": "must match a listed candidate side exactly",
  "selectedBook": "must match a listed candidate bookTitle exactly",
  "selectedPoint": number | null,
  "marketValue": "short factual statement",
  "reasoning": "two sentences maximum",
  "narrativeSignals": [
    {
      "category": ${game.sport === "MLB"
        ? `"starting_pitcher" | "bullpen" | "lineup" | "weather" | "park_factor" | "umpire" | "recent_form" | "matchup" | "market" | "total_environment" | "other"`
        : `"injury" | "rotation" | "rest_travel" | "rematch" | "recent_form" | "matchup" | "market" | "total_pace" | "other"`},
      "grade": "HARD_FACT" | "SUPPORTED_ANGLE" | "SOFT_NARRATIVE",
      "direction": "supports_candidate" | "opposes_candidate" | "neutral",
      "summary": "short source-backed signal",
      "source": "source name or URL"
    }
  ],
  "riskFactors": ["short factual risks"],
  "passReasonCode": "NO_EDGE" | "STALE_INJURY_DATA" | "STATS_CONFLICT" | "MARKET_OVERREACTION" | "LOW_CONFIDENCE" | "MISSING_ROTATION_DATA" | "MISSING_STARTING_PITCHER" | "WEATHER_CONFLICT"
}
`;

const normalizeAnalysis = (
  dateEt: string,
  gameId: string,
  sport: "WNBA" | "MLB",
  parsed: any,
  candidate: WnbaCandidate,
  candidateBoard: WnbaCandidate[],
): AnalysisResult => {
  const recommendation = ["BET", "LEAN", "PASS"].includes(parsed?.recommendation) ? parsed.recommendation : "PASS";
  const dataQuality = ["STRONG", "PARTIAL", "WEAK"].includes(parsed?.dataQuality) ? parsed.dataQuality : "WEAK";
  const confidence = Number.isFinite(parsed?.confidence) ? Math.max(0, Math.min(100, Math.round(parsed.confidence))) : 0;
  const selectedMarket = ["Moneyline", "Spread", "Total"].includes(parsed?.selectedMarket)
    ? parsed.selectedMarket
    : candidate.market;
  const selectedSide = String(parsed?.selectedSide || candidate.side);
  const selectedBook = String(parsed?.selectedBook || candidate.bookTitle);
  const selectedPoint = Number.isFinite(parsed?.selectedPoint) ? Number(parsed.selectedPoint) : candidate.point;
  const selectedCandidateId = String(parsed?.selectedCandidateId || "");
  const matchedCandidate =
    candidateBoard.find((boardCandidate) => boardCandidate.candidateId === selectedCandidateId) ||
    findCandidateOnBoard(candidateBoard, selectedMarket, selectedSide, selectedBook, selectedPoint);
  const boardCandidate = matchedCandidate || candidate;
  const offBoardSelection = !matchedCandidate;
  const narrativeSignals = readNarrativeSignals(parsed?.narrativeSignals);
  const finalRecommendation = dataQuality === "WEAK" || offBoardSelection ? "PASS" : recommendation;

  return {
    gameId,
    dateEt,
    sport,
    recommendation: finalRecommendation,
    confidence,
    dataQuality,
    marketValue: String(parsed?.marketValue || `${boardCandidate.edgePercent.toFixed(2)}% consensus edge on ${boardCandidate.bookTitle}.`),
    reasoning: offBoardSelection
      ? `AI attempted to evaluate ${selectedSide} ${selectedMarket} at ${selectedBook}, which was not on the priced candidate board.`
      : String(parsed?.reasoning || "Insufficient verified WNBA data."),
    riskFactors: [
      ...(Array.isArray(parsed?.riskFactors) ? parsed.riskFactors.map(String) : []),
      ...(offBoardSelection ? ["AI off-board selection veto"] : []),
    ],
    createdAt: nowIso(),
    selectedMarket: boardCandidate.market,
    selectedSide: boardCandidate.side,
    selectedBook: boardCandidate.bookTitle,
    selectedOdds: boardCandidate.odds,
    selectedPoint: boardCandidate.point,
    edgePercent: boardCandidate.edgePercent,
    candidateBoard,
    narrativeSignals,
    passReasonCode: offBoardSelection ? "AI_MARKET_SWITCH" : readPassReasonCode(parsed?.passReasonCode),
  };
};

const fallbackAnalysis = (dateEt: string, gameId: string, sport: "WNBA" | "MLB", reason: string): AnalysisResult => ({
  gameId,
  dateEt,
  sport,
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
  sport: "WNBA" | "MLB",
  passReasonCode: WnbaPassReasonCode,
  reason: string,
  candidate?: WnbaCandidate,
): AnalysisResult => ({
  gameId,
  dateEt,
  sport,
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
  candidateBoard: candidate ? [candidate] : [],
  narrativeSignals: [],
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

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, label = "operation"): Promise<T> => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(`Gemini model ${label} timed out after ${timeoutMs}ms.`)), timeoutMs);
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
  const candidates = buildWnbaCandidateBoard(game, odds);

  return candidates.sort((a, b) => b.rankingScore - a.rankingScore)[0] || null;
};

export const buildWnbaCandidateBoard = (game: SlateGame, odds: OddsGame | null): WnbaCandidate[] => {
  if (!odds || odds.bookmakers.length < 2) return [];
  const candidates = [
    ...buildMoneylineCandidates(game, odds),
    ...buildPointMarketCandidates(game, odds, "spreads"),
    ...buildPointMarketCandidates(game, odds, "totals"),
  ].filter((candidate) => candidate.edgePercent >= NARRATIVE_WATCH_EDGE_FLOOR && isPlayablePrice(candidate.odds));

  return candidates
    .sort((a, b) => b.rankingScore - a.rankingScore)
    .slice(0, 12);
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
        candidateId: makeCandidateId("Moneyline", outcome.name, undefined, book.key),
        market: "Moneyline",
        side: outcome.name,
        teamName: outcome.name,
        bookKey: book.key,
        bookTitle: book.title,
        odds: outcome.price,
        fairProbability,
        impliedProbability,
        edgePercent,
        rankingScore: edgePercent + (edgePercent >= BET_EDGE_FLOOR ? 0.25 : 0),
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
        candidateId: makeCandidateId(market, market === "Total" ? outcome.name.toUpperCase() : outcome.name, outcome.point, book.key),
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
        rankingScore: edgePercent + (market === "Total" ? 0.35 : 0) + (edgePercent >= BET_EDGE_FLOOR ? 0.25 : 0),
        supportNotes:
          market === "Total"
            ? ["Totals receive a ranking bonus because pace and efficiency are more modelable in WNBA."]
            : ["Consensus spread value versus available supported books."],
      },
    ];
  });
};

const getMarket = (book: Bookmaker, key: OddsMarket["key"]) => book.markets.find((market) => market.key === key);

const isPlayablePrice = (odds: number) => odds >= MAX_FAVORITE_ODDS;

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
    "MISSING_STARTING_PITCHER",
    "WEATHER_CONFLICT",
    "AI_MARKET_SWITCH",
    "AI_ERROR",
  ]);
  return typeof value === "string" && allowed.has(value as WnbaPassReasonCode) ? (value as WnbaPassReasonCode) : undefined;
};

const findCandidateOnBoard = (
  candidates: WnbaCandidate[],
  market: WnbaCandidate["market"],
  side: string,
  bookTitle: string,
  point?: number,
) =>
  candidates.find(
    (candidate) =>
      candidate.market === market &&
      normalizeName(candidate.side) === normalizeName(side) &&
      normalizeName(candidate.bookTitle) === normalizeName(bookTitle) &&
      (candidate.point ?? null) === (point ?? null),
  );

const readNarrativeSignals = (value: unknown): WnbaNarrativeSignal[] => {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 6).flatMap((signal) => {
    if (!signal || typeof signal !== "object") return [];
    const category = readSignalCategory((signal as any).category);
    const grade = readSignalGrade((signal as any).grade);
    const direction = readSignalDirection((signal as any).direction);
    const summary = String((signal as any).summary || "").trim();
    if (!summary) return [];
    return [
      {
        category,
        grade,
        direction,
        summary,
        source: String((signal as any).source || "").trim() || undefined,
      },
    ];
  });
};

const readSignalCategory = (value: unknown): WnbaNarrativeSignal["category"] => {
  const allowed = new Set<WnbaNarrativeSignal["category"]>([
    "injury",
    "rotation",
    "rest_travel",
    "rematch",
    "recent_form",
    "matchup",
    "market",
    "total_pace",
    "starting_pitcher",
    "bullpen",
    "lineup",
    "weather",
    "park_factor",
    "umpire",
    "total_environment",
    "other",
  ]);
  return typeof value === "string" && allowed.has(value as WnbaNarrativeSignal["category"])
    ? (value as WnbaNarrativeSignal["category"])
    : "other";
};

const readSignalGrade = (value: unknown): WnbaNarrativeSignal["grade"] => {
  const allowed = new Set<WnbaNarrativeSignal["grade"]>(["HARD_FACT", "SUPPORTED_ANGLE", "SOFT_NARRATIVE"]);
  return typeof value === "string" && allowed.has(value as WnbaNarrativeSignal["grade"])
    ? (value as WnbaNarrativeSignal["grade"])
    : "SOFT_NARRATIVE";
};

const readSignalDirection = (value: unknown): WnbaNarrativeSignal["direction"] => {
  const allowed = new Set<WnbaNarrativeSignal["direction"]>(["supports_candidate", "opposes_candidate", "neutral"]);
  return typeof value === "string" && allowed.has(value as WnbaNarrativeSignal["direction"])
    ? (value as WnbaNarrativeSignal["direction"])
    : "neutral";
};

const makeCandidateId = (market: string, side: string, point: number | undefined, bookKey: string) =>
  [market, side, point ?? "na", bookKey].map((part) => String(part).toLowerCase().replace(/[^a-z0-9.-]+/g, "-")).join(":");

const normalizeName = (name: string) =>
  normalizeTeamName(name);
