export type Sport = "WNBA";

export type Session = {
  dateEt: string;
  budgetCents: number | null;
  createdAt: string;
  updatedAt: string;
};

export type Team = {
  name: string;
  abbreviation?: string;
  logo?: string;
  record?: string;
};

export type SlateGame = {
  id: string;
  sport: Sport;
  date: string;
  status: string;
  homeTeam: Team;
  awayTeam: Team;
  venue?: string;
};

export type OddsMarket = {
  key: "h2h" | "spreads" | "totals";
  outcomes: Array<{
    name: string;
    price: number;
    point?: number;
  }>;
};

export type Bookmaker = {
  key: string;
  title: string;
  lastUpdate?: string;
  markets: OddsMarket[];
};

export type OddsGame = {
  id: string;
  sport_key: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: Bookmaker[];
};

export type AnalysisResult = {
  gameId: string;
  dateEt: string;
  recommendation: "BET" | "LEAN" | "PASS";
  confidence: number;
  dataQuality: "STRONG" | "PARTIAL" | "WEAK";
  marketValue: string;
  reasoning: string;
  riskFactors: string[];
  createdAt: string;
  selectedMarket?: "Moneyline" | "Spread" | "Total";
  selectedSide?: string;
  selectedBook?: string;
  selectedOdds?: number;
  selectedPoint?: number;
  edgePercent?: number;
  candidateBoard?: WnbaCandidate[];
  narrativeSignals?: WnbaNarrativeSignal[];
  passReasonCode?: WnbaPassReasonCode;
};

export type ApiUsageKind = "odds" | "gemini";

export type OddsApiUsage = {
  provider: "odds-api";
  endpoint: string;
  requestsUsed: number | null;
  requestsRemaining: number | null;
  requestsLast: number | null;
  fetchedAt: string;
};

export type GeminiUsage = {
  model: string;
  gameId: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  usedFallbackTokens: boolean;
};

export type AnalysisWithUsage = {
  result: AnalysisResult;
  usage: GeminiUsage | null;
};

export type WnbaPassReasonCode =
  | "NO_EDGE"
  | "NO_MARKET_DATA"
  | "STALE_INJURY_DATA"
  | "STATS_CONFLICT"
  | "MARKET_OVERREACTION"
  | "LOW_CONFIDENCE"
  | "MISSING_ROTATION_DATA"
  | "AI_MARKET_SWITCH"
  | "AI_ERROR";

export type WnbaTeamAdvancedStats = {
  teamName: string;
  offensiveRating: number | null;
  defensiveRating: number | null;
  netRating: number | null;
  pace: number | null;
  reboundPct: number | null;
  turnoverPct: number | null;
  freeThrowRate: number | null;
  threePointRate: number | null;
};

export type WnbaDataPack = {
  dateEt: string;
  fetchedAt: string;
  sources: Array<{
    name: string;
    url: string;
    fetchedAt: string;
    status: "ok" | "error";
    note?: string;
  }>;
  teams: Record<string, WnbaTeamAdvancedStats>;
  availabilityNotes: string[];
  freshness: "fresh" | "partial" | "missing";
};

export type WnbaCandidate = {
  gameId: string;
  candidateId: string;
  market: "Moneyline" | "Spread" | "Total";
  side: string;
  teamName?: string;
  bookKey: string;
  bookTitle: string;
  odds: number;
  point?: number;
  fairProbability: number;
  impliedProbability: number;
  edgePercent: number;
  rankingScore: number;
  supportNotes: string[];
};

export type WnbaNarrativeSignal = {
  category:
    | "injury"
    | "rotation"
    | "rest_travel"
    | "rematch"
    | "recent_form"
    | "matchup"
    | "market"
    | "total_pace"
    | "other";
  grade: "HARD_FACT" | "SUPPORTED_ANGLE" | "SOFT_NARRATIVE";
  direction: "supports_candidate" | "opposes_candidate" | "neutral";
  summary: string;
  source?: string;
};
