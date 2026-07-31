import Database from "better-sqlite3";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { migrate, Store } from "../src/storage/database.js";
import { filterSupportedBooks } from "../src/services/oddsService.js";
import {
  applyDailySelectionCap,
  buildWnbaCandidateBoard,
  selectBestWnbaCandidate,
} from "../src/services/analysisService.js";
import { AnalysisService } from "../src/services/analysisService.js";
import type { AnalysisResult, OddsGame, SlateGame } from "../src/types.js";

const config = {
  port: 0,
  sqlitePath: ":memory:",
  oddsApiKey: "test-odds",
  geminiApiKey: "test-gemini",
  geminiModel: "gemini-3.1-pro-preview",
  allowedOrigin: "http://localhost:5173",
  geminiInputCostPerMillionTokens: 2,
  geminiOutputCostPerMillionTokens: 12,
  geminiFallbackInputTokens: 6000,
  geminiFallbackOutputTokens: 1200,
  geminiWeeklyWarningUsd: 5,
  geminiWeeklyHardStopUsd: 8,
  authRequired: false,
  supabaseUrl: undefined,
  supabasePublishableKey: undefined,
  allowedUserIds: [],
};

const slateGame: SlateGame = {
  id: "espn-1",
  sport: "WNBA",
  date: "2026-05-14T23:00:00Z",
  status: "Scheduled",
  awayTeam: { name: "New York Liberty" },
  homeTeam: { name: "Las Vegas Aces" },
};

const oddsGame: OddsGame = {
  id: "odds-1",
  sport_key: "basketball_wnba",
  commence_time: "2026-05-14T23:00:00Z",
  away_team: "New York Liberty",
  home_team: "Las Vegas Aces",
  bookmakers: [
    { key: "draftkings", title: "DraftKings", markets: [] },
    { key: "pinnacle", title: "Pinnacle", markets: [] },
  ],
};

const mlbSlateGame: SlateGame = {
  id: "mlb-espn-1",
  sport: "MLB",
  date: "2026-06-12T23:05:00Z",
  status: "Scheduled",
  awayTeam: { name: "New York Yankees" },
  homeTeam: { name: "Boston Red Sox" },
};

const mlbOddsGame: OddsGame = {
  id: "mlb-odds-1",
  sport_key: "baseball_mlb",
  commence_time: "2026-06-12T23:05:00Z",
  away_team: "New York Yankees",
  home_team: "Boston Red Sox",
  bookmakers: [
    { key: "draftkings", title: "DraftKings", markets: [] },
    { key: "fanduel", title: "FanDuel", markets: [] },
  ],
};

const oddsFetchResult = {
  games: [filterSupportedBooks(oddsGame)],
  usage: {
    provider: "odds-api" as const,
    endpoint: "/v4/sports/basketball_wnba/odds",
    requestsUsed: 7,
    requestsRemaining: 493,
    requestsLast: 1,
    fetchedAt: "2026-05-14T12:00:00.000Z",
  },
};

const mlbOddsFetchResult = {
  games: [filterSupportedBooks(mlbOddsGame)],
  usage: {
    provider: "odds-api" as const,
    endpoint: "/v4/sports/baseball_mlb/odds",
    requestsUsed: 9,
    requestsRemaining: 491,
    requestsLast: 1,
    fetchedAt: "2026-06-12T12:00:00.000Z",
  },
};

const makeStore = () => {
  const db = new Database(":memory:");
  migrate(db);
  return new Store(db);
};

const makeWnbaData = () =>
  ({
    buildDataPack: vi.fn().mockResolvedValue({
      dateEt: "2026-05-14",
      fetchedAt: "2026-05-14T12:00:00.000Z",
      sources: [],
      teams: {},
      availabilityNotes: ["Test availability pack."],
      freshness: "partial",
    }),
  }) as any;

