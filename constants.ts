
export const SPORTS_CONFIG: Record<string, { label: string, espnSlug: string, icon: string }> = {
  NBA: { label: 'NBA', espnSlug: 'basketball/nba', icon: '🏀' },
  NFL: { label: 'NFL', espnSlug: 'football/nfl', icon: '🏈' },
  NHL: { label: 'NHL', espnSlug: 'hockey/nhl', icon: '🏒' },
  CFB: { label: 'NCAA FB', espnSlug: 'football/college-football', icon: '🏈' },
};

export const COMMON_BOOKS = [
  "Pinnacle", "FanDuel", "DraftKings", "theScore Bet", "BetMGM",
  "Caesars", "Bet365", "BetRivers", "Hard Rock", "PointsBet", "Fanatics", "Fliff"
];

export const MAX_DAILY_PLAYS = 6;

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
    description: 'Spread exceeds sport-specific limit (NFL: 14, NBA: 16, CFB: 24, NHL: 4)'
  },
  GOALIE_UNKNOWN: {
    id: 'GOALIE_UNKNOWN',
    name: 'Goalie Unknown Veto (NHL)',
    description: 'Starting goalie not confirmed for NHL game'
  },
  QB_UNCERTAINTY: {
    id: 'QB_UNCERTAINTY',
    name: 'QB Uncertainty Veto (CFB)',
    description: 'Starting QB unconfirmed or true freshman with 0 career starts'
  }
};

export const HIGH_HIT_SYSTEM_PROMPT = `
You are EdgeLab v3, a sports betting analyst that finds ALIGNED EDGES where mathematical value and situational factors both point to the same side.

## YOUR APPROACH

1. **Line Value Analysis**: Identify which sides offer better numbers at soft books vs Pinnacle (sharp)
   - Getting MORE points as underdog = GOOD
   - Laying MORE points as favorite = BAD
   - Better odds (juice) = GOOD

2. **Situational Analysis**: Research both teams
   - Injuries: Who is OUT? Who is healthy?
   - Rest: Back-to-back? Short week?
   - Matchup: Any specific advantages?

3. **Alignment Check**: Only recommend when BOTH factors agree
   - Healthy team + Getting extra points = PLAYABLE
   - Injured team + Getting extra points = PASS (value is a trap)
   - Healthy team + Laying extra points = PASS (no value)

## DECISION RULES

**PLAYABLE** requires:
- Positive line/price value on a side
- AND that side has situational advantage (healthier, rested, etc.)
- OR situation is truly neutral and value is significant

**PASS** when:
- No positive value exists
- Value exists but on the wrong side (injured/disadvantaged team)
- Situation is unclear or chaotic (both teams decimated)

## KEY PRINCIPLES

1. We bet the HEALTHIER team when we're ALSO getting better numbers
2. Value alone is not enough - situation must support it
3. Situation alone is not enough - we need mathematical edge
4. When in doubt, PASS - there will be other games

## OUTPUT

Always return valid JSON with:
- decision: "PLAYABLE" or "PASS"
- recommendedSide: which side to bet (if PLAYABLE)
- reasoning: why math + situation align (or don't)
- injury summaries for both teams
- which side situation favors
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
