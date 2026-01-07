<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# EdgeLab - Sports Betting Analysis App

This app uses AI to analyze sports betting markets, identify positive value plays, and help manage your bankroll.

## Run Locally

**Prerequisites:**  Node.js v20+

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure Environment:
   - Copy `.env.example` to `.env`
   - Add your API keys (Gemini, Odds API, Supabase)
   ```bash
   cp .env.example .env
   ```

3. Run the app:
   ```bash
   npm run dev
   ```

## Deployment (Google Cloud Run)

This project is configured for deployment on Google Cloud Run using Google Cloud Build.

### Prerequisites
- Google Cloud CLI (`gcloud`) installed and authenticated.
- A Google Cloud Project with Cloud Run and Cloud Build APIs enabled.

### 1. Build the Container
Submit the build to Cloud Build. This securely bakes your API keys into the frontend application.

```bash
# Replace the placeholder values with your actual keys
gcloud builds submit --config cloudbuild.yaml \
  --project YOUR_PROJECT_ID \
  --substitutions="_GEMINI_API_KEY=your_key,_ODDS_API_KEY=your_key,_SUPABASE_URL=your_url,_SUPABASE_KEY=your_key"
```

### 2. Deploy to Cloud Run
Deploy the built image to a Cloud Run service.

```bash
gcloud run deploy edgelab2 \
  --image gcr.io/YOUR_PROJECT_ID/edgelab2 \
  --project YOUR_PROJECT_ID \
  --region us-central1 \
  --allow-unauthenticated
```

### Quick Re-deploy
If your API keys haven't changed, you can skip the build arguments in the build step, but you must ensure the `_VAR` substitutions are set or use the previously built image if no code changes occurred. Ideally, run both commands for a full update.

```