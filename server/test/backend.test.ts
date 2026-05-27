import Database from "better-sqlite3";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { migrate, Store } from "../src/storage/database.js";
import { filterSupportedBooks } from "../src/services/oddsService.js";
import { buildWnbaCandidateBoard, selectBestWnbaCandidate } from "../src/services/analysisService.js";
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
  it("filters out markets below the 1.5 percent edge floor before Gemini analysis", () => {
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

  it("prioritizes a qualifying WNBA total when edge is comparable", () => {
    const candidate = selectBestWnbaCandidate(slateGame, {
      ...oddsGame,
      bookmakers: [
        {
          key: "draftkings",
          title: "DraftKings",
          markets: [
            { key: "h2h", outcomes: [{ name: "New York Liberty", price: -110 }, { name: "Las Vegas Aces", price: -110 }] },
            { key: "totals", outcomes: [{ name: "Over", point: 162.5, price: -100 }, { name: "Under", point: 162.5, price: -115 }] },
          ],
        },
        {
          key: "fanduel",
          title: "FanDuel",
          markets: [
            { key: "h2h", outcomes: [{ name: "New York Liberty", price: -116 }, { name: "Las Vegas Aces", price: -104 }] },
            { key: "totals", outcomes: [{ name: "Over", point: 162.5, price: -120 }, { name: "Under", point: 162.5, price: -102 }] },
          ],
        },
      ],
    });

    expect(candidate).toMatchObject({ market: "Total", side: "OVER", bookTitle: "DraftKings" });
    expect(candidate?.edgePercent).toBeGreaterThanOrEqual(1.5);
  });

  it("builds a candidate board across moneyline, spread, and totals for narrative review", () => {
    const board = buildWnbaCandidateBoard(slateGame, {
      ...oddsGame,
      bookmakers: [
        {
          key: "draftkings",
          title: "DraftKings",
          markets: [
            { key: "h2h", outcomes: [{ name: "New York Liberty", price: +128 }, { name: "Las Vegas Aces", price: -148 }] },
            { key: "spreads", outcomes: [{ name: "New York Liberty", point: 3.5, price: -102 }, { name: "Las Vegas Aces", point: -3.5, price: -118 }] },
            { key: "totals", outcomes: [{ name: "Over", point: 162.5, price: -100 }, { name: "Under", point: 162.5, price: -115 }] },
          ],
        },
        {
          key: "fanduel",
          title: "FanDuel",
          markets: [
            { key: "h2h", outcomes: [{ name: "New York Liberty", price: +110 }, { name: "Las Vegas Aces", price: -132 }] },
            { key: "spreads", outcomes: [{ name: "New York Liberty", point: 3.5, price: -118 }, { name: "Las Vegas Aces", point: -3.5, price: -102 }] },
            { key: "totals", outcomes: [{ name: "Over", point: 162.5, price: -120 }, { name: "Under", point: 162.5, price: -102 }] },
          ],
        },
      ],
    });

    expect(new Set(board.map((candidate) => candidate.market))).toEqual(new Set(["Moneyline", "Spread", "Total"]));
    expect(board.every((candidate) => candidate.candidateId && candidate.edgePercent >= 0.5)).toBe(true);
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
          markets: [{ key: "h2h", outcomes: [{ name: "New York Liberty", price: -185 }, { name: "Las Vegas Aces", price: +160 }] }],
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
