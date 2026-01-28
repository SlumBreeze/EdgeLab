# Agent Persona & Rules

- **Tone:** Direct, concise, expert.
- **Output:** Code-first, minimal explanation.
- **Safety:** Confirm destructive actions.

## Technical Foundation

- **Stack:** React 19, TypeScript, Vite.
- **Package Mgmt:** `npm`.
- **Styling:** Tailwind CSS (custom tokens).
- **AI:** Google Gemini (via `@google/genai`).
- **Data:** The Odds API + Supabase (optional sync).

## Project Context

- **Domain:** Sports betting intelligence (Scout → Queue → Card → Tracker).
- **Supabase Project:** Use "SlumBreeze's Project" (ref `ekdcafbqwrbvxulutszx`) for EdgeLab. The "edgelab" Supabase project is paused and should not be used.
- **Timezone:** Slate dates are aligned to **America/New_York (ET)**. Do not use local timezone for slate grouping.

## Operational Rules

- **Ambiguity:** Ask clarifying questions.
- **File Paths:** Verify local existence.

## 🚀 Key Workflows

- **Scout:** Loads slates from Odds API, shows cadence windows, runs injury/news scans (Gemini).
- **Auto‑scan:** Optional toggle; scans games only when they enter First/Second/Lock windows.
- **Queue:** Auto‑analysis runs sequentially for `autoAnalyze` games; respects delay throttling.
- **Card:** Manual promotion/logging; no auto‑promotion by default.

## 💻 Development & Commands

- **Install:** `npm install`
- **Dev:** `npm run dev`
- **Build:** `npm run build`
- **Deploy:** `npm run deploy`

## 📝 Conventions

- **UI State:** Keep Scout/Queue/Card mounted (tab switch hides, doesn’t unmount).
- **Sync:** LocalStorage first, Supabase optional; avoid heavy sync on empty payloads.
- **LLM Calls:** Encapsulate in `services/geminiService.ts`.

## ⚠️ Constraints

- **API Limits:** Cache Odds API responses; avoid excessive refresh.
- **Latency:** Sequential analysis queue; do not parallelize Gemini calls.
- **Cost:** Prefer cached slates and minimize AI calls.
