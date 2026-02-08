import { SportsDbPlayer, SportsDbResponse, SportsDbTeam } from '../types/sportsDb';

const API_KEY = '123'; // Free test key as per documentation
const BASE_URL = `https://www.thesportsdb.com/api/v1/json/${API_KEY}`;

// Cache TTL: 24 hours
const CACHE_TTL = 24 * 60 * 60 * 1000;

interface CacheEntry<T> {
  timestamp: number;
  data: T;
}

const getCacheKey = (type: string, identifier: string) => `sportsdb_cache_${type}_${identifier.replace(/\s+/g, '_').toLowerCase()}`;

const getFromCache = <T>(key: string): T | null => {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(key);
  if (!stored) return null;

  try {
    const entry: CacheEntry<T> = JSON.parse(stored);
    if (Date.now() - entry.timestamp < CACHE_TTL) {
      return entry.data;
    }
    localStorage.removeItem(key);
  } catch (e) {
    console.warn('Failed to parse SportsDB cache', e);
  }
  return null;
};

const saveToCache = <T>(key: string, data: T) => {
  if (typeof window === 'undefined') return;
  const entry: CacheEntry<T> = {
    timestamp: Date.now(),
    data
  };
  localStorage.setItem(key, JSON.stringify(entry));
};

/**
 * Service to fetch verified sports data from TheSportsDB (v1).
 * Handles caching and rate-limiting for the free tier (30 RPM).
 */
export const sportsDbService = {
  /**
   * Search for a team by name.
   */
  searchTeam: async (teamName: string): Promise<SportsDbTeam | null> => {
    const cacheKey = getCacheKey('team', teamName);
    const cached = getFromCache<SportsDbTeam>(cacheKey);
    if (cached) return cached;

    const url = `${BASE_URL}/searchteams.php?t=${encodeURIComponent(teamName)}`;
    
    try {
      const response = await fetch(url);
      if (response.status === 429) {
        console.warn('SportsDB rate limit exceeded');
        return null;
      }
      if (!response.ok) return null;

      const data: SportsDbResponse<SportsDbTeam> = await response.json();
      if (data.teams && data.teams.length > 0) {
        // Find the best match (exact or first)
        const team = data.teams.find(t => t.strTeam.toLowerCase() === teamName.toLowerCase()) || data.teams[0];
        saveToCache(cacheKey, team);
        return team;
      }
      return null;
    } catch (error) {
      console.error('Error fetching team from SportsDB:', error);
      return null;
    }
  },

  /**
   * List all players for a specific team ID.
   */
  getTeamPlayers: async (teamId: string): Promise<SportsDbPlayer[]> => {
    const cacheKey = getCacheKey('players', teamId);
    const cached = getFromCache<SportsDbPlayer[]>(cacheKey);
    if (cached) return cached;

    const url = `${BASE_URL}/lookup_all_players.php?id=${teamId}`;

    try {
      const response = await fetch(url);
      if (response.status === 429) {
        console.warn('SportsDB rate limit exceeded');
        return [];
      }
      if (!response.ok) return [];

      const data: SportsDbResponse<SportsDbPlayer> = await response.json();
      if (data.players) {
        saveToCache(cacheKey, data.players);
        return data.players;
      }
      return [];
    } catch (error) {
      console.error('Error fetching players from SportsDB:', error);
      return [];
    }
  },

  /**
   * Holistic helper to get a team's current roster by team name.
   */
  getRosterByTeamName: async (teamName: string): Promise<{ team: SportsDbTeam; players: SportsDbPlayer[] } | null> => {
    const team = await sportsDbService.searchTeam(teamName);
    if (!team) return null;

    const players = await sportsDbService.getTeamPlayers(team.idTeam);
    return { team, players };
  }
};
