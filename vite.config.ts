
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
      'process.env.ODDS_API_KEY': JSON.stringify(env.ODDS_API_KEY || "c99ceaaa8dd6ba6be5d5293bfe7be3da"),
      'process.env.SUPABASE_URL': JSON.stringify("https://thcstqwbinhbkpstcvme.supabase.co"),
      // Updated to match the working key from services/supabaseClient.ts
      'process.env.SUPABASE_KEY': JSON.stringify("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRoY3N0cXdiaW5oYmtwc3Rjdm1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYyNDQxMDIsImV4cCI6MjA4MTgyMDEwMn0.gdCn1H9MCPmoTPOo06m12QtzgWbTmpOqcX_bKSFLd_I"),
    },
  };
});
