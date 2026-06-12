import type { SlateGame } from "../types.js";

const ESPN_SCOREBOARDS = {
  WNBA: "https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/scoreboard",
  MLB: "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard",
} as const;

export class EspnService {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async fetchSlate(sport: keyof typeof ESPN_SCOREBOARDS, dateEt: string): Promise<SlateGame[]> {
    const dateParam = dateEt.replaceAll("-", "");
    const response = await this.fetchImpl(`${ESPN_SCOREBOARDS[sport]}?dates=${dateParam}`);
    if (!response.ok) {
      throw new Error(`ESPN ${sport} slate fetch failed with ${response.status}`);
    }

    const data = await response.json();
    return (data.events || []).map((event: any): SlateGame => {
      const competition = event.competitions?.[0];
      const home = competition?.competitors?.find((team: any) => team.homeAway === "home");
      const away = competition?.competitors?.find((team: any) => team.homeAway === "away");

      return {
        id: String(event.id),
        sport,
        date: event.date,
        status: event.status?.type?.shortDetail || "Scheduled",
        venue: competition?.venue?.fullName,
        homeTeam: {
          name: home?.team?.displayName || "Unknown Home",
          abbreviation: home?.team?.abbreviation,
          logo: home?.team?.logo,
          record: home?.records?.[0]?.summary,
        },
        awayTeam: {
          name: away?.team?.displayName || "Unknown Away",
          abbreviation: away?.team?.abbreviation,
          logo: away?.team?.logo,
          record: away?.records?.[0]?.summary,
        },
      };
    });
  }

  async fetchWnbaSlate(dateEt: string): Promise<SlateGame[]> {
    return this.fetchSlate("WNBA", dateEt);
  }

  async fetchMlbSlate(dateEt: string): Promise<SlateGame[]> {
    return this.fetchSlate("MLB", dateEt);
  }
}