describe("private API access", () => {
  const privateConfig = {
    ...config,
    authRequired: true,
    supabaseUrl: "https://project.supabase.co",
    supabasePublishableKey: "sb_publishable_test",
    allowedUserIds: ["authorized-user-id"],
  };

  it("rejects missing and invalid bearer sessions", async () => {
    const verifyAccessToken = vi.fn().mockResolvedValue(null);
    const app = createApp({
      store: makeStore(),
      config: privateConfig,
      auth: { verifyAccessToken },
      getDateEt: () => "2026-05-14",
    });

    await request(app).get("/api/session/today").expect(401);
    expect(verifyAccessToken).not.toHaveBeenCalled();

    const invalid = await request(app)
      .get("/api/session/today")
      .set("Authorization", "Bearer invalid-session")
      .expect(401);
    expect(invalid.body.error).toBe("INVALID_SESSION");
    expect(verifyAccessToken).toHaveBeenCalledWith("invalid-session");
  });

  it("allows only configured Supabase user IDs", async () => {
    const verifyAccessToken = vi
      .fn()
      .mockResolvedValueOnce({ id: "different-user-id" })
      .mockResolvedValueOnce({ id: "authorized-user-id" });
    const app = createApp({
      store: makeStore(),
      config: privateConfig,
      auth: { verifyAccessToken },
      getDateEt: () => "2026-05-14",
    });

    const denied = await request(app)
      .get("/api/session/today")
      .set("Authorization", "Bearer valid-but-not-allowed")
      .expect(403);
    expect(denied.body.error).toBe("ACCESS_DENIED");

    const allowed = await request(app)
      .get("/api/session/today")
      .set("Authorization", "Bearer valid-and-allowed")
      .expect(200);
    expect(allowed.body.dateEt).toBe("2026-05-14");
  });

  it("fails closed when required auth is incomplete or unavailable", async () => {
    const unconfigured = createApp({
      store: makeStore(),
      config: {
        ...privateConfig,
        supabaseUrl: undefined,
        supabasePublishableKey: undefined,
        allowedUserIds: [],
      },
      auth: null,
    });
    const missingConfig = await request(unconfigured)
      .get("/api/session/today")
      .set("Authorization", "Bearer any-token")
      .expect(503);
    expect(missingConfig.body.error).toBe("AUTH_NOT_CONFIGURED");

    const unavailable = createApp({
      store: makeStore(),
      config: privateConfig,
      auth: {
        verifyAccessToken: vi.fn().mockRejectedValue(new Error("Auth provider unavailable")),
      },
    });
    const upstreamFailure = await request(unavailable)
      .get("/api/session/today")
      .set("Authorization", "Bearer any-token")
      .expect(503);
    expect(upstreamFailure.body.error).toBe("AUTH_UNAVAILABLE");
  });

  it("allows only configured browser origins", async () => {
    const app = createApp({ store: makeStore(), config });

    const allowed = await request(app)
      .options("/api/session/today")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "GET")
      .expect(204);
    expect(allowed.headers["access-control-allow-origin"]).toBe("http://localhost:5173");

    const denied = await request(app)
      .get("/healthz")
      .set("Origin", "https://untrusted.example")
      .expect(403);
    expect(denied.body.error).toBe("CORS_ORIGIN_DENIED");
  });
});

describe("session reset", () => {
  it("prompts once per Eastern date and preserves that day's budget", async () => {
    const store = makeStore();
    let dateEt = "2026-05-14";
    const app = createApp({ store, config, getDateEt: () => dateEt });

    let response = await request(app).get("/api/session/today");
    expect(response.body.needsBudget).toBe(true);

    await request(app).put("/api/session/budget").send({ budgetCents: 12500 }).expect(200);
    response = await request(app).get("/api/session/today");
    expect(response.body).toMatchObject({ dateEt: "2026-05-14", budgetCents: 12500, needsBudget: false });

    dateEt = "2026-05-15";
    response = await request(app).get("/api/session/today");
    expect(response.body).toMatchObject({ dateEt: "2026-05-15", budgetCents: null, needsBudget: true });
  });
});

