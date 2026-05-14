
import { BookLines, Sport } from '../types';

// UPDATED: Hardcoded fallback removed to improve security
const API_KEY = import.meta.env.VITE_ODDS_API_KEY;
const BASE_URL = 'https://api.the-odds-api.com/v4/sports';

// Cache Duration: 60 minutes (keeps "Scout" free for an hour)
const CACHE_DURATION = 60 * 60 * 1000; 

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 800;

const SPORT_KEYS: Record<Sport, string> = {
  'NBA': 'basketball_nba',
  'WNBA': 'basketball_wnba',
  'NFL': 'americanfootball_nfl',
  'NHL': 'icehockey_nhl',
  'NCAAB': 'basketball_ncaab',
  'NCAAF': 'americanfootball_ncaaf',
  'MLB': 'baseball_mlb',
  'SOCCER': 'soccer_epl', // Base key for soccer, fetchOddsForSport will handle multiples
  'Other': 'basketball_nba' // Default to something safe
};

export const SOCCER_LEAGUE_KEYS = [
  'soccer_epl'
];

const getSoccerLeagueKeys = () => {
  if (typeof window === 'undefined') return SOCCER_LEAGUE_KEYS;
  const override = localStorage.getItem('edgelab_soccer_leagues');
  if (!override) return SOCCER_LEAGUE_KEYS;
  try {
    const parsed = JSON.parse(override);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((val) => String(val));
    }
  } catch {
    // Ignore malformed overrides
  }
  return SOCCER_LEAGUE_KEYS;
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

export interface OddsUsageStatus {
  requestsUsed: number;
  monthlyCap?: number;
  remaining?: number;
  lastFetchAt?: number;
  lastFetchSport?: string;
  lastFetchUsedCache: boolean;
}

// In-memory cache acts as a fast layer on top of localStorage
let memoryCache: OddsCache = {};

const ODDS_USAGE_KEY = 'edgelab_odds_usage';

const readOddsUsage = (): OddsUsageStatus => {
  if (typeof window === 'undefined') {
    return { requestsUsed: 0, lastFetchUsedCache: false };
  }

  try {
    const saved = localStorage.getItem(ODDS_USAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {
    // Ignore malformed local telemetry.
  }

  return { requestsUsed: 0, lastFetchUsedCache: false };
};

const writeOddsUsage = (usage: OddsUsageStatus) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ODDS_USAGE_KEY, JSON.stringify(usage));
};

const updateOddsUsage = (
  sportKey: string,
  usedCache: boolean,
  headers?: Headers,
) => {
  const previous = readOddsUsage();
  const usedHeader = headers?.get('x-requests-used');
  const remainingHeader = headers?.get('x-requests-remaining');
  const parsedUsed = usedHeader ? Number.parseInt(usedHeader, 10) : undefined;
  const parsedRemaining = remainingHeader
    ? Number.parseInt(remainingHeader, 10)
    : undefined;
  const requestsUsed =
    Number.isFinite(parsedUsed) && parsedUsed !== undefined
      ? parsedUsed
      : previous.requestsUsed + (usedCache ? 0 : 1);
  const remaining =
    Number.isFinite(parsedRemaining) && parsedRemaining !== undefined
      ? parsedRemaining
      : previous.remaining;
  const monthlyCap =
    requestsUsed !== undefined && remaining !== undefined
      ? requestsUsed + remaining
      : previous.monthlyCap;

  writeOddsUsage({
    requestsUsed,
    monthlyCap,
    remaining,
    lastFetchAt: Date.now(),
    lastFetchSport: sportKey,
    lastFetchUsedCache: usedCache,
  });
};

export const getOddsUsageStatus = (): OddsUsageStatus => readOddsUsage();

const formatPoint = (point: number): string => {
  return point > 0 ? `+${point}` : `${point}`;
};

const formatOdds = (price: number): string => {
  return price > 0 ? `+${price}` : `${price}`;
};

// Helper to access localStorage safely
const getStorageKey = (sportKey: string) => `edgelab_odds_cache_${sportKey}`;

