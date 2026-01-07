<div align="center">
<img width="1200" height="475" alt="EdgeLab Banner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# EdgeLab

**EdgeLab** is an advanced sports betting analysis platform that merges **Mathematical Edge Finding** with **AI-Powered Qualitative Research**.

It helps you identify value plays by comparing "Sharp" bookmaker lines against the market and validating them with Gemini AI agents that check for injuries, motivation traps, and narrative contradictions.

## 🚀 Quick Start

1.  **Clone & Install:**
    ```bash
    git clone <repo-url>
    cd edgelab
    npm install
    ```

2.  **Configure:**
    Copy `.env.example` to `.env` and add your keys (see [Setup Guide](docs/SETUP.md)).
    ```bash
    cp .env.example .env
    ```

3.  **Run:**
    ```bash
    npm run dev
    ```

## 📚 Documentation

*   **[Features & Workflows](docs/FEATURES.md):** Detailed guide on Scout, Queue, Math Logic, and the Veto System.
*   **[Setup & Config](docs/SETUP.md):** Environment variables and API keys.

## 🛠 Tech Stack

*   **Frontend:** React 19, Vite, Tailwind CSS
*   **AI:** Google Gemini (Pro & Flash models)
*   **Data:** The Odds API, Supabase (Persistence)

## ☁️ Deployment (Google Cloud Run)

This project is optimized for Google Cloud Run.

### 1. Build
```bash
gcloud builds submit --config cloudbuild.yaml \
  --project YOUR_PROJECT_ID \
  --substitutions="_GEMINI_API_KEY=key,_ODDS_API_KEY=key,_SUPABASE_URL=url,_SUPABASE_KEY=key"
```

### 2. Deploy
```bash
gcloud run deploy edgelab \
  --image gcr.io/YOUR_PROJECT_ID/edgelab \
  --project YOUR_PROJECT_ID \
  --region us-central1 \
  --allow-unauthenticated
```

