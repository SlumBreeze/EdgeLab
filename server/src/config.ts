import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

const cwd = process.cwd();
const projectRoot = path.basename(cwd).toLowerCase() === "server" ? path.resolve(cwd, "..") : cwd;

export type Config = {
  port: number;
  sqlitePath: string;
  oddsApiKey?: string;
  geminiApiKey?: string;
  geminiModel: string;
  allowedOrigin: string;
  geminiInputCostPerMillionTokens: number;
  geminiOutputCostPerMillionTokens: number;
  geminiFallbackInputTokens: number;
  geminiFallbackOutputTokens: number;
  geminiWeeklyWarningUsd: number;
  geminiWeeklyHardStopUsd: number;
  authRequired: boolean;
  supabaseUrl?: string;
  supabasePublishableKey?: string;
  allowedUserIds: string[];
};

export const loadConfig = (): Config => {
  const sqlitePath = process.env.SQLITE_PATH || "server/data/edgelab.sqlite";
  const production = process.env.NODE_ENV === "production";
  return {
    port: Number(process.env.PORT || 8787),
    sqlitePath: path.isAbsolute(sqlitePath) ? sqlitePath : path.resolve(projectRoot, sqlitePath),
    oddsApiKey: process.env.ODDS_API_KEY,
    geminiApiKey: process.env.GEMINI_API_KEY,
    geminiModel: process.env.GEMINI_MODEL || "gemini-3.1-pro-preview",
    allowedOrigin: process.env.ALLOWED_ORIGIN || "http://localhost:5173",
    geminiInputCostPerMillionTokens: readNumber("GEMINI_INPUT_COST_PER_MILLION_TOKENS", 2),
    geminiOutputCostPerMillionTokens: readNumber("GEMINI_OUTPUT_COST_PER_MILLION_TOKENS", 12),
    geminiFallbackInputTokens: readNumber("GEMINI_FALLBACK_INPUT_TOKENS", 6000),
    geminiFallbackOutputTokens: readNumber("GEMINI_FALLBACK_OUTPUT_TOKENS", 1200),
    geminiWeeklyWarningUsd: readNumber("GEMINI_WEEKLY_WARNING_USD", 5),
    geminiWeeklyHardStopUsd: readNumber("GEMINI_WEEKLY_HARD_STOP_USD", 8),
    authRequired: readBoolean("AUTH_REQUIRED", production),
    supabaseUrl: process.env.SUPABASE_URL,
    supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
    allowedUserIds: readList("ALLOWED_USER_IDS"),
  };
};

const readNumber = (key: string, fallback: number) => {
  const value = Number(process.env[key]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
};

const readBoolean = (key: string, fallback: boolean) => {
  const value = process.env[key]?.trim().toLowerCase();
  if (!value) return fallback;
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return fallback;
};

const readList = (key: string) =>
  (process.env[key] || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