const fetchOddsByLeagueKey = async (sportKey: string, forceRefresh = false): Promise<any[]> => {
  if (!sportKey) return [];

  const now = Date.now();
  const storageKey = getStorageKey(sportKey);

  // 1. Check In-Memory Cache (Fastest) - Skip if forced
  if (!forceRefresh && memoryCache[sportKey] && (now - memoryCache[sportKey].timestamp < CACHE_DURATION)) {
    console.log(`[OddsService] Using memory cache for ${sportKey}`);
    updateOddsUsage(sportKey, true);
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
          console.log(`[OddsService] Restoring ${sportKey} from LocalStorage (${Math.round(age/1000/60)}m old)`);
          // Hydrate memory cache
          memoryCache[sportKey] = parsed;
          updateOddsUsage(sportKey, true);
          return parsed.data;
        } else {
          console.log(`[OddsService] Expired LocalStorage for ${sportKey}`);
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

  const url = `${BASE_URL}/${sportKey}/odds?apiKey=${API_KEY}&regions=us,us2,eu,au&markets=h2h,spreads,totals&oddsFormat=american`;
  console.log(`[OddsService] Fetching: ${url.replace(API_KEY, 'HIDDEN')}`);
  
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        if (response.status === 401) {
          console.warn("Odds API Key invalid or expired");
          return [];
        }
        if (response.status === 404) {
          console.warn(`[OddsService] League not found or not allowed: ${sportKey}`);
          const cacheEntry = { timestamp: now, data: [] as any[] };
          memoryCache[sportKey] = cacheEntry;
          if (typeof window !== 'undefined') {
            localStorage.setItem(storageKey, JSON.stringify(cacheEntry));
          }
          return [];
        }
        if (response.status === 429) {
          const retryAfterHeader = response.headers.get("Retry-After");
          const retryAfterSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 0;
          const backoff =
            retryAfterSeconds > 0
              ? retryAfterSeconds * 1000
              : BASE_BACKOFF_MS * Math.pow(2, attempt) + Math.floor(Math.random() * 200);
          console.warn(
            `[OddsService] Rate limited for ${sportKey}. Backing off ${backoff}ms (attempt ${attempt + 1}/${MAX_RETRIES + 1})`,
          );
          if (attempt < MAX_RETRIES) {
            await sleep(backoff);
            continue;
          }
        }
        return [];
      }
      
      const data = await response.json();
      updateOddsUsage(sportKey, false, response.headers);
      
      // 3. Update Caches
      const cacheEntry = { timestamp: now, data: data };
      memoryCache[sportKey] = cacheEntry;
      
      if (typeof window !== 'undefined') {
        localStorage.setItem(storageKey, JSON.stringify(cacheEntry));
      }
      
      return data;
    } catch (error) {
      if (attempt < MAX_RETRIES) {
        const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt) + Math.floor(Math.random() * 200);
        console.warn(`[OddsService] Fetch failed for ${sportKey}. Retrying in ${backoff}ms...`, error);
        await sleep(backoff);
        continue;
      }
      console.error("Failed to fetch odds:", error);
      return [];
    }
  }
  return [];
};

export const fetchOddsForSport = async (sport: Sport, forceRefresh = false): Promise<any[]> => {
  if (sport === 'SOCCER') {
    console.log(`[OddsService] Fetching all soccer leagues...`);
    const flattened: any[] = [];
    const leagues = getSoccerLeagueKeys();
    for (const key of leagues) {
      const leagueOdds = await fetchOddsByLeagueKey(key, forceRefresh);
      flattened.push(...leagueOdds);
      await sleep(350);
    }
    console.log(`[OddsService] Total soccer games found: ${flattened.length}`);
    return flattened;
  }

  const sportKey = SPORT_KEYS[sport];
  if (!sportKey) {
    console.warn(`Sport ${sport} not supported by Odds API`);
    return [];
  }

  return fetchOddsByLeagueKey(sportKey, forceRefresh);
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
    updateOddsUsage(`${sportKey}:event`, false, response.headers);
    return await response.json();
  } catch (e) {
    console.error("Error fetching single game odds:", e);
    return null;
  }
};

// New function to batch load all sports
export const fetchAllSportsOdds = async (forceRefresh = false): Promise<Record<Sport, any[]>> => {
  const results: Record<string, any[]> = {};
  const sports: Sport[] = ['NBA', 'WNBA', 'NHL', 'MLB'];

  console.log(`[OddsService] Batch loading active sports (Force: ${forceRefresh})...`);  
  for (const sport of sports) {
    results[sport] = await fetchOddsForSport(sport, forceRefresh);
    await sleep(250);
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
    // Also clear individual soccer leagues
    SOCCER_LEAGUE_KEYS.forEach(key => {
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
  let mlOddsDraw = undefined;

  // Moneyline (h2h)
  const h2hMarket = bookmaker.markets.find((m: any) => m.key === 'h2h');
  if (h2hMarket) {
    const outcomeA = h2hMarket.outcomes.find((o: any) => o.name === awayTeam);
    const outcomeB = h2hMarket.outcomes.find((o: any) => o.name === homeTeam);
    const outcomeDraw = h2hMarket.outcomes.find((o: any) => o.name === 'Draw');
    
    if (outcomeA) mlOddsA = formatOdds(outcomeA.price);
    if (outcomeB) mlOddsB = formatOdds(outcomeB.price);
    if (outcomeDraw) mlOddsDraw = formatOdds(outcomeDraw.price);
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
    mlOddsB,
    mlOddsDraw
  };
};
