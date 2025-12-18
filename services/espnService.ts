
import { Game, Sport } from '../types';
import { SPORTS_CONFIG } from '../constants';

const BASE_URL = 'https://site.api.espn.com/apis/site/v2/sports';

export const fetchGames = async (sport: Sport, date: string): Promise<Game[]> => {
  // Map sport to ESPN endpoint structure
  let path = '';
  switch (sport) {
    case 'NBA': path = 'basketball/nba'; break;
    case 'NFL': path = 'football/nfl'; break;
    case 'NHL': path = 'hockey/nhl'; break;
    case 'CFB': path = 'football/college-football'; break;
    default: path = 'basketball/nba';
  }

  const dateParam = date.replace(/-/g, '');
  const url = `${BASE_URL}/${path}/scoreboard?dates=${dateParam}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error('Network response was not ok');
    }
    const data = await response.json();

    return (data.events || []).map((event: any): Game => {
      const competition = event.competitions[0];
      const home = competition.competitors.find((c: any) => c.homeAway === 'home');
      const away = competition.competitors.find((c: any) => c.homeAway === 'away');
      
      let spread = undefined;
      let total = undefined;
      let details = undefined;

      if (competition.odds && competition.odds.length > 0) {
          details = competition.odds[0].details;
          spread = competition.odds[0].details;
          total = competition.odds[0].overUnder;
      }

      return {
        id: event.id,
        sport,
        date: event.date,
        status: event.status.type.shortDetail,
        period: event.status.period,
        clock: event.status.displayClock,
        homeTeam: {
          name: home.team.displayName,
          score: home.score,
          record: home.records?.[0]?.summary,
          logo: home.team.logo,
        },
        awayTeam: {
          name: away.team.displayName,
          score: away.score,
          record: away.records?.[0]?.summary,
          logo: away.team.logo,
        },
        odds: {
          spread,
          total,
          details
        }
      };
    });
  } catch (error) {
    console.error("Error fetching games:", error);
    return [];
  }
};
