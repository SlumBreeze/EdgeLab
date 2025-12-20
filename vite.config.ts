
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY || env.API_KEY),
      'process.env.ODDS_API_KEY': JSON.stringify(env.ODDS_API_KEY || "c99ceaaa8dd6ba6be5d5293bfe7be3da"),
    },
  };
});
