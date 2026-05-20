import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock,
  DollarSign,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Target,
} from "lucide-react";
import { ApiError, AnalysisResult, backendApi, Bookmaker, OddsGame, QuotaResponse, SessionResponse, SlateGame } from "../services/backendApi";
import { createToastHelpers, useToast } from "../components/Toast";

type LoadState = "loading" | "ready" | "error";
type WorkState = "idle" | "refreshing-odds" | "analyzing";

type OddsCacheState = {
  source: "cache" | "odds-api" | "missing" | "unknown";
  fetchedAt: string | null;
  games: OddsGame[];
};

const BOOK_ORDER = ["fanduel", "draftkings", "fanatics", "thescore", "betonlineag", "fliff"];

const centsToDollars = (value: number | null | undefined) => ((value || 0) / 100).toFixed(2);

const dollarsToCents = (value: string) => Math.round(Number(value) * 100);

const formatCurrency = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

const formatUsd = (value: number | null | undefined) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);

const formatDate = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(value))
    : "Never";

const formatGameTime = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));

const formatOdds = (price?: number) => {
  if (price === undefined || price === null) return "-";
  return price > 0 ? `+${price}` : String(price);
};

const formatPercent = (value?: number) => (Number.isFinite(value) ? `${value.toFixed(2)}%` : "-");

const formatSource = (source: "cache" | "espn" | "unknown") => {
  if (source === "espn") return "ESPN";
  if (source === "cache") return "Saved";
  return "Unknown";
};

const formatModelName = (model?: string) => {
  if (!model) return "-";
  if (model === "gemini-3-pro-preview") return "Gemini 3 Pro";
  if (model === "gemini-3.1-pro-preview") return "Gemini 3.1 Pro";
  if (model === "gemini-2.5-pro") return "Gemini 2.5 Pro";
  if (model === "gemini-2.5-flash") return "Gemini 2.5 Flash";
  return model;
};

const normalizeName = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\b(women|womens)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

const findOddsForGame = (game: SlateGame, oddsGames: OddsGame[]) => {
  const home = normalizeName(game.homeTeam.name);
  const away = normalizeName(game.awayTeam.name);
  return oddsGames.find((odds) => normalizeName(odds.home_team) === home && normalizeName(odds.away_team) === away) || null;
};

const findMarket = (book: Bookmaker, key: "h2h" | "spreads" | "totals") =>
  book.markets.find((market) => market.key === key);

const getBookLineSummary = (book: Bookmaker, game: SlateGame) => {
  const away = game.awayTeam.name;
  const home = game.homeTeam.name;
  const h2h = findMarket(book, "h2h");
  const spreads = findMarket(book, "spreads");
  const totals = findMarket(book, "totals");
  const awayMl = h2h?.outcomes.find((outcome) => normalizeName(outcome.name) === normalizeName(away));
  const homeMl = h2h?.outcomes.find((outcome) => normalizeName(outcome.name) === normalizeName(home));
  const awaySpread = spreads?.outcomes.find((outcome) => normalizeName(outcome.name) === normalizeName(away));
  const homeSpread = spreads?.outcomes.find((outcome) => normalizeName(outcome.name) === normalizeName(home));
  const over = totals?.outcomes.find((outcome) => outcome.name.toLowerCase() === "over");
  const under = totals?.outcomes.find((outcome) => outcome.name.toLowerCase() === "under");

  return {
    awayMl: formatOdds(awayMl?.price),
    homeMl: formatOdds(homeMl?.price),
    awaySpread: awaySpread ? `${awaySpread.point ?? "-"} (${formatOdds(awaySpread.price)})` : "-",
    homeSpread: homeSpread ? `${homeSpread.point ?? "-"} (${formatOdds(homeSpread.price)})` : "-",
    total: over || under ? `O ${over?.point ?? "-"} (${formatOdds(over?.price)}) / U ${under?.point ?? "-"} (${formatOdds(under?.price)})` : "-",
  };
};

