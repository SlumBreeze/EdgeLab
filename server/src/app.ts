import express from "express";
import cors from "cors";
import { z } from "zod";
import type { Config } from "./config.js";
import { Store } from "./storage/database.js";
import { getEasternDate } from "./utils/time.js";
import { EspnService } from "./services/espnService.js";
import { OddsService } from "./services/oddsService.js";
import { AnalysisService, estimatePlannedGeminiCostUsd, findOddsForSlateGame } from "./services/analysisService.js";
import { WnbaDataService } from "./services/wnbaDataService.js";
import type { SlateGame, Sport, WnbaDataPack } from "./types.js";

export type AppDeps = {
  store: Store;
  config: Config;
  espn?: EspnService;
  odds?: OddsService;
  analysis?: AnalysisService;
  wnbaData?: WnbaDataService;
  getDateEt?: () => string;
};

export const createApp = ({ store, config, espn, odds, analysis, wnbaData, getDateEt = getEasternDate }: AppDeps) => {
  const app = express();
  const espnService = espn || new EspnService();
  const oddsService = odds || new OddsService(config.oddsApiKey);
  const wnbaDataService = wnbaData || new WnbaDataService();
  const geminiCostConfig = {
    inputCostPerMillionTokens: config.geminiInputCostPerMillionTokens,
    outputCostPerMillionTokens: config.geminiOutputCostPerMillionTokens,
    fallbackInputTokens: config.geminiFallbackInputTokens,
    fallbackOutputTokens: config.geminiFallbackOutputTokens,
  };
  const analysisService = analysis || new AnalysisService(config.geminiApiKey, undefined, config.geminiModel, geminiCostConfig);

  app.use(cors({ origin: config.allowedOrigin }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/session/today", (_req, res) => {
    const dateEt = getDateEt();
    const session = store.getOrCreateSession(dateEt);
    res.json({ ...session, needsBudget: session.budgetCents === null });
  });

  app.put("/api/session/budget", (req, res) => {
    const body = z.object({ budgetCents: z.number().int().nonnegative() }).parse(req.body);
    const session = store.setBudget(getDateEt(), body.budgetCents);
    res.json({ ...session, needsBudget: false });
  });

  registerSportRoutes({
    app,
    sport: "WNBA",
    store,
    config,
    espnService,
    oddsService,
    analysisService,
    wnbaDataService,
    getDateEt,
    geminiCostConfig,
    legacyAnalyzeAllPath: "/api/analyze/all",
    legacyAnalyzeGamePath: "/api/analyze/:gameId",
  });

  registerSportRoutes({
    app,
    sport: "MLB",
    store,
    config,
    espnService,
    oddsService,
    analysisService,
    wnbaDataService,
    getDateEt,
    geminiCostConfig,
  });

  app.get("/api/quota", (req, res) => {
    const sport = readSport(req.query.sport) || "WNBA";
    sendQuota({ res, store, config, dateEt: getDateEt(), sport });
  });

  app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "VALIDATION_ERROR", issues: error.issues });
      return;
    }
    const geminiError = parseGeminiError(error);
    if (geminiError) {
      res.status(geminiError.status).json(geminiError.body);
      return;
    }
    res.status(500).json({ error: "SERVER_ERROR", message: error?.message || "Unexpected backend error" });
  });

  return app;
};

