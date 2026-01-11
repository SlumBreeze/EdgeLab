import { Bet, GameScore } from '../types';

// ESPN Endpoints (Unofficial)
const ENDPOINTS: Record<string, string> = {
  NFL: 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard',
  NBA: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard',
  MLB: 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard',
  NHL: 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard',
  NCAAF: 'https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard',
  NCAAB: 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard',
};

// Common team name aliases for better matching
const TEAM_ALIASES: Record<string, string[]> = {
  // NFL
  'raiders': ['las vegas', 'lv', 'oak', 'oakland'],
  'ravens': ['baltimore', 'bal', 'balt'],
  'packers': ['green bay', 'gb', 'greenbay'],
  'giants': ['new york giants', 'nyg', 'ny giants'],
  'jets': ['new york jets', 'nyj', 'ny jets'],
  '49ers': ['san francisco', 'sf', 'niners'],
  'commanders': ['washington', 'was', 'wsh'],
  'cardinals': ['arizona', 'ari', 'az'],
  'chargers': ['los angeles chargers', 'lac', 'la chargers'],
  'rams': ['los angeles rams', 'lar', 'la rams'],
  'patriots': ['new england', 'ne', 'pats'],
  'saints': ['new orleans', 'no', 'nola'],
  'buccaneers': ['tampa bay', 'tb', 'bucs', 'tampa'],
  'chiefs': ['kansas city', 'kc'],
  'broncos': ['denver', 'den'],
  'bills': ['buffalo', 'buf'],
  'dolphins': ['miami', 'mia'],
  'eagles': ['philadelphia', 'phi', 'philly'],
  'cowboys': ['dallas', 'dal'],
  'bears': ['chicago', 'chi'],
  'lions': ['detroit', 'det'],
  'vikings': ['minnesota', 'min'],
  'falcons': ['atlanta', 'atl'],
  'panthers': ['carolina', 'car'],
  'browns': ['cleveland', 'cle'],
  'bengals': ['cincinnati', 'cin', 'cincy'],
  'steelers': ['pittsburgh', 'pit', 'pitt'],
  'texans': ['houston', 'hou'],
  'colts': ['indianapolis', 'ind', 'indy'],
  'jaguars': ['jacksonville', 'jax', 'jags'],
  'titans': ['tennessee', 'ten'],
  'seahawks': ['seattle', 'sea'],
  
  // NBA
  'lakers': ['los angeles lakers', 'lal', 'la lakers'],
  'clippers': ['los angeles clippers', 'lac', 'la clippers'],
  'celtics': ['boston', 'bos'],
  'nets': ['brooklyn', 'bkn'],
  'knicks': ['new york knicks', 'nyk', 'ny knicks'],
  'heat': ['miami', 'mia'],
  'magic': ['orlando', 'orl'],
  'hawks': ['atlanta', 'atl'],
  'hornets': ['charlotte', 'cha'],
  'wizards': ['washington', 'was', 'wsh'],
  'cavaliers': ['cleveland', 'cle', 'cavs'],
  'pistons': ['detroit', 'det'],
  'pacers': ['indiana', 'ind'],
  'bucks': ['milwaukee', 'mil'],
  'bulls': ['chicago', 'chi'],
  'timberwolves': ['minnesota', 'min', 'wolves'],
  'pelicans': ['new orleans', 'no', 'nola'],
  'rockets': ['houston', 'hou'],
  'grizzlies': ['memphis', 'mem'],
  'spurs': ['san antonio', 'sa'],
  'mavericks': ['dallas', 'dal', 'mavs'],
  'thunder': ['oklahoma city', 'okc'],
  'nuggets': ['denver', 'den'],
  'jazz': ['utah', 'uta'],
  'suns': ['phoenix', 'phx'],
  'blazers': ['portland', 'por', 'trail blazers'],
  'kings': ['sacramento', 'sac'],
  'warriors': ['golden state', 'gs', 'gsw'],
  'raptors': ['toronto', 'tor'],
};

