<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/15eeRgNHhns6yFpzoOrZ6O5-HORKFVJt3

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

---

# Cloud Run Deployment Guide

This guide explains how to manage Cloud Run deployments from your IDE, migrated from AI Studio.

## 1. Setup for IDE Deployment

### Step A: Project Structure

The project is configured with a production server in `server/index.js` and a `Dockerfile` optimized for Vite + Express.

### Step B: The Server

The Express server in `server/index.js` listens on the port provided by Cloud Run (default `8080`).

### Step C: Environment Variables

The Gemini API key should be set as an environment variable in Cloud Run or passed during deployment.

- **Service Name**: `edgelab`
- **Project ID**: `92046617352` (gen-lang-client-0947461139)
- **Region**: `us-west1`

## 2. Deploying from IDE

To deploy your local changes to Cloud Run:

```powershell
# 1. Login (if not already)
gcloud auth login

# 2. Set your Project ID
gcloud config set project gen-lang-client-0947461139

# 3. Deploy
gcloud run deploy edgelab --source . --region us-west1
```

## 3. Quick Reference Commands

| Action                   | Command                                                                                           |
| :----------------------- | :------------------------------------------------------------------------------------------------ |
| **Check Active Project** | `gcloud config get-value project`                                                                 |
| **List All Services**    | `gcloud run services list`                                                                        |
| **View Service Logs**    | `gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=edgelab"` |
| **Stream Live Logs**     | `gcloud run services logs tail edgelab`                                                           |

> [!TIP]
> The `.gcloudignore` file is configured to exclude `node_modules` and other large folders to speed up building in the cloud.
