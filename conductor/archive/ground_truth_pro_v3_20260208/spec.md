# Track Specification: Ground Truth & Pro 3 Analysis

## Overview
This track addresses AI "hallucinations" and restrictive bias by transforming EdgeLab into a professional-grade handicapping engine. By integrating **TheSportsDB v1 API** as a verified source of truth and strictly using **Gemini Pro 3**, the system will analyze every potential bet through a holistic lens: synthesizing mathematical edge (EV) with real-time rosters, matchup stats, and situational news.

## Functional Requirements

### 1. Data Integrity Layer (TheSportsDB Integration)
- **Lazy-Loading Cache:** Implement a service to fetch team rosters and player statuses from TheSportsDB (v1) only when a game is scanned or queued.
- **Rate Limit Management:** Handle the 30 RPM limit of the free tier by caching results in Supabase or LocalStorage with a 24-hour TTL.
- **Roster & Trade Audit:** Verify active status of key players and recent team changes to ground the AI's "world knowledge" and eliminate hallucinations (e.g., outdated team rosters).

### 2. Professional Analysis Engine (Gemini Pro 3)
- **Model Mandate:** All scanning and deep analysis tasks must strictly use **Gemini Pro 3**. 
- **Holistic "Playable" Criteria:** A bet is only flagged as "Playable" if it passes a dual-validation:
    1. **Mathematical Edge:** Positive Expected Value (+EV) or justified probability based on odds (up to -175).
    2. **Qualitative Support:** Concrete justification from:
        - **Roster Integrity:** Verified active status of impact players.
        - **Matchup Edges:** Statistical dominance (e.g., Top-5 vs. Bottom-5 category ranks).
        - **Situational News:** Motivation traps, "must-win" narratives, and schedule fatigue.
- **Professional Synthesis Prompt:** Rebuild the AI persona to act as a senior handicapper who treats math as the floor and qualitative data as the ceiling.

### 3. Veto System Refinement
- **Data Quality Veto:** Automatically veto analysis if the AI's internal reasoning contradicts the fetched "Ground Truth" data from TheSportsDB.
- **Handicapper Audit:** The "Veto Reason" must cite specific stats or roster news for every recommendation, providing transparency for why a favorite or underdog is (or isn't) playable.

## Non-Functional Requirements
- **Latency Management:** Provide clear UI feedback as Gemini Pro 3 and TheSportsDB fetch may increase processing time.
- **Error Handling:** Graceful fallback to cached data or standard internal services if TheSportsDB hits the 429 rate limit.

## Acceptance Criteria
- [ ] AI no longer mentions outdated player/team pairings.
- [ ] Every "Playable" recommendation (Favorites and Underdogs) includes a "Handicapper Logic" section citing stats/news.
- [ ] The system identifies "Playable" favorites (odds -110 to -175) when supported by professional-grade logic.
- [ ] TheSportsDB integration successfully caches data and stays under 30 RPM.
- [ ] All analysis logs confirm the use of Gemini Pro 3.

## Out of Scope
- Premium features of TheSportsDB v2.
- Real-time "In-Game" injury tracking (focus is pre-game/scout window).
