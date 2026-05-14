import { nowIso } from "../utils/time.js";
import type { OddsApiUsage, OddsGame } from "../types.js";

export const WNBA_ODDS_SPORT_KEY = "basketball_wnba";

export const SUPPORTED_BOOK_KEYS = new Set([
  "fliff",
  "fanduel",
  "draftkings",
  "betonlineag",
  "fanatics",
  "thescore",
]);

export const BOOK_DISPLAY_NAMES: Record<string, string> = {
  fliff: "Fliff",
  fanduel: "FanDuel",
  draftkings: "DraftKings",
  betonlineag: "BetOnline",
  fanatics: "Fanatics Sportsbook",
  thescore: "theScore Bet",
};

export class OddsService {
  constructor(
    private readonly apiKey: string | undefined,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async fetchWnbaOdds(): Promise<{ games: OddsGame[]; usage: OddsApiUsage }> {
    if (!this.apiKey) {
      throw new Error("ODDS_API_KEY is not configured");
    }

    const url = new URL(`https://api.the-odds-api.com/v4/sports/${WNBA_ODDS_SPORT_KEY}/odds`);
    url.searchParams.set("apiKey", this.apiKey);
    url.searchParams.set("regions", "us,us2");
    url.searchParams.set("markets", "h2h,spreads,totals");
    url.searchParams.set("oddsFormat", "american");

    const response = await this.fetchImpl(url);
    if (!response.ok) {
      throw new Error(`Odds API fetch failed with ${response.status}`);
    }

    const data = (await response.json()) as OddsGame[];
    return {
      games: data.map(filterSupportedBooks),
      usage: {
        provider: "odds-api",
        endpoint: `/v4/sports/${WNBA_ODDS_SPORT_KEY}/odds`,
        requestsUsed: readIntegerHeader(response.headers, "x-requests-used"),
        requestsRemaining: readIntegerHeader(response.headers, "x-requests-remaining"),
        requestsLast: readIntegerHeader(response.headers, "x-requests-last"),
        fetchedAt: nowIso(),
      },
    };
  }
}

export const filterSupportedBooks = (game: OddsGame): OddsGame => ({
  ...game,
  bookmakers: (game.bookmakers || [])
    .filter((book) => SUPPORTED_BOOK_KEYS.has(book.key))
    .map((book) => ({ ...book, title: BOOK_DISPLAY_NAMES[book.key] || book.title })),
});

const readIntegerHeader = (headers: Headers, key: string) => {
  const raw = headers.get(key);
  if (!raw) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : null;
};
