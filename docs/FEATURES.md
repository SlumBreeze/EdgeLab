# EdgeLab Features & Workflows

EdgeLab is designed to professionalize sports betting by combining mathematical edge finding ("Sharp Money") with AI-driven qualitative analysis.

## Core Workflows

### 1. Scout (The Feed)
The **Scout** tab is your daily dashboard. It displays the slate of games for supported sports (NBA, NFL, NHL, CFB, etc.).

*   **Line Movement:** Tracks the "Sharp" line (Pinnacle) movement.
    *   **Reference Line:** The opening or previous line.
    *   **Current Line:** Real-time sharp line.
    *   **Analysis:** Shows if sharps are moving toward a side (e.g., "Sharps on Lakers").
*   **Quick Scan (⚡):** Uses `Gemini 3 Flash` to rapidly search for injury reports and major roster news.
    *   Returns a signal: **RED** (Major Injury/Risk), **YELLOW** (Caution), or **WHITE** (Standard).
*   **Queueing:** One-click add to your analysis Queue.

### 2. Queue (Deep Analysis)
The **Queue** is where detailed handicapping happens.

*   **Math Analysis:**
    *   Compare "Sharp" odds (Pinnacle) against "Soft" book lines (DraftKings, FanDuel, etc.).
    *   Calculates **EV (Expected Value)** based on "No-Vig" sharp probabilities.
    *   **Screenshot Extraction:** Upload a screenshot of a sportsbook app, and Gemini will extract the odds automatically.
*   **AI "Veto" System:**
    *   Before recommending a play, the system runs a multi-step check:
        1.  **Price Veto:** Is the price too expensive (e.g., > -160)?
        2.  **Motivation Veto:** Does the reasoning rely on "must win" narratives vs. actual roster facts?
        3.  **Data Quality Veto:** Is there verified injury info?
    *   **Contradiction Check:** Ensures the AI's narrative aligns with its recommendation.
*   **Output:** Generates a "Playable" or "Pass" recommendation with a confidence score and reasoning.

### 3. Card (Tracking)
*   Manage your active bets.
*   Track results (W/L).
*   Visual summary of your daily exposure.

### 4. Bankroll Management
*   **Sync:** (Optional) Syncs with Supabase to persist your balance across devices.
*   **Visual Status:** The "Cloud" icon in the header indicates sync status (Blue=Saving, Green=Saved, Red=Error).

## AI Models Used

*   **Gemini 3 Pro:** Used for the deep "Holistic Analysis" (matching math edge with game script).
*   **Gemini 3 Flash:** Used for "Quick Scans" (fast injury checks).
*   **Gemini 2.5 Flash:** Used for OCR (Screenshot to Odds extraction).

## "Sharp" Logic
The app relies on the **Efficient Market Hypothesis**.
*   **Pinnacle** is treated as the "source of truth" for the true probability of an event.
*   We look for deviations in "Soft" books (recreational sportsbooks) that offer better prices than the Sharp "No-Vig" price.
