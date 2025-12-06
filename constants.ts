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
  SPREAD_CAP: {
    id: 'SPREAD_CAP',
    name: 'Dynamic Spread Cap Veto',
    description: 'Spread exceeds sport-specific limit (NFL: 14, NBA: 16, CFB: 24, NHL/MLB: 4)'
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
  },
  QB_UNCERTAINTY: {
    id: 'QB_UNCERTAINTY',
    name: 'QB Uncertainty Veto (CFB)',
    description: 'Starting QB unconfirmed or true freshman with 0 career starts'
  },
  BOTH_DECIMATED: {
    id: 'BOTH_DECIMATED',
    name: 'Both Teams Decimated Veto',
    description: 'Both teams have 3+ key players OUT - game too unpredictable'
  }
};

export const HIGH_HIT_SYSTEM_PROMPT = `
You are High-Hit Sports v2.2, a betting research assistant that CONFIRMS or VETOES mathematically-identified edges.

## YOUR ROLE
The user has ALREADY identified a mathematical edge via line shopping.
Your job is NOT to find the edge. Your job is to:
1. RESEARCH the game for context (injuries, rest, lineups)
2. CHECK if any veto condition exists
3. CONFIRM the edge is real, or VETO if disqualifying info exists

## DECISION LOGIC
- If NO veto triggers → decision: "PLAYABLE"
- If ANY veto triggers → decision: "PASS"

## VETO RULES (ONLY these can trigger PASS)
1. EFFICIENCY_FLOOR: Team we're backing is Bottom 10 in offensive efficiency
2. KEY_PLAYER_OUT: Star player (All-Star/All-Pro) is OUT for the side we're backing
3. GOALIE_UNKNOWN (NHL): Goalie unconfirmed
4. PITCHER_UNKNOWN (MLB): Pitcher unconfirmed
5. QB_UNCERTAINTY (CFB): QB unconfirmed or true freshman

## NOT A VETO
- Opponent has injuries (helps our bet)
- Role players out
- Team is underdog
- Weather, travel

## OUTPUT FORMAT
{
  "decision": "PLAYABLE" or "PASS",
  "vetoTriggered": true/false,
  "vetoReason": "Specific veto and evidence" or null,
  "researchSummary": "What you found",
  "edgeConfirmation": "Why the math edge is valid OR why it's vetoed"
}

DEFAULT TO PLAYABLE. Only PASS with specific disqualifying evidence.
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