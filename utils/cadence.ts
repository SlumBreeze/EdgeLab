import { Sport } from "../types";

export type CadenceStatus = "WAITING" | "FIRST" | "SECOND" | "LOCK" | "CLOSED" | "LIVE";

export const SPORT_CADENCE_OFFSETS: Record<
  Sport,
  { first: number; second: number; lock: number }
> = {
  NBA: { first: 90, second: 50, lock: 25 },
  NHL: { first: 105, second: 60, lock: 30 },
  NFL: { first: 150, second: 90, lock: 45 },
  Other: { first: 90, second: 50, lock: 25 },
};

/**
 * Returns the current cadence status for a game based on its start time.
 * @param commenceTime Date string or Date object of game start
 * @param sport Sport type
 * @returns CadenceStatus
 */
export const getCadenceStatus = (
  commenceTime: string | Date,
  sport: Sport
): CadenceStatus => {
  const start = new Date(commenceTime).getTime();
  const now = Date.now();
  const offsets = SPORT_CADENCE_OFFSETS[sport] || SPORT_CADENCE_OFFSETS.Other;

  // Convert offsets to milliseconds
  const firstMs = offsets.first * 60 * 1000;
  const secondMs = offsets.second * 60 * 1000;
  const lockMs = offsets.lock * 60 * 1000;

  const timeUntilStart = start - now;

  // Game has started (or is about to start within 1 min buffer)
  if (timeUntilStart <= -60000) return "LIVE"; // effectively closed for pre-game
  if (timeUntilStart <= 0) return "CLOSED";

  if (timeUntilStart <= lockMs) return "LOCK";
  if (timeUntilStart <= secondMs) return "SECOND";
  if (timeUntilStart <= firstMs) return "FIRST";

  return "WAITING";
};

/**
 * Returns true if the game is in ANY active scanning window (First, Second, or Lock).
 */
export const isScanWindowActive = (status: CadenceStatus): boolean => {
  return status === "FIRST" || status === "SECOND" || status === "LOCK";
};

/**
 * Returns a human-readable label for the current status
 */
export const getStatusLabel = (status: CadenceStatus): string => {
  switch (status) {
    case "WAITING": return "Waiting for Window";
    case "FIRST": return "First Window Open";
    case "SECOND": return "Second Window Open";
    case "LOCK": return "Lock Window Open";
    case "CLOSED": return "Closed";
    case "LIVE": return "Live / Closed";
  }
};

/**
 * Returns the color class for the status badge
 */
export const getStatusColor = (status: CadenceStatus): string => {
  switch (status) {
    case "WAITING": return "text-ink-text/40 bg-ink-base";
    case "FIRST": return "text-ink-accent bg-ink-accent/10 border-ink-accent/20";
    case "SECOND": return "text-amber-500 bg-amber-500/10 border-amber-500/20";
    case "LOCK": return "text-red-500 bg-red-500/10 border-red-500/20";
    case "CLOSED": return "text-ink-text/40 bg-ink-base line-through";
    case "LIVE": return "text-ink-text/40 bg-ink-base";
  }
};
