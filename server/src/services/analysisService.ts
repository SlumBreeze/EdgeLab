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
const BET_EV_FLOOR = 2.5;
const NARRATIVE_WATCH_EV_FLOOR = 1.0;
const MIN_CANDIDATE_REFERENCE_BOOKS = 1;
const MIN_BET_REFERENCE_BOOKS = 2;
const MAX_BET_CONSENSUS_DISPERSION_PERCENT = 4;
export const DAILY_SELECTION_CAP = 2;
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
          `No ${game.sport} moneyline, ${game.sport === "MLB" ? "run line" : "spread"}, or team total cleared the 1.0% EV watch floor with an independent reference book at the identical market and line.`,
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

Candidate board across moneyline, ${game.sport === "MLB" ? "run line" : "spread"}, and team total:
${JSON.stringify(candidateBoard)}

Official/free WNBA data pack:
${JSON.stringify(dataPack || null)}

Available odds snapshot for audit only:
${JSON.stringify(odds || null)}

Rules:
- Focus only on ${game.sport}.
- Evaluate only moneyline, ${game.sport === "MLB" ? "run line" : "spread"}, and team-total candidates on the candidate board.
- You may recommend only a candidate that appears in the candidate board. Do not invent a side, market, line, book, or price.
- If the initial best candidate is weak but another listed candidate has stronger price plus hard-data/narrative support, select the stronger listed candidate.
- BET requires positive price value plus hard factual or supported narrative confirmation. LEAN is allowed for thin value with strong narrative/news support.
- Exclude expensive favorites. Any candidate priced shorter than -165 is not playable, regardless of edge percentage.
- ${game.sport === "MLB" ? "Moneylines require confirmed starting pitchers, bullpen status, lineup context, and price value." : "Spreads and moneylines require verified availability for high-usage players, primary creators, rim protectors, or defensive anchors."}
- ${game.sport === "MLB" ? "Run lines require price value plus a plausible margin path from starter gap, bullpen gap, lineup edge, or late-game scoring setup." : "Totals deserve priority only when pace plus offensive/defensive efficiency support the number."}
- ${game.sport === "MLB" ? "Team totals require a confirmed opposing starter plus weather, park, or total-environment support; lineup and bullpen context should also be checked." : "Team totals require verified availability plus pace or offensive/defensive efficiency support. Incorporate game previews, injury reports, rotation notes, rest/travel, and current market context."}
- ${game.sport === "MLB" ? "Incorporate probable starters, lineup news, bullpen usage over the last three days, weather, park factors, umpire tendencies, recent form, matchup splits, and market context as narrative signals." : "Use official/free WNBA data first. Use current search-backed facts only to verify gaps in the data pack and cite the source name in the signal."}
- ${game.sport === "MLB" ? "For 2026, account for the MLB ABS challenge system. Downweight historical home-plate-umpire effects unless current 2026 evidence shows a stable residual effect; never treat pre-ABS umpire tendencies as directly transferable." : "For 2026 expansion teams Toronto and Portland, shrink small-sample team ratings toward league average and rely more heavily on verified current rotation, minutes, and lineup combinations."}
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
  "selectedMarket": "Moneyline" | "Spread" | "Team Total",
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
  const selectedMarket = ["Moneyline", "Spread", "Team Total"].includes(parsed?.selectedMarket)
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
  const failedBetGate =
    recommendation === "BET" &&
    !passesBetEvidenceGate(sport, boardCandidate, dataQuality, narrativeSignals);
  const failedBetReason = failedBetGate
    ? getFailedBetGateReason(sport, boardCandidate, dataQuality, narrativeSignals)
    : null;
  const finalRecommendation = dataQuality === "WEAK" || offBoardSelection || failedBetGate ? "PASS" : recommendation;

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
      : failedBetGate
        ? failedBetReason!.reason
      : String(parsed?.reasoning || "Insufficient verified WNBA data."),
    riskFactors: [
      ...(Array.isArray(parsed?.riskFactors) ? parsed.riskFactors.map(String) : []),
      ...(offBoardSelection ? ["AI off-board selection veto"] : []),
      ...(failedBetGate ? ["Deterministic profitability gate"] : []),
    ],
    createdAt: nowIso(),
    selectedMarket: boardCandidate.market,
    selectedSide: boardCandidate.side,
    selectedBook: boardCandidate.bookTitle,
    selectedOdds: boardCandidate.odds,
    selectedPoint: boardCandidate.point,
    edgePercent: boardCandidate.edgePercent,
    expectedValuePercent: boardCandidate.expectedValuePercent,
    referenceBookCount: boardCandidate.referenceBookCount,
    consensusDispersionPercent: boardCandidate.consensusDispersionPercent,
    candidateBoard,
    narrativeSignals,
    passReasonCode: offBoardSelection
      ? "AI_MARKET_SWITCH"
      : failedBetGate
        ? failedBetReason!.code
        : readPassReasonCode(parsed?.passReasonCode),
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
  marketValue: candidate
    ? `${candidate.expectedValuePercent.toFixed(2)}% EV did not clear final validation.`
    : `No valid ${sport} candidate.`,
  reasoning: reason,
  riskFactors: [passReasonCode],
  createdAt: nowIso(),
  selectedMarket: candidate?.market,
  selectedSide: candidate?.side,
  selectedBook: candidate?.bookTitle,
  selectedOdds: candidate?.odds,
  selectedPoint: candidate?.point,
  edgePercent: candidate?.edgePercent,
  expectedValuePercent: candidate?.expectedValuePercent,
  referenceBookCount: candidate?.referenceBookCount,
  consensusDispersionPercent: candidate?.consensusDispersionPercent,
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
    ...buildTeamTotalCandidates(game, odds),
  ].filter(
    (candidate) =>
      candidate.expectedValuePercent >= NARRATIVE_WATCH_EV_FLOOR &&
      candidate.referenceBookCount >= MIN_CANDIDATE_REFERENCE_BOOKS &&
      isPlayablePrice(candidate.odds),
  );

  return candidates
    .sort((a, b) => b.rankingScore - a.rankingScore)
    .slice(0, 12);
};

