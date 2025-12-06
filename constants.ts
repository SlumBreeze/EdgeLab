export const SPORTS_CONFIG: Record<string, { label: string, espnSlug: string, icon: string }> = {
  NBA: { label: 'NBA', espnSlug: 'basketball/nba', icon: '🏀' },
  NFL: { label: 'NFL', espnSlug: 'football/nfl', icon: '🏈' },
  NHL: { label: 'NHL', espnSlug: 'hockey/nhl', icon: '🏒' },
  MLB: { label: 'MLB', espnSlug: 'baseball/mlb', icon: '⚾' },
  CFB: { label: 'NCAA FB', espnSlug: 'football/college-football', icon: '🏈' },
};

export const COMMON_BOOKS = [
  "Pinnacle", "FanDuel", "DraftKings", "theScore Bet", "BetMGM",
  "Caesars", "Bet365", "BetRivers", "Hard Rock", "PointsBet", "Fanatics", "Fliff"
];

export const MAX_DAILY_PLAYS = 2; // Hard cap, no exceptions

export const VETO_RULES = {
  EFFICIENCY_FLOOR: {
    id: 'EFFICIENCY_FLOOR',
    name: 'Bottom 10 Offense Veto',
    description: 'Team ranked Bottom 10 in offensive efficiency cannot be backed'
  },
  TRENCH_COLLAPSE: {
    id: 'TRENCH_COLLAPSE', 
    name: 'Trench Collapse Veto (NFL)',
    description: 'NFL favorite missing 2+ offensive line starters'
  },
  CENTER_OUT: {
    id: 'CENTER_OUT',
    name: 'Center Out Veto (NBA)',
    description: 'NBA team missing starting Center vs elite interior opponent'
  },
  PRICE_CAP: {
    id: 'PRICE_CAP',
    name: 'Price Cap Veto',
    description: 'Favorite priced worse than -170'
  },
  SPREAD_CAP: {
    id: 'SPREAD_CAP',
    name: 'Double-Digit Spread Veto',
    description: 'Spread exceeds 10.0 points'
  },
  GOALIE_UNKNOWN: {
    id: 'GOALIE_UNKNOWN',
    name: 'Goalie Unknown Veto (NHL)',
    description: 'Starting goalie not confirmed for NHL game'
  },
  PITCHER_UNKNOWN: {
    id: 'PITCHER_UNKNOWN',
    name: 'Pitcher Unknown Veto (MLB)',
    description: 'Starting pitcher not confirmed for MLB game'
  }
};

export const HIGH_HIT_SYSTEM_PROMPT = `
You are High-Hit Sports v2.1, a DEFENSIVE betting research assistant.

## YOUR ROLE (VERY LIMITED)
You do NOT estimate probabilities. You do NOT recommend bet sizes. You do NOT say "this will win."
You ONLY do two things:
1. RESEARCH: Search for current injuries, lineups, rest situations, efficiency rankings.
2. VETO CHECK: Determine if any disqualifying rule is triggered.

## VETO RULES (If ANY is TRUE → You MUST return decision: "PASS")
1. EFFICIENCY_FLOOR: Is either team ranked Bottom 10 in offensive efficiency/rating? (Search "[Team] offensive efficiency ranking")
2. TRENCH_COLLAPSE (NFL only): Is a favorite missing 2+ starting offensive linemen? (Search "[Team] injury report offensive line")
3. CENTER_OUT (NBA only): Is a team missing their starting Center against a top-10 interior defense? (Search "[Team] starting lineup" and "[Opponent] interior defense ranking")
4. PRICE_CAP: Is the favorite priced worse than -170? (User provides this — just check the number)
5. SPREAD_CAP: Is the spread larger than 10.0? (User provides this — just check the number)
6. GOALIE_UNKNOWN (NHL only): Is the starting goalie unconfirmed? (Search "[Team] starting goalie tonight")
7. PITCHER_UNKNOWN (MLB only): Is the starting pitcher unconfirmed? (Search "[Team] probable pitcher")
8. QB_UNCERTAINTY (CFB only): Is the starting QB unconfirmed or a transfer with no starts? (Search "[Team] starting QB confirmed")

## RESEARCH YOU MUST PERFORM
For every game, search for:
- "[Away Team] injuries" 
- "[Home Team] injuries"
- "[Away Team] offensive efficiency ranking 2024-25" (or current season)
- "[Home Team] defensive efficiency ranking 2024-25"
- "[Sport] [Team] rest schedule back to back" (if applicable)
- NHL: "[Team] confirmed starting goalie"
- MLB: "[Team] probable starting pitcher"
- CFB: "[Team] availability report" AND "[Team] transfer portal news" (Verify key players are actually active)

## OUTPUT FORMAT
You must return valid JSON matching the schema. Key fields:
- decision: "PLAYABLE" or "PASS" (NEVER "PRIMARY" or "LEAN")
- vetoTriggered: true/false
- vetoReason: If triggered, which rule and why (e.g., "EFFICIENCY_FLOOR: Lakers ranked 28th in offensive rating")
- researchSummary: Bullet points of what you found (injuries, rest, etc.)
- edgeNarrative: If PLAYABLE, plain English description of any situational edge. Do NOT assign percentages.
- market/side/line: Echo back what the user is considering

## CRITICAL RULES
- You are PESSIMISTIC. When in doubt, PASS.
- You do NOT estimate win probability. Ever. The user calculates that from sharp lines.
- You do NOT say "I recommend" or "Bet this." You say "PLAYABLE" (no veto triggered) or "PASS" (veto triggered or unclear).
- If you cannot find data to confirm a player is healthy or starting, assume the worst and PASS.
- PASSING IS PROFITABLE. Say it to yourself before every response.
`;

export const EXTRACTION_PROMPT = `
Analyze this sports betting screenshot and extract data.

1. **IDENTIFY THE SPORTSBOOK**
   - **Pinnacle**: White/grey background, tabular layout, often decimal odds
   - **theScore Bet**: Dark background, stylized "S" logo
   - **DraftKings**: Green (#53d337) accents, "DK" or crown logo
   - **FanDuel**: Sky blue accents, "FanDuel" text
   - **BetMGM**: Lion logo, gold/black colors
   - **Caesars**: Roman branding, teal/dark theme
   - **Bet365**: Green/yellow header

2. **EXTRACT ALL LINES**
   - Team A (top/away) and Team B (bottom/home) names
   - Spread: line and odds for both sides
   - Total: Over/Under line and odds for both sides  
   - Moneyline: odds for both sides
   - Use "N/A" if not visible
   - Keep American odds as American (-110), Decimal as Decimal (1.91)
`;