const getSuggestedWager = (analysis: AnalysisResult | undefined, budgetCents: number | null) => {
  if (!analysis || !budgetCents || analysis.recommendation === "PASS" || analysis.dataQuality === "WEAK") {
    return { label: "No wager", amountCents: 0 };
  }

  if (analysis.recommendation === "BET" && analysis.confidence >= 75 && analysis.dataQuality === "STRONG") {
    return { label: "Full position", amountCents: Math.round(budgetCents * 0.05) };
  }

  if (analysis.recommendation === "BET" || analysis.confidence >= 65) {
    return { label: "Standard position", amountCents: Math.round(budgetCents * 0.03) };
  }

  return { label: "Small position", amountCents: Math.round(budgetCents * 0.01) };
};

const getPassReason = (analysis?: AnalysisResult) => {
  if (!analysis) return "Analysis has not run.";
  if (analysis.recommendation !== "PASS") return "Not a pass.";
  if (analysis.passReasonCode === "STATS_CONFLICT") {
    const candidate = getCandidateSummary(analysis);
    const detail = analysis.reasoning || analysis.marketValue || "The statistical profile does not support the priced candidate.";
    return `Candidate rejected: ${candidate} showed market value, but the matchup profile points the other way. ${detail}`;
  }
  return analysis.passReasonCode
    ? `${analysis.passReasonCode}: ${analysis.reasoning || analysis.marketValue || "No playable edge found."}`
    : analysis.reasoning || analysis.marketValue || "No playable edge found.";
};

const getCandidateSummary = (analysis?: AnalysisResult) => {
  if (!analysis?.selectedMarket || !analysis.selectedSide) return "No priced candidate selected.";
  const point = analysis.selectedPoint !== undefined ? ` ${analysis.selectedPoint}` : "";
  const odds = analysis.selectedOdds !== undefined ? ` ${formatOdds(analysis.selectedOdds)}` : "";
  const edge = analysis.edgePercent !== undefined ? ` | edge ${analysis.edgePercent.toFixed(2)}%` : "";
  const book = analysis.selectedBook ? ` at ${analysis.selectedBook}` : "";
  return `${analysis.selectedSide} ${analysis.selectedMarket}${point}${odds}${book}${edge}`;
};

const getNarrativeGradeLabel = (grade: string) => {
  if (grade === "HARD_FACT") return "Hard fact";
  if (grade === "SUPPORTED_ANGLE") return "Supported angle";
  return "Soft narrative";
};

const getNarrativeDirectionLabel = (direction: string) => {
  if (direction === "supports_candidate") return "Supports";
  if (direction === "opposes_candidate") return "Opposes";
  return "Neutral";
};

const getCandidateBoard = (analysis?: AnalysisResult) => analysis?.candidateBoard?.slice(0, 6) || [];

const indexAnalysis = (results: AnalysisResult[]) =>
  results.reduce<Record<string, AnalysisResult>>((acc, result) => {
    acc[result.gameId] = result;
    return acc;
  }, {});

const Badge = ({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "good" | "warn" | "bad" }) => (
  <span className={`wnba-badge wnba-badge-${tone}`}>{children}</span>
);

