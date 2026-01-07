
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [react()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.ODDS_API_KEY': JSON.stringify(env.ODDS_API_KEY),
      'process.env.SUPABASE_URL': JSON.stringify(env.SUPABASE_URL),
      // CONFIRMED: Using the Anon Key (JWT) for client-side access
      'process.env.SUPABASE_KEY': JSON.stringify(env.SUPABASE_KEY),
    },
  };
});