const buildMoneylineCandidates = (game: SlateGame, odds: OddsGame): WnbaCandidate[] => {
  const outcomes = odds.bookmakers.flatMap((book) =>
    getMarket(book, "h2h")?.outcomes.map((outcome) => ({ book, outcome })) || [],
  );
  return outcomes.flatMap(({ book, outcome }) => {
    const referenceProbabilities = odds.bookmakers
      .filter((referenceBook) => referenceBook.key !== book.key)
      .flatMap((referenceBook) => {
        const referenceMarket = getMarket(referenceBook, "h2h");
        const side = referenceMarket?.outcomes.find(
          (referenceOutcome) => normalizeName(referenceOutcome.name) === normalizeName(outcome.name),
        );
        const opponent = referenceMarket?.outcomes.find(
          (referenceOutcome) => normalizeName(referenceOutcome.name) !== normalizeName(outcome.name),
        );
        return side && opponent ? [calculateTwoWayNoVigProbability(side.price, opponent.price)] : [];
      });
    if (referenceProbabilities.length < MIN_CANDIDATE_REFERENCE_BOOKS) return [];
    const fairProbability = median(referenceProbabilities);
    const impliedProbability = americanToImpliedProbability(outcome.price);
    const edgePercent = (fairProbability - impliedProbability) * 100;
    const expectedValuePercent = calculateExpectedValuePercent(fairProbability, outcome.price);
    const consensusDispersionPercent = probabilityRange(referenceProbabilities) * 100;
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
        expectedValuePercent,
        referenceBookCount: referenceProbabilities.length,
        consensusDispersionPercent,
        rankingScore: expectedValuePercent - consensusDispersionPercent * 0.5,
        supportNotes: [`Leave-one-book-out no-vig consensus from ${referenceProbabilities.length} reference books.`],
      },
    ];
  });
};

