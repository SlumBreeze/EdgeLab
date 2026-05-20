const API_BASE = (import.meta.env.VITE_BACKEND_URL || "").replace(/\/$/, "");

export type SessionResponse = {
  dateEt: string;
  budgetCents: number | null;
  createdAt: string;
  updatedAt: string;
  needsBudget: boolean;
};

export type SlateTeam = {
  name: string;
  abbreviation?: string;
  logo?: string;
  record?: string;
};

export type SlateGame = {
  id: string;
  sport: "WNBA";
  date: string;
  status: string;
  homeTeam: SlateTeam;
  awayTeam: SlateTeam;
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
  passReasonCode?: string;
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

export type SlateResponse = {
  dateEt: string;
  fetchedAt?: string;
  source: "cache" | "espn";
  games: SlateGame[];
};

export type OddsResponse = {
  dateEt: string;
  fetchedAt?: string;
  source: "cache" | "odds-api";
  games: OddsGame[];
  credits?: OddsCredits | null;
};

export type AnalyzeAllResponse = {
  dateEt: string;
  count: number;
  results: AnalysisResult[];
  weeklyTotals?: WeeklyTotals;
};

export type AnalysisCacheResponse = {
  dateEt: string;
  count: number;
  results: AnalysisResult[];
};

export type OddsCredits = {
  provider: "odds-api";
  endpoint: string;
  requestsUsed: number | null;
  requestsRemaining: number | null;
  requestsLast: number | null;
  fetchedAt: string;
};

export type GeminiUsageTotals = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
};

export type WeeklyTotals = {
  weekEt: string;
  providers: {
    "odds-api": {
      calls: number;
      requestsUsed: number | null;
      requestsRemaining: number | null;
      requestsLast: number;
    };
    gemini: GeminiUsageTotals;
  };
};

export type QuotaResponse = {
  dateEt: string;
  weekEt: string;
  oddsLastFetchAt: string | null;
  usage: Record<string, { count: number; lastUsedAt: string | null }>;
  oddsCredits: OddsCredits | null;
  gemini: {
    today: GeminiUsageTotals;
    week: GeminiUsageTotals;
    warningThresholdUsd: number;
    hardStopUsd: number;
    isWarning: boolean;
    isHardStopped: boolean;
  };
  weeklyTotals: WeeklyTotals;
  quotaPolicy: {
    oddsRefreshRequired: boolean;
    backgroundPolling: boolean;
    maxOddsRefreshesPerEtDay: number;
    maxAnalyzeAllPerSlate: number;
    oddsRefreshesToday: number;
    analyzeAllRunsToday: number;
    analyzeAllLastRun: { gameCount: number; createdAt: string } | null;
  };
  analysisModel?: string;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

const requestJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    ...init,
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(data?.message || data?.error || `Request failed with ${response.status}`, response.status, data?.error);
  }

  return data as T;
};

export const backendApi = {
  getTodaySession: () => requestJson<SessionResponse>("/api/session/today"),
  setBudget: (budgetCents: number) =>
    requestJson<SessionResponse>("/api/session/budget", {
      method: "PUT",
      body: JSON.stringify({ budgetCents }),
    }),
  getWnbaSlate: () => requestJson<SlateResponse>("/api/slate/wnba?refresh=false"),
  getWnbaOddsCache: () => requestJson<OddsResponse>("/api/odds/wnba?refresh=false"),
  refreshWnbaOdds: (overrideReason?: string) => {
    const params = new URLSearchParams({ refresh: "true" });
    if (typeof overrideReason === "string" && overrideReason.trim()) {
      params.set("overrideReason", overrideReason.trim());
    }
    return requestJson<OddsResponse>(`/api/odds/wnba?${params.toString()}`);
  },
  analyzeAll: (overrideReason?: string) =>
    requestJson<AnalyzeAllResponse>("/api/analyze/all", {
      method: "POST",
      body: JSON.stringify(typeof overrideReason === "string" && overrideReason.trim() ? { overrideReason: overrideReason.trim() } : {}),
    }),
  getWnbaAnalysis: () => requestJson<AnalysisCacheResponse>("/api/analysis/wnba"),
  getQuota: () => requestJson<QuotaResponse>("/api/quota"),
};
