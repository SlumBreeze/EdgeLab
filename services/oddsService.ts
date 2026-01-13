
import { BookLines, Sport } from '../types';

// UPDATED: Hardcoded fallback removed to improve security
const API_KEY = import.meta.env.VITE_ODDS_API_KEY;
const BASE_URL = 'https://api.the-odds-api.com/v4/sports';

// Cache Duration: 60 minutes (keeps "Scout" free for an hour)
const CACHE_DURATION = 60 * 60 * 1000; 

const SPORT_KEYS: Record<Sport, string> = {
  'NBA': 'basketball_nba',
  'NFL': 'americanfootball_nfl',
  'NHL': 'icehockey_nhl',
  'CFB': 'americanfootball_ncaaf'
};

// Filtered list based on user preference
export const SOFT_BOOK_KEYS = [
  'draftkings',
  'fanduel', 
  'bovada',
  'fliff',
  'espnbet',
  'thescore',
  'betonlineag'
];

export const BOOK_DISPLAY_NAMES: Record<string, string> = {
  'draftkings': 'DraftKings',
  'fanduel': 'FanDuel',
  'bovada': 'Bovada',
  'fliff': 'Fliff',
  'espnbet': 'theScore Bet',
  'thescore': 'theScore Bet',
  'betonlineag': 'BetOnline',
  'pinnacle': 'Pinnacle'
};

interface OddsCache {
  [key: string]: {
    timestamp: number;
    data: any[];
  };
}

// In-memory cache acts as a fast layer on top of localStorage
let memoryCache: OddsCache = {};

const formatPoint = (point: number): string => {
  return point > 0 ? `+${point}` : `${point}`;
};

const formatOdds = (price: number): string => {
  return price > 0 ? `+${price}` : `${price}`;
};

// Helper to access localStorage safely
const getStorageKey = (sportKey: string) => `edgelab_odds_cache_${sportKey}`;

export const fetchOddsForSport = async (sport: Sport, forceRefresh = false): Promise<any[]> => {
  const sportKey = SPORT_KEYS[sport];
  if (!sportKey) {
    console.warn(`Sport ${sport} not supported by Odds API`);
    return [];
  }

  const now = Date.now();
  const storageKey = getStorageKey(sportKey);

  // 1. Check In-Memory Cache (Fastest) - Skip if forced
  if (!forceRefresh && memoryCache[sportKey] && (now - memoryCache[sportKey].timestamp < CACHE_DURATION)) {
    console.log(`[OddsService] Using memory cache for ${sport}`);
    return memoryCache[sportKey].data;
  }

  // 2. Check LocalStorage (Persistence) - Skip if forced
  if (!forceRefresh && typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        const age = now - parsed.timestamp;
        
        if (age < CACHE_DURATION) {
          console.log(`[OddsService] Restoring ${sport} from LocalStorage (${Math.round(age/1000/60)}m old)`);
          // Hydrate memory cache
          memoryCache[sportKey] = parsed;
          return parsed.data;
        } else {
          console.log(`[OddsService] Expired LocalStorage for ${sport}`);
          localStorage.removeItem(storageKey);
        }
      }
    } catch (e) {
      console.warn("Failed to parse odds cache", e);
    }
  }

  if (!API_KEY) {
    console.error("ODDS_API_KEY is missing. Please check your environment variables.");
    return [];
  }

  console.log(`[OddsService] Fetching fresh API data for ${sport}... (Key ends in ...${API_KEY.slice(-4)})`);
  
  // Request US, US2 (offshore), and EU regions to cover all requested books
  const url = `${BASE_URL}/${sportKey}/odds?apiKey=${API_KEY}&regions=us,us2,eu,au&markets=h2h,spreads,totals&oddsFormat=american`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      if (response.status === 401) {
        console.warn("Odds API Key invalid or expired");
      }
      return [];
    }
    
    const data = await response.json();
    
    // 3. Update Caches
    const cacheEntry = { timestamp: now, data: data };
    memoryCache[sportKey] = cacheEntry;
    
    if (typeof window !== 'undefined') {
      localStorage.setItem(storageKey, JSON.stringify(cacheEntry));
    }
    
    return data;
  } catch (error) {
    console.error("Failed to fetch odds:", error);
    return [];
  }
};

export const fetchOddsForGame = async (sport: Sport, gameId: string): Promise<any> => {
  // 1. Try to find the game in the existing cache (FREE)
  const cachedGames = await fetchOddsForSport(sport);
  const cachedGame = cachedGames.find((g: any) => g.id === gameId);
  
  if (cachedGame) {
    console.log(`[OddsService] Found game ${gameId} in cache.`);
    return cachedGame;
  }

  // 2. Fallback: Only call API directly if missing (Costs credits)
  console.log(`[OddsService] Game ${gameId} not in cache. Fetching single event...`);
  const sportKey = SPORT_KEYS[sport];
  if (!sportKey || !API_KEY) return null;

  const url = `${BASE_URL}/${sportKey}/events/${gameId}/odds?apiKey=${API_KEY}&regions=us,us2,eu,au&markets=h2h,spreads,totals&oddsFormat=american`;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.json();
  } catch (e) {
    console.error("Error fetching single game odds:", e);
    return null;
  }
};

// New function to batch load all sports
export const fetchAllSportsOdds = async (forceRefresh = false): Promise<Record<Sport, any[]>> => {
  const results: Record<string, any[]> = {};
  const sports: Sport[] = ['NBA', 'NFL', 'NHL', 'CFB'];
  
  console.log(`[OddsService] Batch loading all sports (Force: ${forceRefresh})...`);
  
  for (const sport of sports) {
    results[sport] = await fetchOddsForSport(sport, forceRefresh);
  }
  
  console.log('[OddsService] Batch load complete.');
  return results as Record<Sport, any[]>;
};

// Manually clear cache to force fresh data
export const clearOddsCache = () => {
  memoryCache = {};
  if (typeof window !== 'undefined') {
    Object.values(SPORT_KEYS).forEach(key => {
      localStorage.removeItem(getStorageKey(key));
    });
    console.log("[OddsService] Cache cleared.");
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