const buildPointMarketCandidates = (game: SlateGame, odds: OddsGame, marketKey: "spreads"): WnbaCandidate[] => {
  const market = "Spread";
  const outcomes = odds.bookmakers.flatMap((book) =>
    getMarket(book, marketKey)?.outcomes.map((outcome) => ({ book, outcome })) || [],
  );
  return outcomes.flatMap(({ book, outcome }) => {
    if (outcome.point === undefined) return [];
    const referenceProbabilities = odds.bookmakers
      .filter((referenceBook) => referenceBook.key !== book.key)
      .flatMap((referenceBook) => {
        const referenceMarket = getMarket(referenceBook, marketKey);
        const side = referenceMarket?.outcomes.find(
          (referenceOutcome) =>
            normalizeName(referenceOutcome.name) === normalizeName(outcome.name) && referenceOutcome.point === outcome.point,
        );
        const opponent = referenceMarket?.outcomes.find(
          (referenceOutcome) =>
            normalizeName(referenceOutcome.name) !== normalizeName(outcome.name) &&
            isOpposingPoint(outcome.point!, referenceOutcome.point),
        );
        return side && opponent ? [calculateTwoWayNoVigProbability(side.price, opponent.price)] : [];
      });
    if (referenceProbabilities.length < MIN_CANDIDATE_REFERENCE_BOOKS) return [];
    const fairProbability = median(referenceProbabilities);
    const impliedProbability = americanToImpliedProbability(outcome.price);
    const edgePercent = (fairProbability - impliedProbability) * 100;
    const expectedValuePercent = calculateExpectedValuePercent(fairProbability, outcome.price);
    const consensusDispersionPercent = probabilityRange(referenceProbabilities) * 100;
    return [
      {
        gameId: game.id,
        candidateId: makeCandidateId(market, outcome.name, outcome.point, book.key),
        market,
        side: outcome.name,
        teamName: outcome.name,
        bookKey: book.key,
        bookTitle: book.title,
        odds: outcome.price,
        point: outcome.point,
        fairProbability,
        impliedProbability,
        edgePercent,
        expectedValuePercent,
        referenceBookCount: referenceProbabilities.length,
        consensusDispersionPercent,
        rankingScore: expectedValuePercent - consensusDispersionPercent * 0.5,
        supportNotes:
          [`Leave-one-book-out no-vig consensus from ${referenceProbabilities.length} reference books at the identical line.`],
      },
    ];
  });
};

const buildTeamTotalCandidates = (game: SlateGame, odds: OddsGame): WnbaCandidate[] => {
  const outcomes = odds.bookmakers.flatMap((book) =>
    getMarket(book, "team_totals")?.outcomes.map((outcome) => ({ book, outcome })) || [],
  );
  return outcomes.flatMap(({ book, outcome }) => {
    const teamName = outcome.description?.trim();
    if (!teamName || outcome.point === undefined) return [];
    const side = outcome.name.toUpperCase();
    const referenceProbabilities = odds.bookmakers
      .filter((referenceBook) => referenceBook.key !== book.key)
      .flatMap((referenceBook) => {
        const sameTeamOutcomes = getMarket(referenceBook, "team_totals")?.outcomes.filter(
          (referenceOutcome) =>
            normalizeName(referenceOutcome.description || "") === normalizeName(teamName) &&
            referenceOutcome.point === outcome.point,
        ) || [];
        const referenceSide = sameTeamOutcomes.find(
          (referenceOutcome) => normalizeName(referenceOutcome.name) === normalizeName(outcome.name),
        );
        const opponent = sameTeamOutcomes.find(
          (referenceOutcome) => normalizeName(referenceOutcome.name) !== normalizeName(outcome.name),
        );
        return referenceSide && opponent
          ? [calculateTwoWayNoVigProbability(referenceSide.price, opponent.price)]
          : [];
      });
    if (referenceProbabilities.length < MIN_CANDIDATE_REFERENCE_BOOKS) return [];
    const fairProbability = median(referenceProbabilities);
    const impliedProbability = americanToImpliedProbability(outcome.price);
    const edgePercent = (fairProbability - impliedProbability) * 100;
    const expectedValuePercent = calculateExpectedValuePercent(fairProbability, outcome.price);
    const consensusDispersionPercent = probabilityRange(referenceProbabilities) * 100;
    return [{
      gameId: game.id,
      candidateId: makeCandidateId("Team Total", `${teamName}-${side}`, outcome.point, book.key),
      market: "Team Total" as const,
      side,
      teamName,
      bookKey: book.key,
      bookTitle: book.title,
      odds: outcome.price,
      point: outcome.point,
      fairProbability,
      impliedProbability,
      edgePercent,
      expectedValuePercent,
      referenceBookCount: referenceProbabilities.length,
      consensusDispersionPercent,
      rankingScore: expectedValuePercent - consensusDispersionPercent * 0.5,
      supportNotes: [
        `Leave-one-book-out no-vig ${teamName} team-total consensus from ${referenceProbabilities.length} reference books at the identical line.`,
      ],
    }];
  });
};