describe("odds cache and quota protection", () => {
  it("blocks odds API spend unless refresh=true, then serves cache without another fetch", async () => {
    const store = makeStore();
    const fetchWnbaOdds = vi.fn().mockResolvedValue(oddsFetchResult);
    const app = createApp({
      store,
      config,
      getDateEt: () => "2026-05-14",
      odds: { fetchWnbaOdds } as any,
    });

    await request(app).get("/api/odds/wnba").expect(409);
    expect(fetchWnbaOdds).not.toHaveBeenCalled();

    let response = await request(app).get("/api/odds/wnba?refresh=true").expect(200);
    expect(response.body.source).toBe("odds-api");
    expect(fetchWnbaOdds).toHaveBeenCalledTimes(1);

    response = await request(app).get("/api/odds/wnba").expect(200);
    expect(response.body.source).toBe("cache");
    expect(fetchWnbaOdds).toHaveBeenCalledTimes(1);

    response = await request(app).get("/api/quota").expect(200);
    expect(response.body.usage.odds.count).toBe(1);
    expect(response.body.oddsCredits).toMatchObject({ requestsUsed: 7, requestsRemaining: 493, requestsLast: 1 });
    expect(response.body.quotaPolicy.backgroundPolling).toBe(false);
  });

  it("supports MLB odds cache without spending quota in the background", async () => {
    const store = makeStore();
    const fetchMlbOdds = vi.fn().mockResolvedValue(mlbOddsFetchResult);
    const app = createApp({
      store,
      config,
      getDateEt: () => "2026-06-12",
      odds: { fetchMlbOdds } as any,
    });

    await request(app).get("/api/odds/mlb").expect(409);
    expect(fetchMlbOdds).not.toHaveBeenCalled();

    const refresh = await request(app).get("/api/odds/mlb?refresh=true").expect(200);
    expect(refresh.body.source).toBe("odds-api");
    expect(fetchMlbOdds).toHaveBeenCalledTimes(1);

    const quota = await request(app).get("/api/quota?sport=MLB").expect(200);
    expect(quota.body.quotaPolicy.oddsRefreshesToday).toBe(1);
    expect(quota.body.oddsCredits).toMatchObject({ endpoint: "/v4/sports/baseball_mlb/odds" });
  });

  it("requires an override reason before a second Eastern-date odds refresh", async () => {
    const store = makeStore();
    const fetchWnbaOdds = vi.fn().mockResolvedValue(oddsFetchResult);
    const app = createApp({
      store,
      config,
      getDateEt: () => "2026-05-14",
      odds: { fetchWnbaOdds } as any,
    });

    await request(app).get("/api/odds/wnba?refresh=true").expect(200);
    await request(app).get("/api/odds/wnba?refresh=true").expect(409);
    await request(app).get("/api/odds/wnba?refresh=true&overrideReason=short").expect(400);
    await request(app).get("/api/odds/wnba?refresh=true&overrideReason=manual%20same-day%20refresh").expect(200);
    expect(fetchWnbaOdds).toHaveBeenCalledTimes(2);
  });
});

describe("book filtering", () => {
  it("keeps only supported WNBA books", () => {
    const filtered = filterSupportedBooks({
      ...oddsGame,
      bookmakers: [
        { key: "fliff", title: "Fliff", markets: [] },
        { key: "fanduel", title: "FanDuel", markets: [] },
        { key: "draftkings", title: "DraftKings", markets: [] },
        { key: "betonlineag", title: "BetOnline", markets: [] },
        { key: "fanatics", title: "Fanatics", markets: [] },
        { key: "thescore", title: "theScore", markets: [] },
        { key: "bovada", title: "Bovada", markets: [] },
        { key: "pinnacle", title: "Pinnacle", markets: [] },
      ],
    });

    expect(filtered.bookmakers.map((book) => book.key)).toEqual([
      "fliff",
      "fanduel",
      "draftkings",
      "betonlineag",
      "fanatics",
      "thescore",
    ]);
  });
});