// Helper to parse the ESPN API response
const parseEspnResponse = (data: any, sport: string, dateStr: string): GameScore[] => {
    if (!data || !data.events) return [];
    
    return data.events.map((event: any) => {
        const comp = event.competitions[0];
        const home = comp.competitors.find((c: any) => c.homeAway === 'home');
        const away = comp.competitors.find((c: any) => c.homeAway === 'away');
        
        // Determine status
        let status: GameScore['status'] = 'SCHEDULED';
        const state = event.status.type.state;
        if (state === 'in') status = 'IN_PROGRESS';
        if (state === 'post') status = 'FINAL';
        if (state === 'pre') status = 'SCHEDULED';
        
        // Extract team names - use displayName for full name (e.g. "Baltimore Ravens")
        const homeDisplayName = home.team.displayName || home.team.name || '';
        const awayDisplayName = away.team.displayName || away.team.name || '';
        const homeMascot = home.team.name || home.team.shortDisplayName || '';
        const awayMascot = away.team.name || away.team.shortDisplayName || '';

        return {
          id: event.id,
          date: dateStr,
          sport,
          status,
          clock: event.status.type.detail,
          period: event.status.period,
          homeTeam: home.team.abbreviation,
          homeTeamName: homeMascot,
          homeTeamFullName: homeDisplayName, // Add full name for better matching
          homeScore: parseInt(home.score || '0'),
          awayTeam: away.team.abbreviation,
          awayTeamName: awayMascot,
          awayTeamFullName: awayDisplayName, // Add full name for better matching
          awayScore: parseInt(away.score || '0'),
          winner: status === 'FINAL' 
            ? (parseInt(home.score) > parseInt(away.score) ? 'home' : 'away')
            : undefined
        } as GameScore & { homeTeamFullName: string; awayTeamFullName: string };
      });
};

/**
 * Fetches all scores for a specific date across all supported sports.
 * Includes a CORS proxy fallback.
 * @param dateStr YYYY-MM-DD
 */
export const fetchDailyScores = async (dateStr: string): Promise<GameScore[]> => {
  // Convert YYYY-MM-DD to YYYYMMDD for ESPN API
  const apiDate = dateStr.replace(/-/g, '');
  
  const promises = Object.entries(ENDPOINTS).map(async ([sport, url]) => {
    const targetUrl = `${url}?dates=${apiDate}&limit=200`;
    
    try {
      // 1. Try direct fetch first (works if CORS is permissive or same-origin)
      const res = await fetch(targetUrl);
      if (!res.ok) throw new Error(`Direct fetch status: ${res.status}`);
      const data = await res.json();
      return parseEspnResponse(data, sport, dateStr);

    } catch (e) {
      // 2. Fallback to CORS proxy if direct fetch fails (likely CORS error)
      try {
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
        const res = await fetch(proxyUrl);
        if (!res.ok) throw new Error(`Proxy status: ${res.status}`);
        const data = await res.json();
        return parseEspnResponse(data, sport, dateStr);

      } catch (proxyError) {
        console.error(`Error fetching ${sport} (after proxy fallback)`, proxyError);
        return [];
      }
    }
  });

  const results = await Promise.all(promises);
  return results.flat();
};

/**
 * Normalizes text for comparison: lowercase, remove special chars
 */
const normalize = (s: string): string => {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
};

/**
 * Extracts the two team identifiers from a matchup string
 * Handles formats like: "Team A vs Team B", "Team A @ Team B", "Team A - Team B"
 */
const parseMatchupTeams = (matchup: string): [string, string] | null => {
  const normalized = normalize(matchup);
  
  // Try various separators
  const separators = [' vs ', ' @ ', ' at ', ' v ', ' versus '];
  
  for (const sep of separators) {
    if (normalized.includes(sep)) {
      const parts = normalized.split(sep);
      if (parts.length === 2) {
        return [parts[0].trim(), parts[1].trim()];
      }
    }
  }
  
  return null;
};

/**
 * Checks if a team identifier matches a game's team
 * Uses multiple matching strategies: exact, abbreviation, alias, and fuzzy
 */
