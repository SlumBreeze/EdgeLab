import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env');

try {
  if (!fs.existsSync(envPath)) {
    console.error('Error: .env file not found!');
    process.exit(1);
  }

  const envContent = fs.readFileSync(envPath, 'utf-8');
  const envVars = {};

  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    
    const [key, ...valueParts] = trimmed.split('=');
    if (key && valueParts.length > 0) {
      // Join back value parts in case the value contained '='
      const val = valueParts.join('=').trim();
      // Remove surrounding quotes if present
      const cleanVal = val.replace(/^["']|["']$/g, '');
      envVars[key.trim()] = cleanVal;
    }
  });

  const geminiKey = envVars['VITE_GEMINI_API_KEY'];
  const oddsKey = envVars['VITE_ODDS_API_KEY'];
  const supaUrl = envVars['VITE_SUPABASE_URL'];
  const supaKey = envVars['VITE_SUPABASE_ANON_KEY'];

  if (!supaUrl || !supaKey) {
      console.warn("WARNING: Supabase keys not found in .env. Deploying without sync support.");
  } else {
      console.log(`Found Supabase URL: ${supaUrl.substring(0, 15)}...`);
  }

  const projectId = 'gen-lang-client-0947461139'; // Hardcoded from previous context
  const substitutions = `_GEMINI_API_KEY=${geminiKey},_ODDS_API_KEY=${oddsKey},_SUPABASE_URL=${supaUrl},_SUPABASE_KEY=${supaKey}`;

  const buildCmd = `gcloud builds submit --config cloudbuild.yaml --project ${projectId} --substitutions="${substitutions}"`;

  console.log('Starting Cloud Build...');
  execSync(buildCmd, { stdio: 'inherit', shell: true });
  
  // After build, deploy
  const deployCmd = `gcloud run deploy edgelab-v2 --image gcr.io/${projectId}/edgelab2 --project ${projectId} --region us-central1 --allow-unauthenticated`;
  console.log('Deploying to Cloud Run...');
  execSync(deployCmd, { stdio: 'inherit', shell: true });

} catch (error) {
  console.error('Deployment failed:', error);
  process.exit(1);
}