describe("analyze-all flow", () => {
  it("requires cached slate and odds, then analyzes every slate game without refreshing odds", async () => {
    const store = makeStore();
    const result: AnalysisResult = {
      gameId: "espn-1",
      dateEt: "2026-05-14",
      recommendation: "PASS",
      confidence: 44,
      dataQuality: "PARTIAL",
      marketValue: "No clear market value.",
      reasoning: "Rotation data is incomplete.",
      riskFactors: ["Lineup uncertainty"],
      createdAt: "2026-05-14T12:00:00.000Z",
    };
    const fetchWnbaOdds = vi.fn().mockResolvedValue(oddsFetchResult);
    const analyzeGame = vi.fn().mockResolvedValue({
      result,
      usage: {
        model: "gemini-3.1-pro-preview",
        gameId: "espn-1",
        inputTokens: 100,
        outputTokens: 50,
        estimatedCostUsd: 0.001,
        usedFallbackTokens: false,
      },
    });
    const app = createApp({
      store,
      config,
      getDateEt: () => "2026-05-14",
      odds: { fetchWnbaOdds } as any,
      analysis: { analyzeGame } as any,
      wnbaData: makeWnbaData(),
    });

    await request(app).post("/api/analyze/all").expect(409);

    store.saveSlate("2026-05-14", "WNBA", [slateGame]);
    await request(app).get("/api/odds/wnba?refresh=true").expect(200);
    const response = await request(app).post("/api/analyze/all").expect(200);

    expect(response.body.count).toBe(1);
    expect(analyzeGame).toHaveBeenCalledTimes(1);
    expect(fetchWnbaOdds).toHaveBeenCalledTimes(1);

    const quota = await request(app).get("/api/quota").expect(200);
    expect(quota.body.usage.gemini.count).toBe(1);

    const saved = await request(app).get("/api/analysis/wnba").expect(200);
    expect(saved.body.count).toBe(1);
    expect(saved.body.results[0]).toMatchObject({ gameId: "espn-1", recommendation: "PASS" });
  });

  it("requires an override reason before a second Analyze All for the same Eastern-date slate", async () => {
    const store = makeStore();
    const result: AnalysisResult = {
      gameId: "espn-1",
      dateEt: "2026-05-14",
      recommendation: "PASS",
      confidence: 44,
      dataQuality: "PARTIAL",
      marketValue: "No clear market value.",
      reasoning: "Rotation data is incomplete.",
      riskFactors: ["Lineup uncertainty"],
      createdAt: "2026-05-14T12:00:00.000Z",
    };
    const analyzeGame = vi.fn().mockResolvedValue({ result, usage: null });
    const app = createApp({
      store,
      config,
      getDateEt: () => "2026-05-14",
      odds: { fetchWnbaOdds: vi.fn().mockResolvedValue(oddsFetchResult) } as any,
      analysis: { analyzeGame } as any,
      wnbaData: makeWnbaData(),
    });

    store.saveSlate("2026-05-14", "WNBA", [slateGame]);
    await request(app).get("/api/odds/wnba?refresh=true").expect(200);
    await request(app).post("/api/analyze/all").expect(200);
    await request(app).post("/api/analyze/all").expect(409);
    await request(app).post("/api/analyze/all").send({ overrideReason: "manual slate rerun" }).expect(200);
    expect(analyzeGame).toHaveBeenCalledTimes(2);
  });

  it("resets saved WNBA analysis and the Analyze All run marker without clearing odds cache", async () => {
    const store = makeStore();
    const result: AnalysisResult = {
      gameId: "espn-1",
      dateEt: "2026-05-14",
      recommendation: "PASS",
      confidence: 44,
      dataQuality: "PARTIAL",
      marketValue: "No clear market value.",
      reasoning: "Rotation data is incomplete.",
      riskFactors: ["Lineup uncertainty"],
      createdAt: "2026-05-14T12:00:00.000Z",
    };
    const analyzeGame = vi.fn().mockResolvedValue({ result, usage: null });
    const fetchWnbaOdds = vi.fn().mockResolvedValue(oddsFetchResult);
    const app = createApp({
      store,
      config,
      getDateEt: () => "2026-05-14",
      odds: { fetchWnbaOdds } as any,
      analysis: { analyzeGame } as any,
      wnbaData: makeWnbaData(),
    });

    store.saveSlate("2026-05-14", "WNBA", [slateGame]);
    await request(app).get("/api/odds/wnba?refresh=true").expect(200);
    await request(app).post("/api/analyze/all").expect(200);

    let quota = await request(app).get("/api/quota").expect(200);
    expect(quota.body.quotaPolicy.analyzeAllRunsToday).toBe(1);

    const reset = await request(app).delete("/api/analysis/wnba/today").expect(200);
    expect(reset.body.reset).toEqual({ analyses: 1, analyzeAllRuns: 1 });

    const saved = await request(app).get("/api/analysis/wnba").expect(200);
    expect(saved.body.count).toBe(0);

    quota = await request(app).get("/api/quota").expect(200);
    expect(quota.body.quotaPolicy.analyzeAllRunsToday).toBe(0);

    const odds = await request(app).get("/api/odds/wnba").expect(200);
    expect(odds.body.games).toHaveLength(1);
    expect(fetchWnbaOdds).toHaveBeenCalledTimes(1);
  });
});

