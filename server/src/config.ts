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
};

export const loadConfig = (): Config => {
  const sqlitePath = process.env.SQLITE_PATH || "server/data/edgelab.sqlite";
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
  };
};

const readNumber = (key: string, fallback: number) => {
  const value = Number(process.env[key]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
};