const registerSportRoutes = ({
  app,
  sport,
  store,
  config,
  espnService,
  oddsService,
  analysisService,
  wnbaDataService,
  getDateEt,
  geminiCostConfig,
  legacyAnalyzeAllPath,
  legacyAnalyzeGamePath,
}: {
  app: express.Express;
  sport: Sport;
  store: Store;
  config: Config;
  espnService: EspnService;
  oddsService: OddsService;
  analysisService: AnalysisService;
  wnbaDataService: WnbaDataService;
  getDateEt: () => string;
  geminiCostConfig: {
    inputCostPerMillionTokens: number;
    outputCostPerMillionTokens: number;
    fallbackInputTokens: number;
    fallbackOutputTokens: number;
  };
  legacyAnalyzeAllPath?: string;
  legacyAnalyzeGamePath?: string;
}) => {
  const slug = sport.toLowerCase();
  const slatePath = `/api/slate/${slug}`;
  const oddsPath = `/api/odds/${slug}`;
  const analyzeAllPaths = [`/api/analyze/${slug}/all`, legacyAnalyzeAllPath].filter(Boolean) as string[];
  const analyzeGamePaths = [`/api/analyze/${slug}/:gameId`, legacyAnalyzeGamePath].filter(Boolean) as string[];

  app.get(slatePath, async (req, res, next) => {
    try {
      const dateEt = getDateEt();
      const refresh = req.query.refresh === "true";
      const cached = store.getSlate(dateEt, sport);
      if (cached && !refresh) {
        res.json({ dateEt, fetchedAt: cached.fetchedAt, source: "cache", games: cached.data });
        return;
      }

      const games = await fetchSlateForSport(espnService, sport, dateEt);
      store.saveSlate(dateEt, sport, games);
      const updated = store.getSlate(dateEt, sport);
      res.json({ dateEt, fetchedAt: updated?.fetchedAt, source: "espn", games });
    } catch (error) {
      next(error);
    }
  });

  app.get(oddsPath, async (req, res, next) => {
    try {
      const dateEt = getDateEt();
      const refresh = req.query.refresh === "true";
      const cached = store.getOdds(dateEt, sport);

      if (!refresh) {
        if (!cached) {
          res.status(409).json({
            error: "ODDS_REFRESH_REQUIRED",
            message: `No ${sport} odds cache exists for today. Call with refresh=true to spend Odds API quota.`,
          });
          return;
        }
        res.json({ dateEt, fetchedAt: cached.fetchedAt, source: "cache", games: cached.data });
        return;
      }

      const overrideReason = readOverrideReason(req.query.overrideReason);
      const previousRefreshes = store.countOddsRefreshes(dateEt, sport);
      if (previousRefreshes >= 1) {
        const overrideError = validateOverride(overrideReason);
        if (overrideError) {
          res.status(overrideError.status).json({
            error: overrideError.code,
            guardrail: "ODDS_DAILY_REFRESH_LIMIT",
            requiresOverride: true,
            message:
              "Odds have already been refreshed once for this Eastern date. Send overrideReason with at least 10 characters to spend more API credits.",
          });
          return;
        }
        store.recordOverride({
          dateEt,
          actor: "local-user",
          action: "odds_refresh_daily_limit",
          provider: "odds-api",
          sport,
          overrideReason: overrideReason!,
        });
      }

      const oddsFetch = await fetchOddsForSport(oddsService, sport);
      const games = Array.isArray(oddsFetch) ? oddsFetch : oddsFetch.games;
      store.saveOdds(dateEt, sport, games);
      if (!Array.isArray(oddsFetch)) {
        store.saveOddsApiUsage(dateEt, oddsFetch.usage);
      }
      store.incrementUsage(dateEt, "odds");
      const updated = store.getOdds(dateEt, sport);
      res.json({
        dateEt,
        fetchedAt: updated?.fetchedAt,
        source: "odds-api",
        games,
        credits: Array.isArray(oddsFetch) ? null : oddsFetch.usage,
      });
    } catch (error) {
      next(error);
    }
  });

  for (const analyzeAllPath of analyzeAllPaths) {
  app.post(analyzeAllPath, async (req, res, next) => {
    try {
      const dateEt = getDateEt();
      const body = overrideBodySchema.parse(req.body || {});
      const slate = store.getSlate(dateEt, sport);
      const oddsCache = store.getOdds(dateEt, sport);
      if (!slate || !oddsCache) {
        res.status(409).json({
          error: "CACHE_REQUIRED",
          message: "Fetch today's slate and explicitly refresh today's odds before analyze-all.",
        });
        return;
      }

      const overrideReason = body.overrideReason;
      const previousRun = store.getLatestAnalyzeAllRun(dateEt, sport);
      const plannedCostUsd = estimatePlannedGeminiCostUsd(slate.data.length, geminiCostConfig);
      const weeklyTotals = store.getWeeklyTotals(dateEt);
      const projectedWeeklySpendUsd = weeklyTotals.providers.gemini.estimatedCostUsd + plannedCostUsd;
      const violations: string[] = [];

      if (previousRun) {
        violations.push("ANALYZE_ALL_SLATE_LIMIT");
      }
      if (projectedWeeklySpendUsd >= config.geminiWeeklyHardStopUsd) {
        violations.push("GEMINI_WEEKLY_HARD_STOP");
      }

      if (violations.length > 0) {
        const overrideError = validateOverride(overrideReason);
        if (overrideError) {
          const slateChange =
            previousRun && previousRun.gameCount !== slate.data.length
              ? ` Previous Analyze All covered ${previousRun.gameCount} games; the current slate has ${slate.data.length}.`
              : "";
          res.status(overrideError.status).json({
            error: overrideError.code,
            guardrails: violations,
            requiresOverride: true,
            projectedWeeklySpendUsd,
            message:
              violations.includes("GEMINI_WEEKLY_HARD_STOP")
                ? `Analyze All would put estimated Gemini spend at ${formatUsd(projectedWeeklySpendUsd)} this week, above the hard stop. Send overrideReason with at least 10 characters to continue.`
                : `Analyze All has already run for this ${sport} Eastern-date slate.${slateChange} Send overrideReason with at least 10 characters to run it again.`,
          });
          return;
        }

        for (const violation of violations) {
          store.recordOverride({
            dateEt,
            actor: "local-user",
            action: violation.toLowerCase(),
            provider: violation.startsWith("GEMINI") ? "gemini" : null,
            sport,
            overrideReason: overrideReason!,
          });
        }
      }

      const results = [];
      const dataPack = sport === "WNBA" ? await getOrBuildWnbaDataPack(store, wnbaDataService, dateEt, slate.data) : null;
      for (const game of slate.data) {
        const analysisResponse = await analysisService.analyzeGame(
          dateEt,
          game,
          findOddsForSlateGame(game, oddsCache.data),
          dataPack,
        );
        const { result, usage } = normalizeAnalysisResponse(analysisResponse);
        store.saveAnalysis(result);
        if (usage) {
          store.saveGeminiUsage(dateEt, usage);
        }
        if (usage) {
          store.incrementUsage(dateEt, "gemini");
        }
        results.push(result);
      }

      store.recordAnalyzeAllRun(dateEt, sport, slate.data.length);
      res.json({ dateEt, count: results.length, results, weeklyTotals: store.getWeeklyTotals(dateEt) });
    } catch (error) {
      next(error);
    }
  });
  }

  app.get(`/api/analysis/${slug}`, (_req, res) => {
    const dateEt = getDateEt();
    const results = store.getAnalyses(dateEt, sport);
    res.json({ dateEt, count: results.length, results });
  });

  app.delete(`/api/analysis/${slug}/today`, (_req, res) => {
    const dateEt = getDateEt();
    const reset = store.resetAnalysis(dateEt, sport);
    res.json({ dateEt, reset });
  });

  for (const analyzeGamePath of analyzeGamePaths) {
  app.post(analyzeGamePath, async (req, res, next) => {
    try {
      const dateEt = getDateEt();
      const slate = store.getSlate(dateEt, sport);
      const oddsCache = store.getOdds(dateEt, sport);
      if (!slate) {
        res.status(409).json({ error: "SLATE_REQUIRED", message: `Fetch /api/slate/${slug} before analysis.` });
        return;
      }
      if (!oddsCache) {
        res.status(409).json({ error: "ODDS_REQUIRED", message: `Refresh /api/odds/${slug} before analysis.` });
        return;
      }

      const game = slate.data.find((item) => item.id === req.params.gameId);
      if (!game) {
        res.status(404).json({ error: "GAME_NOT_FOUND" });
        return;
      }

      const body = overrideBodySchema.parse(req.body || {});
      const plannedCostUsd = estimatePlannedGeminiCostUsd(1, geminiCostConfig);
      const weeklyTotals = store.getWeeklyTotals(dateEt);
      const projectedWeeklySpendUsd = weeklyTotals.providers.gemini.estimatedCostUsd + plannedCostUsd;
      if (projectedWeeklySpendUsd >= config.geminiWeeklyHardStopUsd) {
        const overrideError = validateOverride(body.overrideReason);
        if (overrideError) {
          res.status(overrideError.status).json({
            error: overrideError.code,
            guardrails: ["GEMINI_WEEKLY_HARD_STOP"],
            requiresOverride: true,
            projectedWeeklySpendUsd,
            message: `This analysis would put estimated Gemini spend at ${formatUsd(projectedWeeklySpendUsd)} this week, above the hard stop. Send overrideReason with at least 10 characters to continue.`,
          });
          return;
        }
        store.recordOverride({
          dateEt,
          actor: "local-user",
          action: "gemini_weekly_hard_stop",
          provider: "gemini",
          sport,
          gameId: String(req.params.gameId),
          overrideReason: body.overrideReason!,
        });
      }

      const dataPack = sport === "WNBA" ? await getOrBuildWnbaDataPack(store, wnbaDataService, dateEt, slate.data) : null;
      const analysisResponse = await analysisService.analyzeGame(dateEt, game, findOddsForSlateGame(game, oddsCache.data), dataPack);
      const { result, usage } = normalizeAnalysisResponse(analysisResponse);
      store.saveAnalysis(result);
      if (usage) {
        store.saveGeminiUsage(dateEt, usage);
        store.incrementUsage(dateEt, "gemini");
      }
      res.json(result);
    } catch (error) {
      next(error);
    }
  });
  }
};

