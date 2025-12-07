import { BookLines, Sport } from '../types';

// Fallback key added explicitly to prevent runtime errors if build config replacement fails
const API_KEY = process.env.ODDS_API_KEY || "a45454608c6f67f3fc98630b07923484";
const BASE_URL = 'https://api.the-odds-api.com/v4/sports';
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

const SPORT_KEYS: Record<Sport, string> = {
  'NBA': 'basketball_nba',
  'NFL': 'americanfootball_nfl',
  'NHL': 'icehockey_nhl',
  'MLB': 'baseball_mlb',
  'CFB': 'americanfootball_ncaaf'
};

export const SOFT_BOOK_KEYS = [
  'draftkings', 'fanduel', 'betmgm', 'williamhill_us', 'betrivers', 'bovada'
];

export const BOOK_DISPLAY_NAMES: Record<string, string> = {
  'draftkings': 'DraftKings',
  'fanduel': 'FanDuel',
  'betmgm': 'BetMGM',
  'williamhill_us': 'Caesars',
  'betrivers': 'BetRivers',
  'bovada': 'Bovada',
  'pinnacle': 'Pinnacle'
};

interface OddsCache {
  [key: string]: {
    timestamp: number;
    data: any[];
  };
}

const cache: OddsCache = {};

const formatPoint = (point: number): string => {
  return point > 0 ? `+${point}` : `${point}`;
};

const formatOdds = (price: number): string => {
  return price > 0 ? `+${price}` : `${price}`;
};

export const fetchOddsForSport = async (sport: Sport): Promise<any[]> => {
  const sportKey = SPORT_KEYS[sport];
  if (!sportKey) {
    console.warn(`Sport ${sport} not supported by Odds API`);
    return [];
  }

  const now = Date.now();
  if (cache[sportKey] && (now - cache[sportKey].timestamp < CACHE_DURATION)) {
    console.log(`Returning cached odds for ${sport}`);
    return cache[sportKey].data;
  }

  if (!API_KEY) {
    console.error("ODDS_API_KEY is missing");
    return [];
  }

  // Request US and EU regions to cover US books and Pinnacle (often EU)
  const url = `${BASE_URL}/${sportKey}/odds?apiKey=${API_KEY}&regions=us,eu&markets=h2h,spreads,totals&oddsFormat=american`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      // 401 usually means quota exceeded or bad key
      if (response.status === 401) {
        console.warn("Odds API Key invalid or expired");
      }
      return [];
    }
    
    const data = await response.json();
    
    // Update cache
    cache[sportKey] = {
      timestamp: now,
      data: data
    };
    
    return data;
  } catch (error) {
    console.error("Failed to fetch odds:", error);
    return [];
  }
};

export const fetchOddsForGame = async (sport: Sport, gameId: string): Promise<any> => {
  const sportKey = SPORT_KEYS[sport];
  if (!sportKey || !API_KEY) return null;

  // Use the specific event endpoint
  const url = `${BASE_URL}/${sportKey}/events/${gameId}/odds?apiKey=${API_KEY}&regions=us,eu&markets=h2h,spreads,totals&oddsFormat=american`;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.json();
  } catch (e) {
    console.error("Error fetching single game odds:", e);
    return null;
  }
};

export const getBookmakerLines = (gameData: any, bookmakerKey: string): BookLines | null => {
  if (!gameData || !gameData.bookmakers) return null;

  const bookmaker = gameData.bookmakers.find((b: any) => b.key === bookmakerKey);
  if (!bookmaker) return null;

  const homeTeam = gameData.home_team;
  const awayTeam = gameData.away_team;

  let spreadLineA = 'N/A';
  let spreadOddsA = 'N/A';
  let spreadLineB = 'N/A';
  let spreadOddsB = 'N/A';
  let totalLine = 'N/A';
  let totalOddsOver = 'N/A';
  let totalOddsUnder = 'N/A';
  let mlOddsA = 'N/A';
  let mlOddsB = 'N/A';

  // Moneyline (h2h)
  const h2hMarket = bookmaker.markets.find((m: any) => m.key === 'h2h');
  if (h2hMarket) {
    // Assuming 'away_team' in API maps to our Team A
    const outcomeA = h2hMarket.outcomes.find((o: any) => o.name === awayTeam);
    const outcomeB = h2hMarket.outcomes.find((o: any) => o.name === homeTeam);
    if (outcomeA) mlOddsA = formatOdds(outcomeA.price);
    if (outcomeB) mlOddsB = formatOdds(outcomeB.price);
  }

  // Spreads
  const spreadMarket = bookmaker.markets.find((m: any) => m.key === 'spreads');
  if (spreadMarket) {
    const outcomeA = spreadMarket.outcomes.find((o: any) => o.name === awayTeam);
    const outcomeB = spreadMarket.outcomes.find((o: any) => o.name === homeTeam);
    
    if (outcomeA) {
      spreadLineA = formatPoint(outcomeA.point);
      spreadOddsA = formatOdds(outcomeA.price);
    }
    if (outcomeB) {
      spreadLineB = formatPoint(outcomeB.point);
      spreadOddsB = formatOdds(outcomeB.price);
    }
  }

  // Totals
  const totalMarket = bookmaker.markets.find((m: any) => m.key === 'totals');
  if (totalMarket) {
    const over = totalMarket.outcomes.find((o: any) => o.name === 'Over');
    const under = totalMarket.outcomes.find((o: any) => o.name === 'Under');
    
    if (over) {
      totalLine = over.point.toString();
      totalOddsOver = formatOdds(over.price);
    }
    if (under) {
      if (totalLine === 'N/A') totalLine = under.point.toString();
      totalOddsUnder = formatOdds(under.price);
    }
  }

  return {
    bookName: BOOK_DISPLAY_NAMES[bookmakerKey] || bookmaker.title,
    spreadLineA,
    spreadOddsA,
    spreadLineB,
    spreadOddsB,
    totalLine,
    totalOddsOver,
    totalOddsUnder,
    mlOddsA,
    mlOddsB
  };
};