const getMarket = (book: Bookmaker, key: OddsMarket["key"]) => book.markets.find((market) => market.key === key);

const isPlayablePrice = (odds: number) => odds >= MAX_FAVORITE_ODDS;

const americanToImpliedProbability = (odds: number) => {
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
};

const americanToDecimal = (odds: number) =>
  odds > 0 ? 1 + odds / 100 : 1 + 100 / Math.abs(odds);

const calculateTwoWayNoVigProbability = (sideOdds: number, opponentOdds: number) => {
  const side = americanToImpliedProbability(sideOdds);
  const opponent = americanToImpliedProbability(opponentOdds);
  return side / (side + opponent);
};

const calculateExpectedValuePercent = (fairProbability: number, odds: number) =>
  (fairProbability * americanToDecimal(odds) - 1) * 100;

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
};

const probabilityRange = (values: number[]) => Math.max(...values) - Math.min(...values);

const isOpposingPoint = (point: number, opponentPoint: number | undefined) =>
  opponentPoint !== undefined && Math.abs(point + opponentPoint) < 0.0001;

const passesBetEvidenceGate = (
  sport: "WNBA" | "MLB",
  candidate: WnbaCandidate,
  dataQuality: AnalysisResult["dataQuality"],
  signals: WnbaNarrativeSignal[],
) => {
  if (
    dataQuality !== "STRONG" ||
    candidate.expectedValuePercent < BET_EV_FLOOR ||
    candidate.referenceBookCount < MIN_BET_REFERENCE_BOOKS ||
    candidate.consensusDispersionPercent > MAX_BET_CONSENSUS_DISPERSION_PERCENT
  ) return false;
  const supportingHardFacts = signals.filter(
    (signal) => signal.grade === "HARD_FACT" && signal.direction === "supports_candidate" && Boolean(signal.source),
  );
  if (sport === "WNBA") {
    return supportingHardFacts.some((signal) => ["injury", "rotation", "rest_travel", "total_pace", "market"].includes(signal.category));
  }
  const hasStarter = supportingHardFacts.some((signal) => signal.category === "starting_pitcher");
  const hasRunSupport = supportingHardFacts.some((signal) => ["bullpen", "lineup", "matchup"].includes(signal.category));
  const hasTotalEnvironment = supportingHardFacts.some((signal) => ["weather", "park_factor", "total_environment"].includes(signal.category));
  return candidate.market === "Team Total" ? hasStarter && hasTotalEnvironment : hasStarter && hasRunSupport;
};

