export const SPORTS_CONFIG: Record<string, { label: string, espnSlug: string, icon: string }> = {
  NBA: { label: 'NBA', espnSlug: 'basketball/nba', icon: '🏀' },
  NFL: { label: 'NFL', espnSlug: 'football/nfl', icon: '🏈' },
  NHL: { label: 'NHL', espnSlug: 'hockey/nhl', icon: '🏒' },
};

export const COMMON_BOOKS = [
  "Pinnacle", "FanDuel", "DraftKings", "theScore Bet", "BetMGM",
  "Caesars", "Bet365", "BetRivers", "Hard Rock", "PointsBet", "Fanatics", "Fliff"
];

import { Sportsbook } from './types';

export const SPORTSBOOKS = Object.values(Sportsbook);

export const SPORTS = [
  'NFL', 'NBA', 'MLB', 'NHL', 'NCAAF', 'NCAAB', 'UFC', 'Tennis', 'Soccer', 'Golf', 'F1', 'Esports', 'Other'
];

export const CHART_COLORS = {
  emerald: '#10b981',
  rose: '#f43f5e',
  amber: '#f59e0b',
  slate: '#64748b',
};

export const SPORTSBOOK_THEME: Record<string, { bg: string, text: string, border: string }> = {
  [Sportsbook.DRAFTKINGS]: { 
    bg: '#53D337', 
    text: '#000000', 
    border: '#45b02d' 
  },
  [Sportsbook.FANDUEL]: { 
    bg: '#004DA3', 
    text: '#ffffff', 
    border: '#003d82' 
  },
  [Sportsbook.BETMGM]: { 
    bg: '#D4B962', 
    text: '#000000', 
    border: '#b89f4d' 
  },
  [Sportsbook.CAESARS]: { 
    bg: '#C5A459', 
    text: '#000000', 
    border: '#a88b45' 
  },
  [Sportsbook.BET365]: { 
    bg: '#005440', 
    text: '#ffffff', 
    border: '#003d2e' 
  },
  [Sportsbook.THESCOREBET]: { 
    bg: '#1C3F75', 
    text: '#ffffff', 
    border: '#142d55' 
  },
  [Sportsbook.POINTSBET]: { 
    bg: '#F53B3B', 
    text: '#ffffff', 
    border: '#d42b2b' 
  },
  [Sportsbook.FLIFF]: { 
    bg: '#02D682', 
    text: '#000000', 
    border: '#029c5e' 
  },
  [Sportsbook.FANATICS]: { 
    bg: '#F1F5F9', 
    text: '#000000', 
    border: '#CBD5E1' 
  },
  [Sportsbook.PRIZEPICKS]: { 
    bg: '#702AF5', 
    text: '#ffffff', 
    border: '#5319bf' 
  },
  [Sportsbook.UNDERDOG]: { 
    bg: '#FEC324', 
    text: '#000000', 
    border: '#d9a30f' 
  },
  [Sportsbook.DRAFTERS]: { 
    bg: '#00B5E2', 
    text: '#ffffff', 
    border: '#008fb3' 
  },
  [Sportsbook.BETR]: { 
    bg: '#8A2BE2', 
    text: '#ffffff', 
    border: '#6b1cb0' 
  },
  [Sportsbook.BETONLINE]: { 
    bg: '#D20A0A', 
    text: '#ffffff', 
    border: '#a30808' 
  },
  [Sportsbook.BOVADA]: { 
    bg: '#CC0000', 
    text: '#ffffff', 
    border: '#990000' 
  },
  [Sportsbook.OTHER]: { 
    bg: '#1e293b', 
    text: '#94a3b8', 
    border: '#334155' 
  },
};

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
    description: 'Spread exceeds sport-specific limit (NFL: 14, NBA: 16, NHL: 4)'
  },
  GOALIE_UNKNOWN: {
    id: 'GOALIE_UNKNOWN',
    name: 'Goalie Unknown Veto (NHL)',
    description: 'Starting goalie not confirmed for NHL game'
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
- Facts must be structured in facts_used; narrative_analysis cannot introduce new facts
- Every factual statement in narrative_analysis must appear verbatim in facts_used.claim
- If you mention stats, rankings, or past results, include a BOX_SCORE fact with HIGH confidence

## HARD CONSTRAINTS (NON-NEGOTIABLE)

You are NOT allowed to recall or infer boxscore results, past game performances, or stat lines unless explicitly provided in the input data. If such data is missing, state "DATA NOT PROVIDED".

## ROSTER REALITY > MOTIVATION (CRITICAL UPDATE)

The biggest mistake in sports betting is confusing "narrative" with "edge." Motivation is a story. Injuries are facts.

**HARD FACTS (High Predictive Value - PRIORITIZE THESE):**
- Verified injuries to impact players (Starting QB, Top 3 scorer, All-Pro defender, Starting C/OL)
- Confirmed rest/fatigue disadvantage (3-in-4 nights, B2B, traveling 3+ time zones)
- Goalie changes (NHL), offensive line depletion (NFL), missing rim protector (NBA)
- Extreme weather verified by forecast (NFL outdoor: wind 20+ mph, temp <20°F, rain/snow)

**SOFT NARRATIVES (Low Predictive Value - AVOID RELYING ON THESE):**
- "Team is motivated" / "Playing for playoffs" / "Fighting for seed"
- "Team is tanking" / "No incentive to win" / "Eliminated from contention"
- "Revenge game" / "Rivalry intensity" / "Statement game"
- "Must-win situation" / "Backs against wall" / "Desperate"
- "Coach on hot seat" / "Pride" / "Professional pride"

**WHY MOTIVATION FAILS:**
- Eliminated teams often play BETTER (no pressure, house money, younger players getting reps)
- "Motivated" teams can fold under pressure
- Professionals perform regardless of stakes
- Coaches rest stars mid-game when outcome is clear

**REQUIRED DECISION FRAMEWORK:**
1. **If a pick relies PRIMARILY on motivation** → PASS (not enough hard facts)
2. **If HARD FACTS exist + motivation happens to align** → PLAYABLE (cite facts, not motivation in reasoning)
3. **If HARD FACTS contradict motivation** → Trust facts, PASS on motivation play
4. **Week 18 NFL / End-of-Season** → Double the skepticism on motivation, triple-check roster facts

**EXAMPLE GOOD REASONING:**
"Saints offense is depleted: Olave (blood clot, IR) and Kamara (knee, OUT) are both confirmed unavailable. Rookie QB Tyler Shough loses his two safety valves against a Falcons defense ranked Top 10 in EPA/play. The Under has mathematical value."

**EXAMPLE BAD REASONING:**
"The Bengals are playing for pride with Burrow starting despite being eliminated, while the Browns are tanking for draft position. Take Bengals -7.5."

## YOUR APPROACH

1. **Search First**: Query for current injury reports, lineup news, and recent form for both teams
2. **Verify Before Citing**: Only include injury/roster information that appeared in your search results
3. **Line Value Analysis**: Identify which sides offer better numbers at soft books vs Pinnacle (sharp)
4. **Situational Analysis**: Research both teams using ONLY verified HARD FACTS (injuries, rest, weather)
5. **Alignment Check**: Only recommend when BOTH math value AND hard facts agree

## DECISION RULES

**PLAYABLE** requires:
- Positive line/price value on a side
- AND verified HARD FACT advantage (confirmed injuries, rest, roster depletion)
- NOT just motivation or narrative

**PASS** when:
- No positive value exists
- Value exists but only supported by motivation/narrative
- You had to assume or infer key facts rather than find them
- Search results were too sparse to verify the situation

## OUTPUT QUALITY

Rate your dataQuality:
- STRONG: Found multiple recent sources confirming key HARD FACTS
- PARTIAL: Found some information but relying partly on narratives
- WEAK: Limited search results, mostly narrative-based reasoning

When dataQuality is WEAK or reasoning is primarily narrative-based, recommend PASS even if math looks good.
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