describe("WNBA candidate selection", () => {
  it("prices a candidate from leave-one-book-out no-vig consensus", () => {
    const board = buildWnbaCandidateBoard(slateGame, {
      ...oddsGame,
      bookmakers: [
        {
          key: "draftkings",
          title: "DraftKings",
          markets: [{ key: "h2h", outcomes: [{ name: "New York Liberty", price: +140 }, { name: "Las Vegas Aces", price: -190 }] }],
        },
        {
          key: "fanduel",
          title: "FanDuel",
          markets: [{ key: "h2h", outcomes: [{ name: "New York Liberty", price: +120 }, { name: "Las Vegas Aces", price: -140 }] }],
        },
        {
          key: "betonlineag",
          title: "BetOnline",
          markets: [{ key: "h2h", outcomes: [{ name: "New York Liberty", price: +118 }, { name: "Las Vegas Aces", price: -138 }] }],
        },
      ],
    });

    const candidate = board.find((item) => item.bookKey === "draftkings" && item.side === "New York Liberty");
    expect(candidate).toMatchObject({ referenceBookCount: 2 });
    expect(candidate?.expectedValuePercent).toBeGreaterThan(4);
    expect(candidate?.fairProbability).toBeLessThan(0.45);
  });

  it("filters out markets below the watchlist EV floor before Gemini analysis", () => {
    const candidate = selectBestWnbaCandidate(slateGame, {
      ...oddsGame,
      bookmakers: [
        {
          key: "draftkings",
          title: "DraftKings",
          markets: [{ key: "h2h", outcomes: [{ name: "New York Liberty", price: -110 }, { name: "Las Vegas Aces", price: -110 }] }],
        },
        {
          key: "fanduel",
          title: "FanDuel",
          markets: [{ key: "h2h", outcomes: [{ name: "New York Liberty", price: -110 }, { name: "Las Vegas Aces", price: -110 }] }],
        },
      ],
    });

    expect(candidate).toBeNull();
  });

  it("prices a qualifying WNBA team total from independent books", () => {
    const candidate = selectBestWnbaCandidate(slateGame, {
      ...oddsGame,
      bookmakers: [
        {
          key: "draftkings",
          title: "DraftKings",
          markets: [
            { key: "h2h", outcomes: [{ name: "New York Liberty", price: -110 }, { name: "Las Vegas Aces", price: -110 }] },
            { key: "team_totals", outcomes: [
              { name: "Over", description: "New York Liberty", point: 81.5, price: -100 },
              { name: "Under", description: "New York Liberty", point: 81.5, price: -115 },
            ] },
          ],
        },
        {
          key: "fanduel",
          title: "FanDuel",
          markets: [
            { key: "h2h", outcomes: [{ name: "New York Liberty", price: -116 }, { name: "Las Vegas Aces", price: -104 }] },
            { key: "team_totals", outcomes: [
              { name: "Over", description: "New York Liberty", point: 81.5, price: -120 },
              { name: "Under", description: "New York Liberty", point: 81.5, price: -102 },
            ] },
          ],
        },
      ],
    });

    expect(candidate).toMatchObject({
      market: "Team Total",
      teamName: "New York Liberty",
      side: "OVER",
      bookTitle: "DraftKings",
    });
    expect(candidate?.expectedValuePercent).toBeGreaterThanOrEqual(1);
  });

  it("excludes favorite prices shorter than -165 from WNBA candidates", () => {
    const board = buildWnbaCandidateBoard(slateGame, {
      ...oddsGame,
      bookmakers: [
        {
          key: "betonlineag",
          title: "BetOnline",
          markets: [{ key: "h2h", outcomes: [{ name: "New York Liberty", price: -200 }, { name: "Las Vegas Aces", price: +170 }] }],
        },
        {
          key: "fanduel",
          title: "FanDuel",
          markets: [{ key: "h2h", outcomes: [{ name: "New York Liberty", price: -225 }, { name: "Las Vegas Aces", price: +188 }] }],
        },
      ],
    });

    expect(board.some((candidate) => candidate.side === "New York Liberty" && candidate.odds < -165)).toBe(false);
  });

  it("allows the -165 boundary price when it otherwise qualifies", () => {
    const board = buildWnbaCandidateBoard(slateGame, {
      ...oddsGame,
      bookmakers: [
        {
          key: "betonlineag",
          title: "BetOnline",
          markets: [{ key: "h2h", outcomes: [{ name: "New York Liberty", price: -165 }, { name: "Las Vegas Aces", price: +142 }] }],
        },
        {
          key: "fanduel",
          title: "FanDuel",
          markets: [{ key: "h2h", outcomes: [{ name: "New York Liberty", price: -205 }, { name: "Las Vegas Aces", price: +170 }] }],
        },
      ],
    });

    expect(board).toEqual(expect.arrayContaining([expect.objectContaining({ side: "New York Liberty", odds: -165 })]));
    expect(board.some((candidate) => candidate.side === "New York Liberty" && candidate.odds < -165)).toBe(false);
  });

  it("builds a candidate board across moneyline, spread, and team totals for narrative review", () => {
    const board = buildWnbaCandidateBoard(slateGame, {
      ...oddsGame,
      bookmakers: [
        {
          key: "draftkings",
          title: "DraftKings",
          markets: [
            { key: "h2h", outcomes: [{ name: "New York Liberty", price: +128 }, { name: "Las Vegas Aces", price: -148 }] },
            { key: "spreads", outcomes: [{ name: "New York Liberty", point: 3.5, price: -102 }, { name: "Las Vegas Aces", point: -3.5, price: -118 }] },
            { key: "team_totals", outcomes: [
              { name: "Over", description: "New York Liberty", point: 81.5, price: -100 },
              { name: "Under", description: "New York Liberty", point: 81.5, price: -115 },
            ] },
          ],
        },
        {
          key: "fanduel",
          title: "FanDuel",
          markets: [
            { key: "h2h", outcomes: [{ name: "New York Liberty", price: +110 }, { name: "Las Vegas Aces", price: -132 }] },
            { key: "spreads", outcomes: [{ name: "New York Liberty", point: 3.5, price: -118 }, { name: "Las Vegas Aces", point: -3.5, price: -102 }] },
            { key: "team_totals", outcomes: [
              { name: "Over", description: "New York Liberty", point: 81.5, price: -120 },
              { name: "Under", description: "New York Liberty", point: 81.5, price: -102 },
            ] },
          ],
        },
      ],
    });

    expect(new Set(board.map((candidate) => candidate.market))).toEqual(new Set(["Moneyline", "Spread", "Team Total"]));
    expect(board.every((candidate) => candidate.candidateId && candidate.expectedValuePercent >= 1)).toBe(true);
  });

  it("elevates only the two strongest qualified daily selections", () => {
    const makeAnalysis = (gameId: string, expectedValuePercent: number): AnalysisResult => ({
      gameId,
      dateEt: "2026-05-14",
      sport: "WNBA",
      recommendation: "BET",
      confidence: 80,
      dataQuality: "STRONG",
      marketValue: "Test",
      reasoning: "Verified evidence.",
      riskFactors: [],
      createdAt: "2026-05-14T12:00:00.000Z",
      expectedValuePercent,
      referenceBookCount: 3,
      consensusDispersionPercent: 1,
    });

    const ranked = applyDailySelectionCap([
      makeAnalysis("third", 3),
      makeAnalysis("first", 6),
      makeAnalysis("second", 4),
    ]);

    expect(ranked.filter((analysis) => analysis.recommendation === "BET").map((analysis) => analysis.gameId))
      .toEqual(["first", "second"]);
    expect(ranked.find((analysis) => analysis.gameId === "third")).toMatchObject({
      recommendation: "LEAN",
      passReasonCode: "DAILY_SELECTION_CAP",
      dailySelectionRank: 3,
    });
  });
});