const getFailedBetGateReason = (
  sport: "WNBA" | "MLB",
  candidate: WnbaCandidate,
  dataQuality: AnalysisResult["dataQuality"],
  signals: WnbaNarrativeSignal[],
): { code: WnbaPassReasonCode; reason: string } => {
  if (candidate.referenceBookCount < MIN_BET_REFERENCE_BOOKS) {
    return {
      code: "INSUFFICIENT_REFERENCES",
      reason: `WATCH only: ${candidate.referenceBookCount} independent reference book does not meet the ${MIN_BET_REFERENCE_BOOKS}-book minimum.`,
    };
  }
  if (candidate.expectedValuePercent < BET_EV_FLOOR) {
    return {
      code: "NO_EDGE",
      reason: `WATCH only: ${candidate.expectedValuePercent.toFixed(2)}% EV is below the ${BET_EV_FLOOR.toFixed(1)}% BET threshold.`,
    };
  }
  if (candidate.consensusDispersionPercent > MAX_BET_CONSENSUS_DISPERSION_PERCENT) {
    return {
      code: "STATS_CONFLICT",
      reason: `PASS: reference-book probabilities disagree by ${candidate.consensusDispersionPercent.toFixed(2)}%, above the ${MAX_BET_CONSENSUS_DISPERSION_PERCENT.toFixed(1)}% consistency limit.`,
    };
  }
  if (dataQuality !== "STRONG") {
    return {
      code: sport === "WNBA" ? "STALE_INJURY_DATA" : "LOW_CONFIDENCE",
      reason: `PASS: ${dataQuality.toLowerCase()} data quality does not meet the STRONG-data requirement.`,
    };
  }
  const supportingHardFacts = signals.filter(
    (signal) => signal.grade === "HARD_FACT" && signal.direction === "supports_candidate" && Boolean(signal.source),
  );
  if (sport === "MLB") {
    const hasStarter = supportingHardFacts.some((signal) => signal.category === "starting_pitcher");
    return {
      code: hasStarter ? "LOW_CONFIDENCE" : "MISSING_STARTING_PITCHER",
      reason: candidate.market === "Team Total"
        ? "PASS: MLB team totals require a confirmed opposing starter plus sourced weather, park, or total-environment support."
        : "PASS: MLB moneyline/run-line plays require a confirmed starter plus sourced lineup, bullpen, or matchup support.",
    };
  }
  return {
    code: "MISSING_ROTATION_DATA",
    reason: "PASS: WNBA plays require sourced hard-fact support from availability, rotation/rest, pace/efficiency, or market evidence.",
  };
};

export const applyDailySelectionCap = (
  analyses: AnalysisResult[],
  cap = DAILY_SELECTION_CAP,
): AnalysisResult[] => {
  const rankedBets = analyses
    .filter((analysis) => analysis.recommendation === "BET" || analysis.qualifiedForDailySelection)
    .sort((a, b) => selectionScore(b) - selectionScore(a));
  const selectedIds = new Set(rankedBets.slice(0, cap).map((analysis) => analysis.gameId));
  const ranks = new Map(rankedBets.map((analysis, index) => [analysis.gameId, index + 1]));
  return analyses.map((analysis) => {
    if (analysis.recommendation !== "BET" && !analysis.qualifiedForDailySelection) {
      return { ...analysis, dailySelectionRank: undefined };
    }
    const dailySelectionRank = ranks.get(analysis.gameId);
    if (selectedIds.has(analysis.gameId)) {
      return {
        ...analysis,
        recommendation: "BET",
        dailySelectionRank,
        qualifiedForDailySelection: true,
        passReasonCode: analysis.passReasonCode === "DAILY_SELECTION_CAP" ? undefined : analysis.passReasonCode,
      };
    }
    return {
      ...analysis,
      recommendation: "LEAN",
      dailySelectionRank,
      qualifiedForDailySelection: true,
      passReasonCode: "DAILY_SELECTION_CAP",
      reasoning: `WATCH only: this candidate ranked ${dailySelectionRank} on today's slate, outside the ${cap}-selection cap. ${analysis.reasoning}`,
      riskFactors: [...analysis.riskFactors, "Daily selection cap"],
    };
  });
};

const selectionScore = (analysis: AnalysisResult) =>
  (analysis.expectedValuePercent || 0) +
  (analysis.referenceBookCount || 0) * 0.25 -
  (analysis.consensusDispersionPercent || 0) * 0.5 +
  analysis.confidence * 0.02;

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
    "INSUFFICIENT_REFERENCES",
    "DAILY_SELECTION_CAP",
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
