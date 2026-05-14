import { nowIso } from "../utils/time.js";
import type { SlateGame, WnbaDataPack, WnbaTeamAdvancedStats } from "../types.js";

const TRANSACTIONS_URL = "https://www.wnba.com/players/transactions";

export class WnbaDataService {
  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly season = String(new Date().getFullYear()),
    private readonly timeoutMs = 8000,
  ) {}

  async buildDataPack(dateEt: string, slate: SlateGame[]): Promise<WnbaDataPack> {
    const fetchedAt = nowIso();
    const sources: WnbaDataPack["sources"] = [];
    const teams: Record<string, WnbaTeamAdvancedStats> = {};
    const availabilityNotes: string[] = [];

    try {
      const stats = await this.fetchTeamAdvancedStats();
      for (const team of stats) {
        teams[normalizeTeamName(team.teamName)] = team;
      }
      sources.push({ name: "WNBA advanced team stats", url: this.teamStatsUrl, fetchedAt: nowIso(), status: "ok" });
    } catch (error) {
      sources.push({
        name: "WNBA advanced team stats",
        url: this.teamStatsUrl,
        fetchedAt: nowIso(),
        status: "error",
        note: error instanceof Error ? error.message : "Unable to fetch team advanced stats.",
      });
    }

    try {
      const notes = await this.fetchTransactionNotes(slate);
      availabilityNotes.push(...notes);
      sources.push({ name: "WNBA transactions", url: TRANSACTIONS_URL, fetchedAt: nowIso(), status: "ok" });
    } catch (error) {
      sources.push({
        name: "WNBA transactions",
        url: TRANSACTIONS_URL,
        fetchedAt: nowIso(),
        status: "error",
        note: error instanceof Error ? error.message : "Unable to fetch transactions.",
      });
    }

    const slateTeamNames = slate.flatMap((game) => [game.homeTeam.name, game.awayTeam.name]);
    const matchedTeams = slateTeamNames.filter((teamName) => teams[normalizeTeamName(teamName)]).length;
    const freshness = matchedTeams === slateTeamNames.length && availabilityNotes.length > 0 ? "fresh" : matchedTeams > 0 ? "partial" : "missing";

    return {
      dateEt,
      fetchedAt,
      sources,
      teams,
      availabilityNotes,
      freshness,
    };
  }

  private async fetchTeamAdvancedStats(): Promise<WnbaTeamAdvancedStats[]> {
    const response = await this.fetchWithTimeout(this.teamStatsUrl, {
      headers: {
        Accept: "application/json, text/plain, */*",
        Origin: "https://www.wnba.com",
        Referer: "https://www.wnba.com/stats/team-stats-advanced",
        "User-Agent": "Mozilla/5.0 EdgeLab local WNBA analytics",
        "x-nba-stats-origin": "stats",
        "x-nba-stats-token": "true",
      },
    });
    if (!response.ok) {
      throw new Error(`WNBA stats fetch failed with ${response.status}`);
    }
    const data = (await response.json()) as any;
    const resultSet = data?.resultSets?.[0] || data?.resultSet;
    const headers = resultSet?.headers || [];
    const rows = resultSet?.rowSet || [];
    const index = (name: string) => headers.indexOf(name);

    return rows
      .map((row: any[]) => ({
        teamName: String(row[index("TEAM_NAME")] || ""),
        offensiveRating: readNumber(row[index("OFF_RATING")]),
        defensiveRating: readNumber(row[index("DEF_RATING")]),
        netRating: readNumber(row[index("NET_RATING")]),
        pace: readNumber(row[index("PACE")]),
        reboundPct: readNumber(row[index("REB_PCT")]),
        turnoverPct: readNumber(row[index("TM_TOV_PCT")]),
        freeThrowRate: readNumber(row[index("FTA_RATE")]),
        threePointRate: readNumber(row[index("FG3A_RATE")]),
      }))
      .filter((team: WnbaTeamAdvancedStats) => team.teamName);
  }

  private get teamStatsUrl() {
    const url = new URL("https://stats.wnba.com/stats/leaguedashteamstats");
    const params: Record<string, string> = {
      Conference: "",
      DateFrom: "",
      DateTo: "",
      Division: "",
      GameScope: "",
      GameSegment: "",
      LastNGames: "0",
      LeagueID: "10",
      Location: "",
      MeasureType: "Advanced",
      Month: "0",
      OpponentTeamID: "0",
      Outcome: "",
      PORound: "0",
      PaceAdjust: "N",
      PerMode: "Per100Possessions",
      Period: "0",
      PlayerExperience: "",
      PlayerPosition: "",
      PlusMinus: "N",
      Rank: "N",
      Season: this.season,
      SeasonSegment: "",
      SeasonType: "Regular Season",
      ShotClockRange: "",
      StarterBench: "",
      TeamID: "0",
      TwoWay: "0",
      VsConference: "",
      VsDivision: "",
    };
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }

  private async fetchTransactionNotes(slate: SlateGame[]) {
    const response = await this.fetchWithTimeout(TRANSACTIONS_URL, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "Mozilla/5.0 EdgeLab local WNBA analytics",
      },
    });
    if (!response.ok) {
      throw new Error(`WNBA transactions fetch failed with ${response.status}`);
    }

    const html = await response.text();
    const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const teamNames = new Set(slate.flatMap((game) => [game.homeTeam.name, game.awayTeam.name]));
    const notes = [...teamNames]
      .filter((teamName) => text.toLowerCase().includes(teamName.toLowerCase()))
      .map((teamName) => `${teamName}: official transaction page mentions this team; Gemini must verify current availability before recommending a bet.`);

    return notes.length > 0 ? notes : ["No slate-team transaction note found on the official WNBA transaction page snapshot."];
  }

  private async fetchWithTimeout(url: string, init: RequestInit = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal });
    } catch (error) {
      if ((error as any)?.name === "AbortError") {
        throw new Error(`Timed out after ${this.timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const normalizeTeamName = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\b(women|womens)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

const readNumber = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