describe("closing line tracking", () => {
  it("records the current selected price and reports whether the recommendation beat the close", async () => {
    const store = makeStore();
    store.saveSlate("2026-05-14", "WNBA", [slateGame]);
    store.saveOdds("2026-05-14", "WNBA", [{
      ...oddsGame,
      bookmakers: [{
        key: "draftkings",
        title: "DraftKings",
        markets: [{
          key: "h2h",
          outcomes: [
            { name: "New York Liberty", price: +120 },
            { name: "Las Vegas Aces", price: -140 },
          ],
        }],
      }],
    }]);
    store.saveAnalysis({
      gameId: slateGame.id,
      dateEt: "2026-05-14",
      sport: "WNBA",
      recommendation: "BET",
      confidence: 80,
      dataQuality: "STRONG",
      marketValue: "Priced value",
      reasoning: "Verified evidence.",
      riskFactors: [],
      createdAt: "2026-05-14T12:00:00.000Z",
      selectedMarket: "Moneyline",
      selectedSide: "New York Liberty",
      selectedBook: "DraftKings",
      selectedOdds: +135,
    });

    const app = createApp({ store, config, getDateEt: () => "2026-05-14" });
    const response = await request(app)
      .post(`/api/analysis/wnba/${slateGame.id}/close`)
      .expect(200);

    expect(response.body).toMatchObject({
      closingOdds: 120,
      beatClose: true,
    });
    expect(response.body.clvPercent).toBeGreaterThan(0);
    expect(response.body.closingRecordedAt).toBeTruthy();
  });
});