export default function WnbaDashboard() {
  const { addToast } = useToast();
  const toast = createToastHelpers(addToast);

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [workState, setWorkState] = useState<WorkState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [budgetDraft, setBudgetDraft] = useState("");
  const [slate, setSlate] = useState<SlateGame[]>([]);
  const [slateSource, setSlateSource] = useState<"cache" | "espn" | "unknown">("unknown");
  const [oddsCache, setOddsCache] = useState<OddsCacheState>({ source: "unknown", fetchedAt: null, games: [] });
  const [quota, setQuota] = useState<QuotaResponse | null>(null);
  const [analysisByGameId, setAnalysisByGameId] = useState<Record<string, AnalysisResult>>({});
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const budgetCents = session?.budgetCents ?? null;
  const needsBudget = Boolean(session?.needsBudget);

  const mergedGames = useMemo(
    () =>
      slate.map((game) => ({
        game,
        odds: findOddsForGame(game, oddsCache.games),
        analysis: analysisByGameId[game.id],
      })),
    [analysisByGameId, oddsCache.games, slate],
  );

  const loadDashboard = async () => {
    setLoadState("loading");
    setError(null);

    try {
      const sessionResponse = await backendApi.getTodaySession();
      setSession(sessionResponse);
      setBudgetDraft(centsToDollars(sessionResponse.budgetCents));

      const quotaResponse = await backendApi.getQuota();
      setQuota(quotaResponse);

      const slateResponse = await backendApi.getWnbaSlate();
      setSlate(slateResponse.games);
      setSlateSource(slateResponse.source);

      const analysisResponse = await backendApi.getWnbaAnalysis();
      setAnalysisByGameId(indexAnalysis(analysisResponse.results));

      try {
        const oddsResponse = await backendApi.getWnbaOddsCache();
        setOddsCache({
          source: oddsResponse.source,
          fetchedAt: oddsResponse.fetchedAt || null,
          games: oddsResponse.games,
        });
      } catch (oddsError) {
        if (oddsError instanceof ApiError && oddsError.status === 409) {
          setOddsCache({ source: "missing", fetchedAt: null, games: [] });
        } else {
          throw oddsError;
        }
      }

      setLoadState("ready");
    } catch (loadError) {
      const message =
        loadError instanceof ApiError && loadError.status === 500
          ? "Could not load today's WNBA slate."
          : loadError instanceof TypeError
            ? "The local app service is not running. Start it, then reload this page."
            : loadError instanceof Error
              ? loadError.message
              : "Failed to load dashboard.";
      setError(message);
      setLoadState("error");
      toast.showError(message);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const saveBudget = async () => {
    const nextBudgetCents = dollarsToCents(budgetDraft);
    if (!Number.isFinite(nextBudgetCents) || nextBudgetCents <= 0) {
      toast.showError("Enter a daily budget greater than zero.");
      return;
    }

    try {
      const nextSession = await backendApi.setBudget(nextBudgetCents);
      setSession(nextSession);
      setBudgetDraft(centsToDollars(nextSession.budgetCents));
      toast.showSuccess("Daily budget saved.");
    } catch (saveError) {
      toast.showError(saveError instanceof Error ? saveError.message : "Failed to save budget.");
    }
  };

  const getOverrideReason = (message: string) => {
    const reason = window.prompt(`${message}\n\nEnter an override reason. Minimum 10 characters.`);
    if (reason === null) return null;
    const trimmed = reason.trim();
    if (trimmed.length < 10) {
      toast.showError("Override reason must be at least 10 characters.");
      return null;
    }
    return trimmed;
  };

  const refreshOdds = async (overrideReason?: string) => {
    if (!overrideReason) {
      const shouldRefresh = window.confirm(
        "Refresh WNBA odds now? This uses API credits; exact cost is shown after refresh.",
      );
      if (!shouldRefresh) return;
    }

    const dailyLimitReached =
      (quota?.quotaPolicy.oddsRefreshesToday || 0) >= (quota?.quotaPolicy.maxOddsRefreshesPerEtDay || 1);
    const reason =
      overrideReason ||
      (dailyLimitReached
        ? getOverrideReason("Odds have already been refreshed once for this Eastern date.")
        : undefined);
    if (reason === null) return;

    setWorkState("refreshing-odds");
    try {
      const oddsResponse = await backendApi.refreshWnbaOdds(reason);
      const quotaResponse = await backendApi.getQuota();
      setOddsCache({
        source: oddsResponse.source,
        fetchedAt: oddsResponse.fetchedAt || null,
        games: oddsResponse.games,
      });
      setQuota(quotaResponse);
      toast.showSuccess("Odds refreshed.");
    } catch (refreshError) {
      if (refreshError instanceof ApiError && refreshError.code === "GUARDRAIL_OVERRIDE_REQUIRED") {
        const retryReason = getOverrideReason(refreshError.message);
        if (retryReason) {
          await refreshOdds(retryReason);
        }
      } else {
        toast.showError(refreshError instanceof Error ? refreshError.message : "Failed to refresh odds.");
      }
    } finally {
      setWorkState("idle");
    }
  };

  const analyzeAllGames = async (overrideReason?: string) => {
    setAnalysisError(null);
    if (needsBudget) {
      toast.showError("Set today's budget before analyzing games.");
      return;
    }
    if (oddsCache.games.length === 0) {
      toast.showError("Refresh odds before analyzing games.");
      return;
    }

    const analyzeLimitReached =
      (quota?.quotaPolicy.analyzeAllRunsToday || 0) >= (quota?.quotaPolicy.maxAnalyzeAllPerSlate || 1);
    const hardStopped = Boolean(quota?.gemini.isHardStopped);
    const reason =
      overrideReason ||
      (analyzeLimitReached || hardStopped
        ? getOverrideReason(
            hardStopped
              ? `Estimated Gemini spend is already at ${formatUsd(quota?.gemini.week.estimatedCostUsd)} this week.`
              : "Analyze All has already run for this WNBA Eastern-date slate.",
          )
        : undefined);
    if (reason === null) return;

    setWorkState("analyzing");
    try {
      const response = await backendApi.analyzeAll(reason);
      const quotaResponse = await backendApi.getQuota();
      setAnalysisByGameId(indexAnalysis(response.results));
      setQuota(quotaResponse);
      toast.showSuccess(`Analyzed ${response.count} games.`);
    } catch (analyzeError) {
      if (analyzeError instanceof ApiError && analyzeError.code === "GUARDRAIL_OVERRIDE_REQUIRED") {
        const retryReason = getOverrideReason(analyzeError.message);
        if (retryReason) {
          await analyzeAllGames(retryReason);
        }
      } else {
        const message = analyzeError instanceof Error ? analyzeError.message : "Failed to analyze games.";
        setAnalysisError(message);
        toast.showError(message);
      }
    } finally {
      setWorkState("idle");
    }
  };

  const oddsCount = quota?.usage.odds?.count || 0;
  const geminiCount = quota?.usage.gemini?.count || 0;
  const oddsDailyLimitReached =
    (quota?.quotaPolicy.oddsRefreshesToday || 0) >= (quota?.quotaPolicy.maxOddsRefreshesPerEtDay || 1);
  const analyzeAllLimitReached =
    (quota?.quotaPolicy.analyzeAllRunsToday || 0) >= (quota?.quotaPolicy.maxAnalyzeAllPerSlate || 1);
  const geminiWeekSpend = quota?.gemini.week.estimatedCostUsd || 0;
  const geminiWeekCalls = quota?.gemini.week.calls || 0;
  const geminiTodayCalls = quota?.gemini.today.calls || 0;
  const savedAnalysisCount = Object.keys(analysisByGameId).length;
  const costWarnings = [
    quota?.gemini.isHardStopped
      ? `Gemini hard stop reached at ${formatUsd(geminiWeekSpend)} this week. Override reason required.`
      : quota?.gemini.isWarning
        ? `Gemini warning threshold reached at ${formatUsd(geminiWeekSpend)} this week.`
        : null,
    oddsDailyLimitReached ? "Odds refresh limit reached for this Eastern date. Override reason required." : null,
    analyzeAllLimitReached ? "Analyze All already ran for this WNBA slate. Override reason required." : null,
  ].filter((warning): warning is string => Boolean(warning));
  const cacheLabel =
    oddsCache.source === "odds-api"
      ? "Fresh"
      : oddsCache.source === "cache"
        ? "Saved"
        : oddsCache.source === "missing"
          ? "Not saved"
          : "Unknown";

  return (
    <div className="wnba-dashboard">
      {needsBudget && (
        <div className="wnba-modal-backdrop">
          <div className="wnba-modal">
            <div className="wnba-modal-heading">
              <div className="wnba-icon-box">
                <DollarSign size={20} />
              </div>
              <div>
                <h2>Set Today&apos;s WNBA Budget</h2>
                <p>
                  No budget is set for {session?.dateEt || "today"}. Suggested wagers stay disabled until this is set.
                </p>
              </div>
            </div>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={budgetDraft}
              onChange={(event) => setBudgetDraft(event.target.value)}
              className="wnba-input"
              placeholder="Daily budget"
            />
            <button onClick={saveBudget} className="wnba-button wnba-button-primary wnba-button-full">
              Save Budget
            </button>
          </div>
        </div>
      )}

      <main className="wnba-shell">
        <header className="wnba-header">
          <div>
            <div className="wnba-kicker">
              <Target size={16} />
              EdgeLab WNBA
            </div>
            <h1>Today&apos;s Dashboard</h1>
            <p>
              Today&apos;s slate, saved odds, request usage, and WNBA recommendations. Odds refresh is manual so the monthly limit stays under control.
            </p>
          </div>

          <div className="wnba-actions">
            <button
              onClick={loadDashboard}
              disabled={workState !== "idle" || loadState === "loading"}
              className="wnba-button wnba-button-secondary"
            >
              <RefreshCw size={16} className={loadState === "loading" ? "wnba-spin" : ""} />
              Reload
            </button>
            <button
              onClick={() => refreshOdds()}
              disabled={workState !== "idle"}
              className="wnba-button wnba-button-secondary"
            >
              {workState === "refreshing-odds" ? <Loader2 size={16} className="wnba-spin" /> : <RefreshCw size={16} />}
              Refresh Odds
            </button>
            <button
              onClick={() => analyzeAllGames()}
              disabled={
                workState !== "idle" ||
                needsBudget ||
                slate.length === 0 ||
                oddsCache.games.length === 0 ||
                (analyzeAllLimitReached && savedAnalysisCount > 0)
              }
              className="wnba-button wnba-button-primary"
              title={analyzeAllLimitReached && savedAnalysisCount > 0 ? "Today's analysis is already saved. Reload will keep it visible." : undefined}
            >
              {workState === "analyzing" ? <Loader2 size={16} className="wnba-spin" /> : <BarChart3 size={16} />}
              {workState === "analyzing"
                ? "Analyzing Games..."
                : analyzeAllLimitReached && savedAnalysisCount > 0
                  ? "Analysis Saved"
                  : "Analyze All Games"}
            </button>
          </div>
        </header>

        <section className="wnba-guardrails-panel">
          <div className="wnba-guardrails-heading">
            <div>
              <div className="wnba-card-label">
                <ShieldAlert size={16} />
                Cost Guardrails
              </div>
              <h2>{formatModelName(quota?.analysisModel)}</h2>
            </div>
            <Badge tone={quota?.gemini.isHardStopped ? "bad" : quota?.gemini.isWarning ? "warn" : "good"}>
              {quota?.gemini.isHardStopped ? "Hard stop" : quota?.gemini.isWarning ? "Warning" : "Within limits"}
            </Badge>
          </div>

          <div className="wnba-guardrails-grid">
            <div>
              <span>Odds credits</span>
              <strong>
                {quota?.oddsCredits
                  ? `${quota.oddsCredits.requestsUsed ?? "-"} used / ${quota.oddsCredits.requestsRemaining ?? "-"} left`
                  : "Unknown until refresh"}
              </strong>
              <small>Last refresh cost: {quota?.oddsCredits?.requestsLast ?? "unknown"}</small>
            </div>
            <div>
              <span>Gemini calls</span>
              <strong>{geminiTodayCalls} today / {geminiWeekCalls} week</strong>
              <small>Week starts {quota?.weekEt || "-"}</small>
            </div>
            <div>
              <span>Estimated Gemini spend</span>
              <strong>{formatUsd(geminiWeekSpend)}</strong>
              <small>Warning {formatUsd(quota?.gemini.warningThresholdUsd)} | stop {formatUsd(quota?.gemini.hardStopUsd)}</small>
            </div>
          </div>

          {costWarnings.length > 0 && (
            <div className="wnba-guardrails-warnings">
              {costWarnings.map((warning) => (
                <div key={warning}>
                  <AlertTriangle size={15} />
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="wnba-summary-grid">
          <div className="wnba-summary-card">
            <div className="wnba-card-label">
              <CalendarDays size={16} />
              Session
            </div>
            <div className="wnba-card-value">{session?.dateEt || "-"}</div>
            <div className="wnba-card-note">Schedule source: {formatSource(slateSource)}</div>
          </div>
          <div className="wnba-summary-card">
            <div className="wnba-card-label">
              <DollarSign size={16} />
              Daily Budget
            </div>
            <div className="wnba-card-value">{budgetCents ? formatCurrency(budgetCents) : "Required"}</div>
            <div className="wnba-card-note">Used for today&apos;s wager sizing</div>
          </div>
          <div className="wnba-summary-card">
            <div className="wnba-card-label">
              <Clock size={16} />
              Last Odds Fetch
            </div>
            <div className="wnba-card-value">{formatDate(quota?.oddsLastFetchAt || oddsCache.fetchedAt)}</div>
            <div className="wnba-card-note">{cacheLabel}</div>
          </div>
          <div className="wnba-summary-card">
            <div className="wnba-card-label">
              <BarChart3 size={16} />
              Usage
            </div>
            <div className="wnba-card-value">{oddsCount} odds / {geminiCount} AI</div>
            <div className="wnba-card-note">Today&apos;s request count</div>
          </div>
          <div className="wnba-summary-card">
            <div className="wnba-card-label">
              <CheckCircle2 size={16} />
              AI Model
            </div>
            <div className="wnba-card-value">{formatModelName(quota?.analysisModel)}</div>
            <div className="wnba-card-note">Pro analysis model</div>
          </div>
        </section>

        {loadState === "error" && (
          <div className="wnba-alert wnba-alert-bad">
            {error}
          </div>
        )}

        {oddsCache.source === "missing" && (
          <div className="wnba-alert wnba-alert-warn">
            <div className="wnba-alert-main">
              <AlertTriangle size={16} />
              <span>
                No saved WNBA odds exist for today. The slate is loaded, but sportsbook lines and analysis require a manual odds refresh.
              </span>
            </div>
            <button
              type="button"
              onClick={() => refreshOdds()}
              disabled={workState !== "idle"}
              className="wnba-alert-action"
            >
              Refresh Odds - uses API credits
            </button>
          </div>
        )}

        {analysisError && (
          <div className="wnba-alert wnba-alert-bad">
            {analysisError}
          </div>
        )}

        <section className="wnba-games">
          {loadState === "loading" ? (
            <div className="wnba-empty">
              Loading today&apos;s WNBA session.
            </div>
          ) : mergedGames.length === 0 ? (
            <div className="wnba-empty">
              No WNBA games found for today.
            </div>
          ) : (
            mergedGames.map(({ game, odds, analysis }) => {
              const suggestedWager = getSuggestedWager(analysis, budgetCents);
              const recommendationTone = analysis?.recommendation === "BET" ? "good" : analysis?.recommendation === "LEAN" ? "warn" : "bad";
              const books = odds?.bookmakers.slice().sort((a, b) => BOOK_ORDER.indexOf(a.key) - BOOK_ORDER.indexOf(b.key)) || [];

              return (
                <article key={game.id} className="wnba-game-card">
                  <div className="wnba-game-top">
                    <div>
                      <div className="wnba-badge-row">
                        <Badge>{formatGameTime(game.date)} ET</Badge>
                        <Badge tone={odds ? "good" : "warn"}>{odds ? "Odds saved" : "No odds"}</Badge>
                        <Badge tone={analysis ? recommendationTone : "neutral"}>{analysis?.recommendation || "Not analyzed"}</Badge>
                      </div>
                      <h2>
                        {game.awayTeam.name} at {game.homeTeam.name}
                      </h2>
                      <p>{game.status}{game.venue ? ` | ${game.venue}` : ""}</p>
                    </div>

                    <div className="wnba-metrics">
                      <div className="wnba-metric">
                        <div>Wager Confidence</div>
                        <strong>{analysis ? `${analysis.confidence}/100` : "-"}</strong>
                      </div>
                      <div className="wnba-metric">
                        <div>Data Quality</div>
                        <strong>{analysis?.dataQuality || "-"}</strong>
                      </div>
                      <div className="wnba-metric">
                        <div>Suggested Wager</div>
                        <strong>{suggestedWager.amountCents ? formatCurrency(suggestedWager.amountCents) : "$0.00"}</strong>
                      </div>
                      <div className="wnba-metric">
                        <div>Position</div>
                        <strong>{suggestedWager.label}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="wnba-analysis-grid">
                    <div className="wnba-analysis-box">
                      <div>Market Value</div>
                      <p>{analysis?.marketValue || "Awaiting analysis."}</p>
                    </div>
                    <div className="wnba-analysis-box">
                      <div>Priced Candidate</div>
                      <p>{getCandidateSummary(analysis)}</p>
                    </div>
                    <div className="wnba-analysis-box">
                      <div>Pass Reason</div>
                      <p>{getPassReason(analysis)}</p>
                    </div>
                    <div className="wnba-analysis-box">
                      <div>Reasoning</div>
                      <p>{analysis?.reasoning || "Analysis has not run."}</p>
                    </div>
                  </div>

                  {(getCandidateBoard(analysis).length > 0 || analysis?.narrativeSignals?.length) ? (
                    <div className="wnba-context-grid">
                      <div className="wnba-context-panel">
                        <div className="wnba-lines-heading">
                          <div>Candidate Board</div>
                          <span>ML / spread / total</span>
                        </div>
                        {getCandidateBoard(analysis).length > 0 ? (
                          <div className="wnba-candidate-list">
                            {getCandidateBoard(analysis).map((candidate) => (
                              <div key={candidate.candidateId} className="wnba-candidate-row">
                                <div>
                                  <strong>
                                    {candidate.side} {candidate.market}
                                    {candidate.point !== undefined ? ` ${candidate.point}` : ""}
                                  </strong>
                                  <span>{candidate.bookTitle} {formatOdds(candidate.odds)}</span>
                                </div>
                                <div>
                                  <span>Edge</span>
                                  <strong>{formatPercent(candidate.edgePercent)}</strong>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="wnba-muted">No priced candidate board saved for this analysis.</div>
                        )}
                      </div>

                      <div className="wnba-context-panel">
                        <div className="wnba-lines-heading">
                          <div>News & Narrative</div>
                          <span>{analysis?.narrativeSignals?.length || 0} signals</span>
                        </div>
                        {analysis?.narrativeSignals?.length ? (
                          <div className="wnba-signal-list">
                            {analysis.narrativeSignals.map((signal, index) => (
                              <div key={`${signal.category}-${index}`} className="wnba-signal-row">
                                <div className="wnba-signal-tags">
                                  <Badge tone={signal.direction === "supports_candidate" ? "good" : signal.direction === "opposes_candidate" ? "bad" : "neutral"}>
                                    {getNarrativeDirectionLabel(signal.direction)}
                                  </Badge>
                                  <Badge tone={signal.grade === "HARD_FACT" ? "good" : signal.grade === "SUPPORTED_ANGLE" ? "warn" : "neutral"}>
                                    {getNarrativeGradeLabel(signal.grade)}
                                  </Badge>
                                </div>
                                <p>{signal.summary}</p>
                                {signal.source ? <span>{signal.source}</span> : null}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="wnba-muted">No source-backed narrative signals saved for this analysis.</div>
                        )}
                      </div>
                    </div>
                  ) : null}

                  <div className="wnba-lines-panel">
                    <div className="wnba-lines-heading">
                      <div>Supported sportsbook lines</div>
                      <span>{books.length} books</span>
                    </div>

                    {books.length > 0 ? (
                      <div className="wnba-book-grid">
                        {books.map((book) => {
                          const line = getBookLineSummary(book, game);
                          return (
                            <div key={book.key} className="wnba-book-card">
                              <div className="wnba-book-head">
                                <strong>{book.title}</strong>
                                <span>{book.lastUpdate ? formatDate(book.lastUpdate) : ""}</span>
                              </div>
                              <div className="wnba-line-list">
                                <div>{game.awayTeam.name}: ML {line.awayMl} | Spread {line.awaySpread}</div>
                                <div>{game.homeTeam.name}: ML {line.homeMl} | Spread {line.homeSpread}</div>
                                <div>Total: {line.total}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="wnba-muted">Refresh odds to load supported sportsbook lines for this game.</div>
                    )}

                    {analysis?.riskFactors?.length ? (
                      <div className="wnba-risk">
                        Risk factors: {analysis.riskFactors.join("; ")}
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })
          )}
        </section>
      </main>
    </div>
  );
}