const teamMatchesGame = (teamQuery: string, game: GameScore & { homeTeamFullName?: string; awayTeamFullName?: string }): 'home' | 'away' | null => {
  const query = normalize(teamQuery);
  const queryTokens = new Set(query.split(' ').filter(t => t.length > 0));
  
  // Build searchable strings for each team
  const homeSearchables = [
    normalize(game.homeTeam),
    normalize(game.homeTeamName),
    normalize(game.homeTeamFullName || ''),
  ].filter(s => s.length > 0);
  
  const awaySearchables = [
    normalize(game.awayTeam),
    normalize(game.awayTeamName),
    normalize(game.awayTeamFullName || ''),
  ].filter(s => s.length > 0);

  // Helper to check if query matches any of the searchables
  const matchesTeam = (searchables: string[]): boolean => {
    for (const searchable of searchables) {
      // Exact match
      if (query === searchable) return true;
      
      // Query contains searchable (e.g., "baltimore ravens" contains "ravens")
      if (query.includes(searchable) && searchable.length >= 3) return true;
      
      // Searchable contains query (e.g., "Ravens" when query is "ravens")
      if (searchable.includes(query) && query.length >= 3) return true;
      
      // Token match for abbreviations (must be exact token)
      const searchTokens = searchable.split(' ');
      for (const token of queryTokens) {
        // For short tokens (abbreviations), require exact match
        if (token.length <= 3) {
          if (searchTokens.some(st => st === token)) return true;
        } else {
          // For longer tokens, allow partial match
          if (searchTokens.some(st => st.includes(token) || token.includes(st))) return true;
        }
      }
    }
    
    // Check aliases
    for (const [mascot, aliases] of Object.entries(TEAM_ALIASES)) {
      const allNames = [mascot, ...aliases];
      const queryMatchesAlias = allNames.some(alias => {
        const normAlias = normalize(alias);
        return query.includes(normAlias) || normAlias.includes(query) || queryTokens.has(normAlias);
      });
      
      if (queryMatchesAlias) {
        // Check if this alias group matches the team
        const teamMatchesAlias = searchables.some(s => 
          allNames.some(alias => {
            const normAlias = normalize(alias);
            return s.includes(normAlias) || normAlias.includes(s);
          })
        );
        if (teamMatchesAlias) return true;
      }
    }
    
    return false;
  };

  if (matchesTeam(homeSearchables)) return 'home';
  if (matchesTeam(awaySearchables)) return 'away';
  return null;
};

/**
 * Tries to match a Bet to a GameScore.
 * REQUIRES BOTH teams from the matchup to be found in the game for a confident match.
 * Falls back to single-team match only if the pick clearly identifies a team.
 */
export const findMatchingGame = (bet: Bet, scores: GameScore[]): GameScore | undefined => {
  if (!scores || scores.length === 0) return undefined;

  // 1. Filter by sport first - this is critical for college sports with duplicate names
  const relevantScores = scores.filter(s => s.sport === bet.sport);
  const candidates = relevantScores.length > 0 ? relevantScores : scores;

  // 2. Try to parse both teams from matchup
  const matchupTeams = parseMatchupTeams(bet.matchup);
  
  if (matchupTeams) {
    const [team1, team2] = matchupTeams;
    
    // Find a game where BOTH teams match
    for (const game of candidates) {
      const extendedGame = game as GameScore & { homeTeamFullName?: string; awayTeamFullName?: string };
      const team1Match = teamMatchesGame(team1, extendedGame);
      const team2Match = teamMatchesGame(team2, extendedGame);
      
      // Both teams must match AND they must match different sides
      if (team1Match && team2Match && team1Match !== team2Match) {
        return game;
      }
    }
  }

  // 3. Fallback: Try matching based on the pick field (single team)
  // Only use this if we have high confidence
  const pickNormalized = normalize(bet.pick);
  
  for (const game of candidates) {
    const extendedGame = game as GameScore & { homeTeamFullName?: string; awayTeamFullName?: string };
    
    // Check if pick contains a clear team reference
    const homeMatch = teamMatchesGame(pickNormalized, { ...extendedGame, awayTeam: '', awayTeamName: '', awayTeamFullName: '' } as any);
    const awayMatch = teamMatchesGame(pickNormalized, { ...extendedGame, homeTeam: '', homeTeamName: '', homeTeamFullName: '' } as any);
    
    // Also verify against matchup for extra confidence
    const matchupNormalized = normalize(bet.matchup);
    const gameTeams = [
      normalize(game.homeTeam),
      normalize(game.homeTeamName),
      normalize(game.awayTeam),
      normalize(game.awayTeamName),
    ];
    
    // Require that the matchup text contains at least one team identifier from this game
    const matchupContainsGameTeam = gameTeams.some(gt => 
      gt.length >= 3 && (matchupNormalized.includes(gt) || gt.split(' ').some(t => t.length >= 3 && matchupNormalized.includes(t)))
    );
    
    if ((homeMatch || awayMatch) && matchupContainsGameTeam) {
      return game;
    }
  }

  // No confident match found
  return undefined;
};