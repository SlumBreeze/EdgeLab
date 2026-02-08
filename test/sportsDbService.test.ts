import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sportsDbService } from '../services/sportsDbService';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value.toString(); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; }
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('sportsDbService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
  });

  it('should fetch team data from API and cache it', async () => {
    const mockTeam = { idTeam: '133604', strTeam: 'Arsenal' };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ teams: [mockTeam] })
    });

    const team = await sportsDbService.searchTeam('Arsenal');

    expect(team).toEqual(mockTeam);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(localStorageMock.getItem('sportsdb_cache_team_arsenal')).toBeDefined();
  });

  it('should return cached team data if available and not expired', async () => {
    const mockTeam = { idTeam: '133604', strTeam: 'Arsenal' };
    const cacheKey = 'sportsdb_cache_team_arsenal';
    localStorageMock.setItem(cacheKey, JSON.stringify({
      timestamp: Date.now(),
      data: mockTeam
    }));

    const team = await sportsDbService.searchTeam('Arsenal');

    expect(team).toEqual(mockTeam);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should fetch fresh data if cache is expired', async () => {
    const mockTeam = { idTeam: '133604', strTeam: 'Arsenal' };
    const cacheKey = 'sportsdb_cache_team_arsenal';
    localStorageMock.setItem(cacheKey, JSON.stringify({
      timestamp: Date.now() - (25 * 60 * 60 * 1000), // 25 hours ago
      data: { idTeam: 'old', strTeam: 'Arsenal' }
    }));

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ teams: [mockTeam] })
    });

    const team = await sportsDbService.searchTeam('Arsenal');

    expect(team).toEqual(mockTeam);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should fetch players for a team', async () => {
    const mockPlayers = [{ idPlayer: '1', strPlayer: 'Player 1' }];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ players: mockPlayers })
    });

    const players = await sportsDbService.getTeamPlayers('133604');

    expect(players).toEqual(mockPlayers);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should handle rate limits (429)', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 429,
      ok: false
    });

    const team = await sportsDbService.searchTeam('Arsenal');

    expect(team).toBeNull();
  });

  it('should fetch a full roster by team name', async () => {
    const mockTeam = { idTeam: '133604', strTeam: 'Arsenal' };
    const mockPlayers = [{ idPlayer: '1', strPlayer: 'Player 1' }];

    // Mock searchTeam
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ teams: [mockTeam] })
    });
    // Mock getTeamPlayers
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ players: mockPlayers })
    });

    const result = await sportsDbService.getRosterByTeamName('Arsenal');

    expect(result?.team).toEqual(mockTeam);
    expect(result?.players).toEqual(mockPlayers);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should not call API if data is in cache (avoiding rate limits)', async () => {
    const mockTeam = { idTeam: '133604', strTeam: 'Arsenal' };
    const cacheKey = 'sportsdb_cache_team_arsenal';
    localStorageMock.setItem(cacheKey, JSON.stringify({
      timestamp: Date.now(),
      data: mockTeam
    }));

    // Call searchTeam 10 times
    for (let i = 0; i < 10; i++) {
      await sportsDbService.searchTeam('Arsenal');
    }

    // Should only have called fetch 0 times because it was already in cache
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