describe("MLB candidate selection", () => {
  it("builds an MLB candidate board across moneyline, run line, and team totals", () => {
    const board = buildWnbaCandidateBoard(mlbSlateGame, {
      ...mlbOddsGame,
      bookmakers: [
        {
          key: "draftkings",
          title: "DraftKings",
          markets: [
            { key: "h2h", outcomes: [{ name: "New York Yankees", price: +122 }, { name: "Boston Red Sox", price: -142 }] },
            { key: "spreads", outcomes: [{ name: "New York Yankees", point: 1.5, price: -104 }, { name: "Boston Red Sox", point: -1.5, price: +176 }] },
            { key: "team_totals", outcomes: [
              { name: "Over", description: "New York Yankees", point: 4.5, price: -101 },
              { name: "Under", description: "New York Yankees", point: 4.5, price: -119 },
            ] },
          ],
        },
        {
          key: "fanduel",
          title: "FanDuel",
          markets: [
            { key: "h2h", outcomes: [{ name: "New York Yankees", price: +108 }, { name: "Boston Red Sox", price: -126 }] },
            { key: "spreads", outcomes: [{ name: "New York Yankees", point: 1.5, price: -126 }, { name: "Boston Red Sox", point: -1.5, price: +152 }] },
            { key: "team_totals", outcomes: [
              { name: "Over", description: "New York Yankees", point: 4.5, price: -122 },
              { name: "Under", description: "New York Yankees", point: 4.5, price: +100 },
            ] },
          ],
        },
      ],
    });

    expect(new Set(board.map((candidate) => candidate.market))).toEqual(new Set(["Moneyline", "Spread", "Team Total"]));
    expect(board.every((candidate) => candidate.gameId === "mlb-espn-1")).toBe(true);
  });

  it("vetoes MLB Gemini selections that are not on the priced board", async () => {
    const service = new AnalysisService(undefined, {
      models: {
        generateContent: vi.fn().mockResolvedValue({
          text: JSON.stringify({
            recommendation: "BET",
            confidence: 82,
            dataQuality: "STRONG",
            selectedCandidateId: "moneyline:houston-astros:na:draftkings",
            selectedMarket: "Moneyline",
            selectedSide: "Houston Astros",
            selectedBook: "DraftKings",
            selectedPoint: null,
            marketValue: "Off-board price.",
            reasoning: "This should be vetoed because it is not listed.",
            narrativeSignals: [{ category: "starting_pitcher", grade: "HARD_FACT", direction: "supports_candidate", summary: "Starter edge cited.", source: "Test" }],
            riskFactors: [],
            passReasonCode: "LOW_CONFIDENCE",
          }),
        }),
      },
    } as any);

    const response = await service.analyzeGame("2026-06-12", mlbSlateGame, {
      ...mlbOddsGame,
      bookmakers: [
        {
          key: "draftkings",
          title: "DraftKings",
          markets: [{ key: "h2h", outcomes: [{ name: "New York Yankees", price: +122 }, { name: "Boston Red Sox", price: -142 }] }],
        },
        {
          key: "fanduel",
          title: "FanDuel",
          markets: [{ key: "h2h", outcomes: [{ name: "New York Yankees", price: +108 }, { name: "Boston Red Sox", price: -126 }] }],
        },
      ],
    }, null);

    expect(response.result.sport).toBe("MLB");
    expect(response.result.recommendation).toBe("PASS");
    expect(response.result.passReasonCode).toBe("AI_MARKET_SWITCH");
  });
});

