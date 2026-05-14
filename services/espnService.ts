
import { Game, Sport } from '../types';
import { SPORTS_CONFIG } from '../constants';

const BASE_URL = 'https://site.api.espn.com/apis/site/v2/sports';

const SOCCER_LEAGUES_ESPN = [
  'soccer/eng.1',
  'soccer/esp.1',
  'soccer/ger.1',
  'soccer/ita.1',
  'soccer/fra.1',
  'soccer/uefa.champions'
];

export const fetchGames = async (sport: Sport, date: string): Promise<Game[]> => {
  if (sport === 'SOCCER') {
    const allSoccer = await Promise.all(
      SOCCER_LEAGUES_ESPN.map(slug => fetchGamesFromSlug(slug, sport, date))
    );
    return allSoccer.flat();
  }

  // Map sport to ESPN endpoint structure
  let path = '';
  switch (sport) {
    case 'NBA': path = 'basketball/nba'; break;
    case 'WNBA': path = 'basketball/wnba'; break;
    case 'NFL': path = 'football/nfl'; break;
    case 'NHL': path = 'hockey/nhl'; break;
    case 'NCAAB': path = 'basketball/mens-college-basketball'; break;
    case 'SOCCER': path = 'soccer/eng.1'; break;
    default: path = 'basketball/nba';
  }

  return fetchGamesFromSlug(path, sport, date);
};

const fetchGamesFromSlug = async (path: string, sport: Sport, date: string): Promise<Game[]> => {
  const dateParam = date.replace(/-/g, '');
  const url = `${BASE_URL}/${path}/scoreboard?dates=${dateParam}`;

  try {
    const response = await fetch(url);
    if (!response.ok) return [];
    
    const data = await response.json();

    return (data.events || []).map((event: any): Game => {
      const competition = event.competitions[0];
      const home = competition.competitors.find((c: any) => c.homeAway === 'home');
      const away = competition.competitors.find((c: any) => c.homeAway === 'away');
      
      let spread = undefined;
      let total = undefined;
      let details = undefined;
      let draw = undefined;

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
          details,
          draw
        }
      };
    });
  } catch (error) {
    console.error(`Error fetching games for ${path}:`, error);
    return [];
  }
};
