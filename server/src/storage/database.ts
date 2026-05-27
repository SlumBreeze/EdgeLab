import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { nowIso } from "../utils/time.js";
import type {
  AnalysisResult,
  ApiUsageKind,
  GeminiUsage,
  OddsApiUsage,
  OddsGame,
  Session,
  SlateGame,
  Sport,
  WnbaDataPack,
} from "../types.js";

export type Db = Database.Database;

export const openDatabase = (sqlitePath: string): Db => {
  fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });
  const db = new Database(sqlitePath);
  db.pragma("journal_mode = WAL");
  migrate(db);
  return db;
};

export const migrate = (db: Db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      date_et TEXT PRIMARY KEY,
      budget_cents INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS slate_cache (
      date_et TEXT NOT NULL,
      sport TEXT NOT NULL,
      data_json TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      PRIMARY KEY (date_et, sport)
    );

    CREATE TABLE IF NOT EXISTS odds_snapshots (
      date_et TEXT NOT NULL,
      sport TEXT NOT NULL,
      data_json TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      PRIMARY KEY (date_et, sport)
    );

    CREATE TABLE IF NOT EXISTS analysis_results (
      game_id TEXT NOT NULL,
      date_et TEXT NOT NULL,
      result_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (game_id, date_et)
    );

    CREATE TABLE IF NOT EXISTS api_usage (
      date_et TEXT NOT NULL,
      kind TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      last_used_at TEXT,
      PRIMARY KEY (date_et, kind)
    );

    CREATE TABLE IF NOT EXISTS odds_api_usage_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date_et TEXT NOT NULL,
      week_et TEXT NOT NULL,
      provider TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      requests_used INTEGER,
      requests_remaining INTEGER,
      requests_last INTEGER,
      fetched_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS gemini_usage_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date_et TEXT NOT NULL,
      week_et TEXT NOT NULL,
      model TEXT NOT NULL,
      game_id TEXT NOT NULL,
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      estimated_cost_usd REAL NOT NULL,
      used_fallback_tokens INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS analyze_all_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date_et TEXT NOT NULL,
      sport TEXT NOT NULL,
      game_count INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS guardrail_overrides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date_et TEXT NOT NULL,
      week_et TEXT NOT NULL,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      provider TEXT,
      sport TEXT,
      game_id TEXT,
      override_reason TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS wnba_data_packs (
      date_et TEXT PRIMARY KEY,
      data_json TEXT NOT NULL,
      freshness TEXT NOT NULL,
      fetched_at TEXT NOT NULL
    );
  `);
};

export class Store {
  constructor(private readonly db: Db) {}

  getOrCreateSession(dateEt: string): Session {
    const existing = this.db.prepare("SELECT * FROM sessions WHERE date_et = ?").get(dateEt) as any;
    if (existing) return mapSession(existing);

    const now = nowIso();
    this.db
      .prepare("INSERT INTO sessions (date_et, budget_cents, created_at, updated_at) VALUES (?, NULL, ?, ?)")
      .run(dateEt, now, now);
    return { dateEt, budgetCents: null, createdAt: now, updatedAt: now };
  }

  setBudget(dateEt: string, budgetCents: number): Session {
    this.getOrCreateSession(dateEt);
    const now = nowIso();
    this.db
      .prepare("UPDATE sessions SET budget_cents = ?, updated_at = ? WHERE date_et = ?")
      .run(budgetCents, now, dateEt);
    return this.getOrCreateSession(dateEt);
  }

  getSlate(dateEt: string, sport: Sport): { data: SlateGame[]; fetchedAt: string } | null {
    const row = this.db
      .prepare("SELECT data_json, fetched_at FROM slate_cache WHERE date_et = ? AND sport = ?")
      .get(dateEt, sport) as any;
    return row ? { data: JSON.parse(row.data_json), fetchedAt: row.fetched_at } : null;
  }

  saveSlate(dateEt: string, sport: Sport, data: SlateGame[]) {
    this.db
      .prepare(
        `INSERT INTO slate_cache (date_et, sport, data_json, fetched_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(date_et, sport) DO UPDATE SET data_json = excluded.data_json, fetched_at = excluded.fetched_at`,
      )
      .run(dateEt, sport, JSON.stringify(data), nowIso());
  }

  getOdds(dateEt: string, sport: Sport): { data: OddsGame[]; fetchedAt: string } | null {
    const row = this.db
      .prepare("SELECT data_json, fetched_at FROM odds_snapshots WHERE date_et = ? AND sport = ?")
      .get(dateEt, sport) as any;
    return row ? { data: JSON.parse(row.data_json), fetchedAt: row.fetched_at } : null;
  }

  saveOdds(dateEt: string, sport: Sport, data: OddsGame[]) {
    this.db
      .prepare(
        `INSERT INTO odds_snapshots (date_et, sport, data_json, fetched_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(date_et, sport) DO UPDATE SET data_json = excluded.data_json, fetched_at = excluded.fetched_at`,
      )
      .run(dateEt, sport, JSON.stringify(data), nowIso());
  }

  saveAnalysis(result: AnalysisResult) {
    this.db
      .prepare(
        `INSERT INTO analysis_results (game_id, date_et, result_json, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(game_id, date_et) DO UPDATE SET result_json = excluded.result_json, created_at = excluded.created_at`,
      )
      .run(result.gameId, result.dateEt, JSON.stringify(result), result.createdAt);
  }

  getAnalysis(dateEt: string, gameId: string): AnalysisResult | null {
    const row = this.db
      .prepare("SELECT result_json FROM analysis_results WHERE date_et = ? AND game_id = ?")
      .get(dateEt, gameId) as any;
    return row ? JSON.parse(row.result_json) : null;
  }

  getAnalyses(dateEt: string): AnalysisResult[] {
    const rows = this.db
      .prepare("SELECT result_json FROM analysis_results WHERE date_et = ? ORDER BY created_at ASC")
      .all(dateEt) as any[];
    return rows.map((row) => JSON.parse(row.result_json));
  }

  resetWnbaAnalysis(dateEt: string) {
    const deleteAnalyses = this.db.prepare("DELETE FROM analysis_results WHERE date_et = ?");
    const deleteAnalyzeAllRuns = this.db.prepare("DELETE FROM analyze_all_runs WHERE date_et = ? AND sport = 'WNBA'");
    const run = this.db.transaction(() => {
      const analyses = deleteAnalyses.run(dateEt).changes;
      const analyzeAllRuns = deleteAnalyzeAllRuns.run(dateEt).changes;
      return { analyses, analyzeAllRuns };
    });
    return run();
  }

  incrementUsage(dateEt: string, kind: ApiUsageKind, amount = 1) {
    this.db
      .prepare(
        `INSERT INTO api_usage (date_et, kind, count, last_used_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(date_et, kind) DO UPDATE SET count = count + excluded.count, last_used_at = excluded.last_used_at`,
      )
      .run(dateEt, kind, amount, nowIso());
  }

  getUsage(dateEt: string) {
    const rows = this.db.prepare("SELECT kind, count, last_used_at FROM api_usage WHERE date_et = ?").all(dateEt) as any[];
    return rows.reduce<Record<string, { count: number; lastUsedAt: string | null }>>((acc, row) => {
      acc[row.kind] = { count: row.count, lastUsedAt: row.last_used_at };
      return acc;
    }, {});
  }

  saveOddsApiUsage(dateEt: string, usage: OddsApiUsage) {
    this.db
      .prepare(
        `INSERT INTO odds_api_usage_events
          (date_et, week_et, provider, endpoint, requests_used, requests_remaining, requests_last, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        dateEt,
        getWeekStartDateEt(dateEt),
        usage.provider,
        usage.endpoint,
        usage.requestsUsed,
        usage.requestsRemaining,
        usage.requestsLast,
        usage.fetchedAt,
      );
  }

  saveGeminiUsage(dateEt: string, usage: GeminiUsage) {
    this.db
      .prepare(
        `INSERT INTO gemini_usage_events
          (date_et, week_et, model, game_id, input_tokens, output_tokens, estimated_cost_usd, used_fallback_tokens, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        dateEt,
        getWeekStartDateEt(dateEt),
        usage.model,
        usage.gameId,
        usage.inputTokens,
        usage.outputTokens,
        usage.estimatedCostUsd,
        usage.usedFallbackTokens ? 1 : 0,
        nowIso(),
      );
  }

  countOddsRefreshes(dateEt: string) {
    const eventRow = this.db
      .prepare("SELECT COUNT(*) AS count FROM odds_api_usage_events WHERE date_et = ? AND provider = 'odds-api'")
      .get(dateEt) as any;
    const legacyRow = this.db
      .prepare("SELECT count FROM api_usage WHERE date_et = ? AND kind = 'odds'")
      .get(dateEt) as any;
    return Math.max(Number(eventRow?.count || 0), Number(legacyRow?.count || 0));
  }

  getLatestOddsUsage() {
    const row = this.db
      .prepare(
        `SELECT provider, endpoint, requests_used, requests_remaining, requests_last, fetched_at
         FROM odds_api_usage_events
         WHERE provider = 'odds-api'
         ORDER BY fetched_at DESC, id DESC
         LIMIT 1`,
      )
      .get() as any;

    return row
      ? {
          provider: row.provider,
          endpoint: row.endpoint,
          requestsUsed: row.requests_used,
          requestsRemaining: row.requests_remaining,
          requestsLast: row.requests_last,
          fetchedAt: row.fetched_at,
        }
      : null;
  }

  getTodayGeminiUsage(dateEt: string) {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS calls, COALESCE(SUM(input_tokens), 0) AS input_tokens,
          COALESCE(SUM(output_tokens), 0) AS output_tokens,
          COALESCE(SUM(estimated_cost_usd), 0) AS estimated_cost_usd
         FROM gemini_usage_events
         WHERE date_et = ?`,
      )
      .get(dateEt) as any;
    return mapGeminiTotals(row);
  }

  getWeeklyTotals(dateEt: string) {
    const weekEt = getWeekStartDateEt(dateEt);
    const odds = this.db
      .prepare(
        `SELECT COUNT(*) AS calls, MAX(requests_used) AS requests_used,
          MIN(requests_remaining) AS requests_remaining,
          COALESCE(SUM(requests_last), 0) AS requests_last
         FROM odds_api_usage_events
         WHERE week_et = ? AND provider = 'odds-api'`,
      )
      .get(weekEt) as any;
    const gemini = this.db
      .prepare(
        `SELECT COUNT(*) AS calls, COALESCE(SUM(input_tokens), 0) AS input_tokens,
          COALESCE(SUM(output_tokens), 0) AS output_tokens,
          COALESCE(SUM(estimated_cost_usd), 0) AS estimated_cost_usd
         FROM gemini_usage_events
         WHERE week_et = ?`,
      )
      .get(weekEt) as any;

    return {
      weekEt,
      providers: {
        "odds-api": {
          calls: Number(odds?.calls || 0),
          requestsUsed: odds?.requests_used ?? null,
          requestsRemaining: odds?.requests_remaining ?? null,
          requestsLast: Number(odds?.requests_last || 0),
        },
        gemini: mapGeminiTotals(gemini),
      },
    };
  }

  recordAnalyzeAllRun(dateEt: string, sport: Sport, gameCount: number) {
    this.db
      .prepare("INSERT INTO analyze_all_runs (date_et, sport, game_count, created_at) VALUES (?, ?, ?, ?)")
      .run(dateEt, sport, gameCount, nowIso());
  }

  getLatestAnalyzeAllRun(dateEt: string, sport: Sport) {
    const row = this.db
      .prepare(
        `SELECT game_count, created_at
         FROM analyze_all_runs
         WHERE date_et = ? AND sport = ?
         ORDER BY created_at DESC, id DESC
         LIMIT 1`,
      )
      .get(dateEt, sport) as any;
    return row ? { gameCount: Number(row.game_count), createdAt: row.created_at as string } : null;
  }

  recordOverride(input: {
    dateEt: string;
    actor: string;
    action: string;
    provider?: string | null;
    sport?: Sport | null;
    gameId?: string | null;
    overrideReason: string;
  }) {
    this.db
      .prepare(
        `INSERT INTO guardrail_overrides
          (date_et, week_et, actor, action, provider, sport, game_id, override_reason, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.dateEt,
        getWeekStartDateEt(input.dateEt),
        input.actor,
        input.action,
        input.provider || null,
        input.sport || null,
        input.gameId || null,
        input.overrideReason,
        nowIso(),
      );
  }

  getWnbaDataPack(dateEt: string): { data: WnbaDataPack; fetchedAt: string } | null {
    const row = this.db
      .prepare("SELECT data_json, fetched_at FROM wnba_data_packs WHERE date_et = ?")
      .get(dateEt) as any;
    return row ? { data: JSON.parse(row.data_json), fetchedAt: row.fetched_at } : null;
  }

  saveWnbaDataPack(dateEt: string, data: WnbaDataPack) {
    this.db
      .prepare(
        `INSERT INTO wnba_data_packs (date_et, data_json, freshness, fetched_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(date_et) DO UPDATE SET
          data_json = excluded.data_json,
          freshness = excluded.freshness,
          fetched_at = excluded.fetched_at`,
      )
      .run(dateEt, JSON.stringify(data), data.freshness, data.fetchedAt);
  }
}

const mapSession = (row: any): Session => ({
  dateEt: row.date_et,
  budgetCents: row.budget_cents,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapGeminiTotals = (row: any) => ({
  calls: Number(row?.calls || 0),
  inputTokens: Number(row?.input_tokens || 0),
  outputTokens: Number(row?.output_tokens || 0),
  estimatedCostUsd: Number(row?.estimated_cost_usd || 0),
});

export const getWeekStartDateEt = (dateEt: string) => {
  const [year, month, day] = dateEt.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = date.getUTCDay();
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  date.setUTCDate(date.getUTCDate() - daysFromMonday);
  return date.toISOString().slice(0, 10);
};
