# Track Specification: Soccer Integration (Top European Leagues)

## Overview
This track implements soccer support for EdgeLab, focusing on the top 5 European leagues and the UEFA Champions League. The integration will handle the unique "3-Way Moneyline" market and introduce soccer-specific Veto logic and scan windows to account for the impact of official lineups and narrative overreactions.

## Functional Requirements
### 1. Market & League Support
- **Target Leagues:** Premier League (EPL), La Liga, Bundesliga, Serie A, Ligue 1, and UEFA Champions League.
- **Primary Market:** 3-Way Moneyline (1X2 - Home/Draw/Away).
- **Data Dependencies:** Integration must fetch fixture lists, league tables, and recent match stats (xG, shots on target, possession) to support narrative-based AI audits.

### 2. Veto System Enhancements
- **Audit-First Narrative Screen:** New "Derby/Must-Win" logic that flags over-hyped scenarios. These do **not** auto-reject the bet but instead force the AI agent to:
    - (a) Provide a concrete tactical or lineup-based justification for the edge.
    - (b) Downgrade the confidence/Kelly recommendation if no delta is found.
- **3-Way EV Calculation:** Update edge calculation logic to support 3-way markets using Pinnacle (Sharp) vs. Retail (Soft) deltas.

### 3. Scan Cadence Protocol
- **Soccer-Specific Windows:**
    - **First Window (Initial Liquidity):** 2 hours pre-game.
    - **Lineup Window (Critical Data):** 55 minutes pre-game (post-official team sheets).
    - **Lock Window (Final Movement):** 15 minutes pre-game.

### 4. UI/UX
- **Scout/Queue Updates:** Ensure the 3-Way line is displayed clearly, accommodating the "Draw" outcome in game cards.

## Non-Functional Requirements
- **Type Safety:** Update existing sport types and interfaces to handle soccer-specific data structures.
- **API Efficiency:** Optimize Odds API calls for soccer leagues to stay within rate limits.

## Acceptance Criteria
- [ ] Soccer games from targeted leagues appear in the Scout view.
- [ ] Edge calculations correctly account for the 3-way moneyline market.
- [ ] The Veto system correctly identifies soccer-specific "Must Win" narrative traps and requires tactical justification.
- [ ] Scan button filters games according to the new soccer-optimized windows.
- [ ] Unit tests verify 3-way moneyline parsing and edge calculation logic.

## Out of Scope
- Player props (Anytime Goalscorer, etc.).
- Lower-tier leagues or domestic cups (FA Cup, DFB-Pokal, etc.).
- Live/In-play betting analysis.