const fetchSlateForSport = (espnService: any, sport: Sport, dateEt: string): Promise<SlateGame[]> => {
  if (typeof espnService.fetchSlate === "function") return espnService.fetchSlate(sport, dateEt);
  if (sport === "WNBA" && typeof espnService.fetchWnbaSlate === "function") return espnService.fetchWnbaSlate(dateEt);
  if (sport === "MLB" && typeof espnService.fetchMlbSlate === "function") return espnService.fetchMlbSlate(dateEt);
  throw new Error(`No ESPN slate fetcher configured for ${sport}.`);
};

const fetchOddsForSport = (oddsService: any, sport: Sport) => {
  if (typeof oddsService.fetchOdds === "function") return oddsService.fetchOdds(sport);
  if (sport === "WNBA" && typeof oddsService.fetchWnbaOdds === "function") return oddsService.fetchWnbaOdds();
  if (sport === "MLB" && typeof oddsService.fetchMlbOdds === "function") return oddsService.fetchMlbOdds();
  throw new Error(`No odds fetcher configured for ${sport}.`);
};

const readSport = (value: unknown): Sport | null => {
  const normalized = typeof value === "string" ? value.toUpperCase() : "";
  return normalized === "WNBA" || normalized === "MLB" ? normalized : null;
};

const sendQuota = ({
  res,
  store,
  config,
  dateEt,
  sport,
}: {
  res: express.Response;
  store: Store;
  config: Config;
  dateEt: string;
  sport: Sport;
}) => {
  const oddsCache = store.getOdds(dateEt, sport);
  const weeklyTotals = store.getWeeklyTotals(dateEt);
  const latestOddsUsage = store.getLatestOddsUsage(sport);
  const todayGemini = store.getTodayGeminiUsage(dateEt);
  const legacyUsage = store.getUsage(dateEt);
  const legacyGeminiCalls = legacyUsage.gemini?.count || 0;
  const displayedTodayGemini = { ...todayGemini, calls: Math.max(todayGemini.calls, legacyGeminiCalls) };
  const displayedWeekGemini = {
    ...weeklyTotals.providers.gemini,
    calls: Math.max(weeklyTotals.providers.gemini.calls, legacyGeminiCalls),
  };
  const latestAnalyzeAll = store.getLatestAnalyzeAllRun(dateEt, sport);
  res.json({
    dateEt,
    weekEt: weeklyTotals.weekEt,
    sport,
    oddsLastFetchAt: oddsCache?.fetchedAt || null,
    usage: legacyUsage,
    oddsCredits: latestOddsUsage,
    gemini: {
      today: displayedTodayGemini,
      week: displayedWeekGemini,
      warningThresholdUsd: config.geminiWeeklyWarningUsd,
      hardStopUsd: config.geminiWeeklyHardStopUsd,
      isWarning: weeklyTotals.providers.gemini.estimatedCostUsd >= config.geminiWeeklyWarningUsd,
      isHardStopped: weeklyTotals.providers.gemini.estimatedCostUsd >= config.geminiWeeklyHardStopUsd,
    },
    weeklyTotals: {
      ...weeklyTotals,
      providers: {
        ...weeklyTotals.providers,
        gemini: displayedWeekGemini,
      },
    },
    quotaPolicy: {
      oddsRefreshRequired: true,
      backgroundPolling: false,
      maxOddsRefreshesPerEtDay: 1,
      maxAnalyzeAllPerSlate: 1,
      oddsRefreshesToday: store.countOddsRefreshes(dateEt, sport),
      analyzeAllRunsToday: latestAnalyzeAll ? 1 : 0,
      analyzeAllLastRun: latestAnalyzeAll,
    },
    analysisModel: config.geminiModel,
  });
};