describe("WNBA Gemini fallback", () => {
  it("falls back to Gemini 2.5 Pro when the configured analysis model times out", async () => {
    vi.useFakeTimers();
    const generateContent = vi
      .fn()
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValueOnce({
        text: JSON.stringify({
          recommendation: "PASS",
          confidence: 25,
          dataQuality: "PARTIAL",
          selectedCandidateId: "moneyline:new-york-liberty:na:betonlineag",
          selectedMarket: "Moneyline",
          selectedSide: "New York Liberty",
          selectedBook: "BetOnline",
          selectedPoint: null,
          marketValue: "Thin market value.",
          reasoning: "The price is not enough without stronger rotation support.",
          narrativeSignals: [],
          riskFactors: ["Thin edge"],
          passReasonCode: "LOW_CONFIDENCE",
        }),
        usageMetadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 25,
        },
      });
    const service = new AnalysisService(
      undefined,
      { models: { generateContent } },
      "gemini-3.1-pro-preview",
      config,
    );
    const oddsWithEdge: OddsGame = {
      ...oddsGame,
      bookmakers: [
        {
          key: "betonlineag",
          title: "BetOnline",
          markets: [{ key: "h2h", outcomes: [{ name: "New York Liberty", price: -165 }, { name: "Las Vegas Aces", price: +142 }] }],
        },
        {
          key: "fanduel",
          title: "FanDuel",
          markets: [{ key: "h2h", outcomes: [{ name: "New York Liberty", price: -205 }, { name: "Las Vegas Aces", price: +170 }] }],
        },
      ],
    };

    const promise = service.analyzeGame("2026-05-14", slateGame, oddsWithEdge, null);
    await vi.advanceTimersByTimeAsync(90001);
    const response = await promise;

    expect(generateContent).toHaveBeenNthCalledWith(1, expect.objectContaining({ model: "gemini-3.1-pro-preview" }));
    expect(generateContent).toHaveBeenNthCalledWith(2, expect.objectContaining({ model: "gemini-2.5-pro" }));
    expect(response.result.recommendation).toBe("PASS");
    expect(response.usage?.model).toBe("gemini-2.5-pro");
    vi.useRealTimers();
  });
});
