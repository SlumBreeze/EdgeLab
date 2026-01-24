# EdgeLab v3 - Developer Context

## Project Overview

EdgeLab is a professional-grade sports betting intelligence platform designed to eliminate emotional bias. It leverages **Google Gemini AI** and real-time market data to identify Positive Expected Value (+EV) plays.

The application functions as an "operating system" for handicappers, enforcing discipline through a rigorous "veto system" where AI agents audit potential bets for injuries, motivation traps, and narrative contradictions.

## 🛠 Tech Stack

- **Framework:** React 19 + TypeScript + Vite
- **Styling:** Tailwind CSS (Dark Mode / FanDuel-inspired)
- **State Management:** React Context + Hooks
- **AI/LLM:** Google Gemini 3 Flash & Pro (Preview) + Fallback to 2.0/1.5
- **Data Source:** The Odds API (Real-time odds), ESPN (via internal service)
- **Persistence:** Supabase (PostgreSQL)
- **Deployment:** Google Cloud Run (Dockerized)

## 📂 Architecture & Directory Structure

```
EdgeLab/
├── components/          # Reusable UI components
│   ├── tracker/         # Analytics & Bankroll components
│   └── ...              # Core UI (Cards, Modals, Toasts)
├── pages/               # Main application views
│   ├── Scout.tsx        # Rapid scanning of slates & line movements
│   ├── Queue.tsx        # Deep analysis & AI Veto workflow
│   ├── Card.tsx         # Daily "Battle Plan" (approved bets)
│   └── Tracker.tsx      # Bankroll management & history
├── services/            # External API integrations
│   ├── geminiService.ts # AI logic (Prompt engineering, Veto system)
│   ├── oddsService.ts   # Market data fetching & normalization
│   └── supabaseClient.ts# Database connection
├── hooks/               # Custom React Hooks
│   ├── useBankroll.ts   # State logic for funds/bet tracking
│   └── useGameContext.tsx # Global game data state
├── utils/               # Core business logic
│   ├── calculations.ts  # Kelly Criterion & EV math
│   └── analysisValidator.ts # Validation logic for AI outputs
└── types/               # TypeScript definitions
```

## 🚀 Key Workflows

### 1. The Veto System

A multi-stage validation process for every potential bet:

- **Price Veto:** Rejects odds that are too expensive (e.g., > -160).
- **Motivation Veto:** Flags "must win" narratives that lack data backing.
- **Data Quality Veto:** Ensures verified injury info exists.
- **Contradiction Check:** Validates that AI reasoning aligns with the final recommendation.

### 2. Line Shopping (Sharp vs. Soft)

The app compares odds from **Pinnacle** (The "Sharp" book, representing market truth) against **Soft** books (DraftKings, FanDuel, etc.) to calculate the true mathematical edge.

### 3. Bankroll Management

Implements **Kelly Criterion** principles to automatically calculate unit sizes (1-5%) based on the strength of the edge and the user's current bankroll.

### 4. Reliability & Sync

- **Smart Fallback:** AI calls attempt Gemini 3 models first, automatically degrading to 2.0/1.5 if overloaded (503).
- **Split Sync:** Heavy data (Slates) syncs separately from light data (Queue/Bets) to prevent network timeouts.
- **Scan Reset:** Users can clear stuck scan results for specific time windows.

## 💻 Development & Commands

### Setup

```bash
# Install dependencies
npm install

# Setup Environment
# Ensure .env contains:
# VITE_GEMINI_API_KEY, VITE_ODDS_API_KEY, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
```

### Run

```bash
# Start Development Server
npm run dev

# Build for Production
npm run build

# Preview Production Build
npm run preview
```

### Docker / Cloud Build

```bash
# Submit build to Google Cloud
gcloud builds submit --config cloudbuild.yaml
```

## 📝 Conventions & Standards

- **TypeScript:** Strict mode enabled. Define interfaces in `types/` or co-located if specific.
- **Components:** Functional components with named exports.
- **Async Logic:** All external calls (AI, Odds, DB) must be handled in `services/` and wrapped in `try/catch`.
- **Styling:** Use Tailwind utility classes. Avoid inline styles.
- **AI Prompts:** Located in `services/geminiService.ts`. When modifying prompts, ensure the JSON output structure remains consistent.

## ⚠️ Critical Constraints

- **Odds API Limits:** Caching is essential to avoid hitting API rate limits.
- **AI Latency:** The "Queue" analysis can take time. UI must provide feedback (spinners/toasts) during AI processing.
- **Data Integrity:** Never trust AI output blindly. The `analysisValidator.ts` utility helps verify structure, but logic should be "trust but verify".
