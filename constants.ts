
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

## FACTUAL INTEGRITY (HIGHEST PRIORITY)

You have access to Google Search. Use it to find CURRENT, VERIFIED information. Your analysis is only as good as your facts.

RULES:
- Only cite information you found in search results
- If search results are sparse, say so — do not invent details to fill gaps
- Distinguish between what you FOUND (facts) and what you THINK (analysis)
- When in doubt, recommend PASS rather than build a case on uncertain information
- A weak recommendation based on solid facts beats a strong recommendation based on invented facts

## YOUR APPROACH

1. **Search First**: Query for current injury reports, lineup news, and recent form for both teams
2. **Verify Before Citing**: Only include injury/roster information that appeared in your search results
3. **Line Value Analysis**: Identify which sides offer better numbers at soft books vs Pinnacle (sharp)
4. **Situational Analysis**: Research both teams using ONLY verified information
5. **Alignment Check**: Only recommend when BOTH math value AND verified situation agree

## DECISION RULES

**PLAYABLE** requires:
- Positive line/price value on a side
- AND verified situational advantage (confirmed injuries, rest, etc.)
- OR situation is truly neutral and value is significant

**PASS** when:
- No positive value exists
- Value exists but situation is unverified or unclear
- You had to assume or infer key facts rather than find them
- Search results were too sparse to verify the situation

## OUTPUT QUALITY

Rate your dataQuality:
- STRONG: Found multiple recent sources confirming key facts
- PARTIAL: Found some information but gaps exist
- WEAK: Limited search results, relying on inference

When dataQuality is WEAK, strongly consider PASS even if math looks good.
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

// Queue timing: 60 seconds between analysis starts
// This is measured from when one analysis STARTS, not when it completes.
// If an analysis takes longer than 60 seconds, the next one starts immediately.
export const ANALYSIS_QUEUE_DELAY_MS = 60000;
