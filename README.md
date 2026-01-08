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

This project is deployed to Google Cloud Run at:
**https://edgelab-92046617352.us-central1.run.app**

### Quick Redeploy

When you need to redeploy after making code changes:

**Step 1: Build the container image**
```bash
# Get your API keys from .env file, then run:
gcloud builds submit --config cloudbuild.yaml \
  --project gen-lang-client-0947461139 \
  --substitutions="_GEMINI_API_KEY=YOUR_GEMINI_KEY,_ODDS_API_KEY=YOUR_ODDS_KEY,_SUPABASE_URL=YOUR_SUPABASE_URL,_SUPABASE_KEY=YOUR_SUPABASE_KEY"
```

**Step 2: Deploy to Cloud Run**
```bash
gcloud run deploy edgelab \
  --image gcr.io/gen-lang-client-0947461139/edgelab2 \
  --project gen-lang-client-0947461139 \
  --region us-central1 \
  --allow-unauthenticated
```

### Notes
- Build typically takes 30-60 seconds
- Deploy takes another 30-60 seconds
- API keys are baked into the container at build time
- If you update API keys in `.env`, you must rebuild the container

