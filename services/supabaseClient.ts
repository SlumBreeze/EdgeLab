
import { createClient } from '@supabase/supabase-js';

// Access environment variables directly so Vite can statically replace them during build
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

// Only mark as configured if we have real values (not placeholders)
const isConfigured = !!(
  supabaseUrl && 
  supabaseKey && 
  !supabaseUrl.includes('placeholder')
);

console.log("[Supabase] URL:", supabaseUrl?.substring(0, 30) + "...");
console.log("[Supabase] Configured:", isConfigured);

if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase URL or Key is missing. Please check your .env file.");
}

export const supabase = createClient(supabaseUrl, supabaseKey);

export const isSupabaseConfigured = isConfigured;
