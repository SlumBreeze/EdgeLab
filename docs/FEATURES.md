# EdgeLab Features & Workflows

EdgeLab is designed to professionalize sports betting by combining mathematical edge finding ("Sharp Money") with AI-driven qualitative analysis.

## App Structure

EdgeLab uses a **single-page application** with three main tabs:
*   **Scout** (🔍): Daily game feed and quick scans
*   **Queue** (📋): Deep analysis workflow
*   **Card** (🏆): Active bet tracking

**Fixed Header:**
*   **Cloud Sync Indicator:** Real-time visual feedback on Supabase sync status
*   **Bankroll Button (💰):** Quick access to bankroll management modal

**Bottom Navigation:**
*   Persistent tab bar for switching between workflows
*   Tabs remain mounted to preserve queue state during navigation

## Core Workflows

### 1. Scout (The Feed)
The **Scout** tab is your daily dashboard. It displays the slate of games for supported sports (NBA, NFL, NHL, CFB, etc.).

**Features:**
*   **Game Cards:** Each game is displayed in a dedicated `ScoutGameCard` component showing:
    *   Game time and teams
    *   **Line Movement:** Tracks the "Sharp" line (Pinnacle) movement.
        *   **Reference Line:** The opening or previous line (stored when first loaded).
        *   **Current Line:** Real-time sharp line.
        *   **Movement Indicator:** Shows if sharps are moving toward a side (e.g., "⬆️ Sharps on Lakers").
    *   **Color-Coded Border:** Red/Yellow/Gray left border indicates scan signal strength.
*   **Quick Scan (⚡):** Uses `Gemini 3 Flash` to rapidly search for injury reports and major roster news.
    *   Returns a signal: **RED** (Major Injury/Risk), **YELLOW** (Caution), or **WHITE** (Standard).
    *   Results are cached and displayed with emoji indicators (🔴/🟡/⚪).
*   **Batch Scanning:** "Scan All" button runs quick scans on all games without results.
*   **Queueing:** One-click "Add" button to send games to analysis Queue.
    *   Button shows "✓ Queue" if game is already queued.

### 2. Queue (Deep Analysis)
The **Queue** is where detailed handicapping happens.

**Analysis Workflow:**
1.  **Auto-Fetch Lines:** When you click "Quick Analyze":
    *   Fetches sharp lines (Pinnacle) from The Odds API.
    *   **Auto-Selects Soft Books:** Matches your active bankroll accounts and pulls their lines.
    *   Example: If you have DraftKings and FanDuel in your bankroll, only those books are compared.
2.  **Math Analysis:**
    *   Compares "Sharp" odds (Pinnacle) against matched "Soft" book lines.
    *   Calculates **EV (Expected Value)** based on "No-Vig" sharp probabilities.
    *   Shows line value in **points** (spread difference) and **cents** (juice difference).
3.  **Screenshot Extraction:** Upload a screenshot of a sportsbook app, and `Gemini 2.5 Flash` will extract the odds automatically.
4.  **AI "Veto" System:**
    *   Before recommending a play, the system runs a multi-step check:
        1.  **Price Veto:** Is the price too expensive (e.g., > -160)?
        2.  **Motivation Veto:** Does the reasoning rely on "must win" narratives vs. actual roster facts?
        3.  **Data Quality Veto:** Is there verified injury info?
    *   **Contradiction Check:** Ensures the AI's narrative aligns with its recommendation.
5.  **Output:** Generates a "Playable" or "Pass" recommendation with:
    *   Specific bet recommendation (e.g., "Buffalo Sabres Moneyline")
    *   Confidence level (HIGH/MEDIUM/LOW)
    *   Research summary (injuries, rest, matchup context)
    *   Veto reason if flagged as "PASS"

**Queue Management:**
*   **Sequential Processing:** Analyses run one at a time with delays to respect API rate limits.
*   **Swipeable Cards:** Swipe left to remove games from queue.
*   **Error Handling:** Shows error messages if lines are unavailable.

### 3. Card (Tracking)
*   Manage your active bets.
*   Track results (W/L).
*   Visual summary of your daily exposure.

### 4. Bankroll Management
Access the bankroll modal via the 💰 button in the top-right corner.

**Features:**
*   **Multiple Sportsbook Accounts:** Track balances across different sportsbooks (DraftKings, FanDuel, etc.).
*   **Unit Size Calculator:** Adjustable slider from 1% (Conservative) to 5% (Aggressive).
    *   Displays current unit size in dollars based on total bankroll.
    *   **Reset Button:** Quick reset to recommended 2% default.
*   **Visual Balance Distribution:** Color-coded bars show percentage allocation across books.
*   **Cross-Device Sync:**
    *   Syncs with Supabase to persist balances and settings.
    *   **Access Key:** Unique identifier shown in the modal for account access.
    *   **Magic Link:** Generate a URL to instantly sync on another device.
    *   **Switch Account:** Load a different user's data by pasting their access key.
*   **Cloud Status Indicator:** The cloud icon in the header shows sync status:
    *   **Blue (Pulsing):** Saving to cloud
    *   **Green (Glowing):** Successfully saved
    *   **Red (Glowing):** Sync error
    *   **Gray:** Idle (not syncing)

## AI Models Used

*   **Gemini 3 Pro:** Used for the deep "Holistic Analysis" (matching math edge with game script).
*   **Gemini 3 Flash:** Used for "Quick Scans" (fast injury checks).
*   **Gemini 2.5 Flash:** Used for OCR (Screenshot to Odds extraction).

## "Sharp" Logic
The app relies on the **Efficient Market Hypothesis**.
*   **Pinnacle** is treated as the "source of truth" for the true probability of an event.
*   We look for deviations in "Soft" books (recreational sportsbooks) that offer better prices than the Sharp "No-Vig" price.
