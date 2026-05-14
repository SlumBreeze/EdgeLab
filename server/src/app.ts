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
import type { SlateGame, WnbaDataPack } from "./types.js";

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

  app.get("/api/slate/wnba", async (req, res, next) => {
    try {
      const dateEt = getDateEt();
      const refresh = req.query.refresh === "true";
      const cached = store.getSlate(dateEt, "WNBA");
      if (cached && !refresh) {
        res.json({ dateEt, fetchedAt: cached.fetchedAt, source: "cache", games: cached.data });
        return;
      }

      const games = await espnService.fetchWnbaSlate(dateEt);
      store.saveSlate(dateEt, "WNBA", games);
      const updated = store.getSlate(dateEt, "WNBA");
      res.json({ dateEt, fetchedAt: updated?.fetchedAt, source: "espn", games });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/odds/wnba", async (req, res, next) => {
    try {
      const dateEt = getDateEt();
      const refresh = req.query.refresh === "true";
      const cached = store.getOdds(dateEt, "WNBA");

      if (!refresh) {
        if (!cached) {
          res.status(409).json({
            error: "ODDS_REFRESH_REQUIRED",
            message: "No WNBA odds cache exists for today. Call with refresh=true to spend Odds API quota.",
          });
          return;
        }
        res.json({ dateEt, fetchedAt: cached.fetchedAt, source: "cache", games: cached.data });
        return;
      }

      const overrideReason = readOverrideReason(req.query.overrideReason);
      const previousRefreshes = store.countOddsRefreshes(dateEt);
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
          sport: "WNBA",
          overrideReason: overrideReason!,
        });
      }

      const oddsFetch = await oddsService.fetchWnbaOdds();
      const games = Array.isArray(oddsFetch) ? oddsFetch : oddsFetch.games;
      store.saveOdds(dateEt, "WNBA", games);
      if (!Array.isArray(oddsFetch)) {
        store.saveOddsApiUsage(dateEt, oddsFetch.usage);
      }
      store.incrementUsage(dateEt, "odds");
      const updated = store.getOdds(dateEt, "WNBA");
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

  app.post("/api/analyze/all", async (req, res, next) => {
    try {
      const dateEt = getDateEt();
      const body = overrideBodySchema.parse(req.body || {});
      const slate = store.getSlate(dateEt, "WNBA");
      const oddsCache = store.getOdds(dateEt, "WNBA");
      if (!slate || !oddsCache) {
        res.status(409).json({
          error: "CACHE_REQUIRED",
          message: "Fetch today's slate and explicitly refresh today's odds before analyze-all.",
        });
        return;
      }

      const overrideReason = body.overrideReason;
      const previousRun = store.getLatestAnalyzeAllRun(dateEt, "WNBA");
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
                : `Analyze All has already run for this WNBA Eastern-date slate.${slateChange} Send overrideReason with at least 10 characters to run it again.`,
          });
          return;
        }

        for (const violation of violations) {
          store.recordOverride({
            dateEt,
            actor: "local-user",
            action: violation.toLowerCase(),
            provider: violation.startsWith("GEMINI") ? "gemini" : null,
            sport: "WNBA",
            overrideReason: overrideReason!,
          });
        }
      }

      const results = [];
      const dataPack = await getOrBuildWnbaDataPack(store, wnbaDataService, dateEt, slate.data);
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

      store.recordAnalyzeAllRun(dateEt, "WNBA", slate.data.length);
      res.json({ dateEt, count: results.length, results, weeklyTotals: store.getWeeklyTotals(dateEt) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/analysis/wnba", (_req, res) => {
    const dateEt = getDateEt();
    const results = store.getAnalyses(dateEt);
    res.json({ dateEt, count: results.length, results });
  });

  app.post("/api/analyze/:gameId", async (req, res, next) => {
    try {
      const dateEt = getDateEt();
      const slate = store.getSlate(dateEt, "WNBA");
      const oddsCache = store.getOdds(dateEt, "WNBA");
      if (!slate) {
        res.status(409).json({ error: "SLATE_REQUIRED", message: "Fetch /api/slate/wnba before analysis." });
        return;
      }
      if (!oddsCache) {
        res.status(409).json({ error: "ODDS_REQUIRED", message: "Refresh /api/odds/wnba before analysis." });
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
          sport: "WNBA",
          gameId: req.params.gameId,
          overrideReason: body.overrideReason!,
        });
      }

      const dataPack = await getOrBuildWnbaDataPack(store, wnbaDataService, dateEt, slate.data);
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

  app.get("/api/quota", (_req, res) => {
    const dateEt = getDateEt();
    const oddsCache = store.getOdds(dateEt, "WNBA");
    const weeklyTotals = store.getWeeklyTotals(dateEt);
    const latestOddsUsage = store.getLatestOddsUsage();
    const todayGemini = store.getTodayGeminiUsage(dateEt);
    const legacyUsage = store.getUsage(dateEt);
    const legacyGeminiCalls = legacyUsage.gemini?.count || 0;
    const displayedTodayGemini = { ...todayGemini, calls: Math.max(todayGemini.calls, legacyGeminiCalls) };
    const displayedWeekGemini = {
      ...weeklyTotals.providers.gemini,
      calls: Math.max(weeklyTotals.providers.gemini.calls, legacyGeminiCalls),
    };
    const latestAnalyzeAll = store.getLatestAnalyzeAllRun(dateEt, "WNBA");
    res.json({
      dateEt,
      weekEt: weeklyTotals.weekEt,
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
        oddsRefreshesToday: store.countOddsRefreshes(dateEt),
        analyzeAllRunsToday: latestAnalyzeAll ? 1 : 0,
        analyzeAllLastRun: latestAnalyzeAll,
      },
      analysisModel: config.geminiModel,
    });
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
