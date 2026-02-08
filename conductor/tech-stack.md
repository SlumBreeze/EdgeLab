# Tech Stack

## Frontend
- **Framework:** React 19
- **Build Tool:** Vite
- **Language:** TypeScript (Strict)
- **Styling:** Tailwind CSS (Dark Mode / Bloomberg-Terminal aesthetic)

## AI & Data
- **LLM:** Google Gemini 3 Pro (with 30s timeout and Flash fallback)
- **SDK:** `@google/genai`
- **Real-time Data:** The Odds API (NBA, NFL, NHL, NCAAB, SOCCER)
- **Ground Truth Data:** TheSportsDB v1 API (with lazy-loading cache)
- **External Services:** ESPN (via internal service)

## Backend & Persistence
- **Database:** Supabase (PostgreSQL)
- **Authentication:** Supabase Auth (Google OAuth)
- **Security:** Row Level Security (RLS)

## UI & Analytics
- **Charts:** Recharts
- **Icons:** Lucide React
- **State Management:** React Context + Custom Hooks
