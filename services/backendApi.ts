import {
  isAuthRequired,
  isSupabaseConfigured,
  supabase,
} from "./supabaseClient";

export type BackendSport = "WNBA" | "MLB";

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
  sport: BackendSport;
  date: string;
  status: string;
  homeTeam: SlateTeam;
  awayTeam: SlateTeam;
  venue?: string;
};

export type OddsMarket = {
  key: "h2h" | "spreads" | "totals" | "team_totals";
  outcomes: Array<{
    name: string;
    description?: string;
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
  sport?: BackendSport;
  recommendation: "BET" | "LEAN" | "PASS";
  confidence: number;
  dataQuality: "STRONG" | "PARTIAL" | "WEAK";
  marketValue: string;
  reasoning: string;
  riskFactors: string[];
  createdAt: string;
  selectedMarket?: "Moneyline" | "Spread" | "Team Total";
  selectedSide?: string;
  selectedBook?: string;
  selectedOdds?: number;
  selectedPoint?: number;
  edgePercent?: number;
  expectedValuePercent?: number;
  referenceBookCount?: number;
  consensusDispersionPercent?: number;
  dailySelectionRank?: number;
  qualifiedForDailySelection?: boolean;
  closingOdds?: number;
  closingPoint?: number;
  closingRecordedAt?: string;
  clvPercent?: number;
  beatClose?: boolean;
  candidateBoard?: WnbaCandidate[];
  narrativeSignals?: WnbaNarrativeSignal[];
  passReasonCode?: string;
};

export type WnbaCandidate = {
  gameId: string;
  candidateId: string;
  market: "Moneyline" | "Spread" | "Team Total";
  side: string;
  teamName?: string;
  bookKey: string;
  bookTitle: string;
  odds: number;
  point?: number;
  fairProbability: number;
  impliedProbability: number;
  edgePercent: number;
  expectedValuePercent: number;
  referenceBookCount: number;
  consensusDispersionPercent: number;
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
    | "starting_pitcher"
    | "bullpen"
    | "lineup"
    | "weather"
    | "park_factor"
    | "umpire"
    | "total_environment"
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

export type ResetAnalysisResponse = {
  dateEt: string;
  reset: {
    analyses: number;
    analyzeAllRuns: number;
  };
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
  sport?: BackendSport;
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
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }

  if (isSupabaseConfigured) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers.set("Authorization", `Bearer ${session.access_token}`);
    } else if (isAuthRequired) {
      throw new ApiError("Sign in to access EdgeLab.", 401, "AUTH_REQUIRED");
    }
  } else if (isAuthRequired) {
    throw new ApiError(
      "Private access is enabled, but Supabase Auth is not configured.",
      503,
      "AUTH_NOT_CONFIGURED",
    );
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
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
  getSlate: (sport: BackendSport) => requestJson<SlateResponse>(`/api/slate/${sport.toLowerCase()}?refresh=false`),
  getOddsCache: (sport: BackendSport) => requestJson<OddsResponse>(`/api/odds/${sport.toLowerCase()}?refresh=false`),
  refreshOdds: (sport: BackendSport, overrideReason?: string) => {
    const params = new URLSearchParams({ refresh: "true" });
    if (typeof overrideReason === "string" && overrideReason.trim()) {
      params.set("overrideReason", overrideReason.trim());
    }
    return requestJson<OddsResponse>(`/api/odds/${sport.toLowerCase()}?${params.toString()}`);
  },
  analyzeAll: (sport: BackendSport = "WNBA", overrideReason?: string) =>
    requestJson<AnalyzeAllResponse>(`/api/analyze/${sport.toLowerCase()}/all`, {
      method: "POST",
      body: JSON.stringify(typeof overrideReason === "string" && overrideReason.trim() ? { overrideReason: overrideReason.trim() } : {}),
    }),
  analyzeGame: (sport: BackendSport, gameId: string, overrideReason?: string) =>
    requestJson<AnalysisResult>(`/api/analyze/${sport.toLowerCase()}/${encodeURIComponent(gameId)}`, {
      method: "POST",
      body: JSON.stringify(typeof overrideReason === "string" && overrideReason.trim() ? { overrideReason: overrideReason.trim() } : {}),
    }),
  recordClosingLine: (sport: BackendSport, gameId: string) =>
    requestJson<AnalysisResult>(`/api/analysis/${sport.toLowerCase()}/${encodeURIComponent(gameId)}/close`, {
      method: "POST",
    }),
  getAnalysis: (sport: BackendSport) => requestJson<AnalysisCacheResponse>(`/api/analysis/${sport.toLowerCase()}`),
  resetAnalysis: (sport: BackendSport) =>
    requestJson<ResetAnalysisResponse>(`/api/analysis/${sport.toLowerCase()}/today`, {
      method: "DELETE",
    }),
  getQuota: (sport: BackendSport = "WNBA") => requestJson<QuotaResponse>(`/api/quota?sport=${sport}`),
  getWnbaSlate: () => backendApi.getSlate("WNBA"),
  getWnbaOddsCache: () => backendApi.getOddsCache("WNBA"),
  refreshWnbaOdds: (overrideReason?: string) => backendApi.refreshOdds("WNBA", overrideReason),
  getWnbaAnalysis: () => backendApi.getAnalysis("WNBA"),
  resetWnbaAnalysis: () => backendApi.resetAnalysis("WNBA"),
};
