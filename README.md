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
gcloud builds submit --config cloudbuild.yaml \
  --project gen-lang-client-0947461139 \
  --substitutions="_GEMINI_API_KEY=AIzaSyAWsrEHiEUD4LYHMhvARh_grKGn_7JA3mE,_ODDS_API_KEY=c99ceaaa8dd6ba6be5d5293bfe7be3da,_SUPABASE_URL=https://thcstqwbinhbkpstcvme.supabase.co,_SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRoY3N0cXdiaW5oYmtwc3Rjdm1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYyNDQxMDIsImV4cCI6MjA4MTgyMDEwMn0.gdCn1H9MCPmoTPOo06m12QtzgWbTmpOqcX_bKSFLd_I"
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