const getOrBuildWnbaDataPack = async (
  store: Store,
  wnbaDataService: WnbaDataService,
  dateEt: string,
  slate: SlateGame[],
): Promise<WnbaDataPack> => {
  const cached = store.getWnbaDataPack(dateEt);
  if (cached) return cached.data;
  const dataPack = await wnbaDataService.buildDataPack(dateEt, slate);
  store.saveWnbaDataPack(dateEt, dataPack);
  return dataPack;
};

const parseGeminiError = (error: any) => {
  const rawMessage = String(error?.message || "");
  let parsed: any = null;
  try {
    parsed = JSON.parse(rawMessage);
  } catch {
    parsed = null;
  }

  const message = parsed?.error?.message || rawMessage;
  const status = parsed?.error?.status;
  if (status === "RESOURCE_EXHAUSTED" || message.includes("Quota exceeded")) {
    return {
      status: 429,
      body: {
        error: "GEMINI_QUOTA_EXHAUSTED",
        message:
          "Gemini Pro is configured, but this API key has no available Pro quota. Use a key with Gemini Pro access or switch the configured model to a free-tier model.",
      },
    };
  }

  if (status === "NOT_FOUND" || message.includes("not found") || message.includes("not available")) {
    return {
      status: 400,
      body: {
        error: "GEMINI_MODEL_UNAVAILABLE",
        message:
          "The configured Gemini model is not available for this API key. Update GEMINI_MODEL to a supported model such as gemini-3.1-pro-preview or gemini-2.5-pro.",
      },
    };
  }

  if (status === "INVALID_ARGUMENT" || message.includes("unsupported")) {
    return {
      status: 400,
      body: {
        error: "GEMINI_REQUEST_REJECTED",
        message,
      },
    };
  }

  return null;
};

const overrideBodySchema = z.object({
  overrideReason: z.string().trim().optional(),
});

const readOverrideReason = (value: unknown) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

const validateOverride = (overrideReason: string | undefined) => {
  if (!overrideReason) {
    return { status: 409, code: "GUARDRAIL_OVERRIDE_REQUIRED" };
  }
  if (overrideReason.trim().length < 10) {
    return { status: 400, code: "OVERRIDE_REASON_TOO_SHORT" };
  }
  return null;
};

const normalizeAnalysisResponse = (response: any) => {
  if (response?.result) {
    return { result: response.result, usage: response.usage || null };
  }
  return { result: response, usage: null };
};

const formatUsd = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
